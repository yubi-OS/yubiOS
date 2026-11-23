#!/usr/bin/env python3
# SPDX-License-Identifier: LGPL-2.1-or-later
"""
yubios_attest.py - yubiOS Local, Mutual & Cloud-Quorum StrongBox Remote Attestation Library.

Combines:
1. Platform StrongBox: TPM 2.0 / ARM64 OP-TEE fTPM / Cloud Shielded vTPM (/dev/tpmrm0) via tpm2-tools
   (EK/AK provisioning, MakeCredential/ActivateCredential residency proof,
   TPMS_ATTEST PCR quotes over sha256:0,1,2,4,7,11,14,15, TCG eventlog digest,
   and monotonic clock/NV counter anti-rollback).
2. Owner StrongBox: YubiKey PIV (slot 9a/9c hardware PKCS#11 signing; software keys
   strictly gated behind explicit --piv-mode sim test mode) and OpenSSH ssh-agent
   hardware-backed signing (ssh-keygen -Y sign/verify with domain namespace 'yubios-attest-v1').
3. GrapheneOS Auditor-style TOFU pairing with a Single-Use Pairing Code
   (120-bit Crockford Base32 token, 5-minute TTL, burned on first use, HKDF
   transcript MAC) and per-peer 32-byte challenge_index persistent key binding.
4. Cloud Assured Node Triadic Quorum (node_role='cloud-vtpm', require_pair_quorum=True):
   Enforces 2-of-2 Local StrongBox Pair quorum at the daemon (disabling single-peer
   pairing/pinning) and requires an unexpired, single-use challenge issued for that
   specific pair before recording any quorum verification.
"""

import base64
import hashlib
import hmac
import json
import os
import platform
import secrets
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PROTOCOL_VERSION = 1
PROTOCOL_NAMESPACE = "yubios-attest-v1"
TPM_GENERATED_VALUE = 0xFF544347  # 'TCG' magic in TPMS_ATTEST
TPM_ST_ATTEST_QUOTE = 0x8018
DEFAULT_PCR_LIST = [0, 1, 2, 4, 7, 11, 14, 15]
PAIRING_TTL_SECONDS = 300
QUORUM_CHALLENGE_TTL_SECONDS = 120
CLOCK_SKEW_MS = 5 * 60 * 1000
CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

# OS Enforced Flags (modeled on GrapheneOS Auditor AttestationProtocol.java)
OS_FLAG_MEASURED_OS = 1 << 0
OS_FLAG_SECURE_BOOT_ENFORCED = 1 << 1
OS_FLAG_DM_VERITY_ACTIVE = 1 << 2
OS_FLAG_YUBIKEY_PIV_PRESENT = 1 << 3
OS_FLAG_SSH_AGENT_SK_PRESENT = 1 << 4
OS_FLAG_CHIPSEC_PASSED = 1 << 5
OS_FLAG_NO_VFIO_ENFORCED = 1 << 6

PIV_SLOT_PKCS11_IDS = {
    "9a": "01",
    "9e": "04",
    "9c": "02",
    "9d": "03",
}

DEFAULT_PKCS11_MODULES = (
    "/usr/lib64/libykcs11.so",
    "/usr/lib/x86_64-linux-gnu/libykcs11.so",
    "/usr/lib/aarch64-linux-gnu/libykcs11.so",
    "/usr/lib64/pkcs11/libykcs11.so",
    "/usr/lib/pkcs11/libykcs11.so",
    "/usr/lib64/p11-kit-proxy.so",
    "/usr/lib/x86_64-linux-gnu/p11-kit-proxy.so",
    "/usr/lib/aarch64-linux-gnu/p11-kit-proxy.so",
)


def hkdf_sha256(ikm: bytes, salt: bytes, info: bytes, length: int = 32) -> bytes:
    prk = hmac.new(salt if salt else b"\x00" * 32, ikm, hashlib.sha256).digest()
    t = b""
    okm = b""
    counter = 1
    while len(okm) < length:
        t = hmac.new(prk, t + info + bytes([counter]), hashlib.sha256).digest()
        okm += t
        counter += 1
    return okm[:length]


def encode_crockford(data: bytes) -> str:
    bits = int.from_bytes(data, "big")
    total_bits = len(data) * 8
    chars = []
    for shift in range(total_bits - 5, -1, -5):
        idx = (bits >> shift) & 0x1F
        chars.append(CROCKFORD_ALPHABET[idx])
    raw = "".join(chars)
    groups = [raw[i : i + 4] for i in range(0, len(raw), 4)]
    return "YUBI-" + "-".join(groups)


def normalize_pairing_code(code: str) -> str:
    cleaned = code.strip().upper().replace("-", "").replace(" ", "")
    if cleaned.startswith("YUBI"):
        cleaned = cleaned[4:]
    cleaned = cleaned.replace("O", "0").replace("I", "1").replace("L", "1")
    return cleaned


def compute_extra_data(
    challenge_hex: str, challenge_index_hex: str, peer_binding_hex: str = ""
) -> bytes:
    msg = f"{PROTOCOL_NAMESPACE}|{challenge_hex.lower()}|{challenge_index_index_norm(challenge_index_hex)}|{peer_binding_hex.lower()}"
    return hashlib.sha256(msg.encode("utf-8")).digest()


def challenge_index_index_norm(challenge_index_hex: str) -> str:
    return challenge_index_hex.strip().lower()


def pack_tpms_attest(
    qualified_signer: bytes,
    extra_data: bytes,
    clock_ms: int,
    reset_count: int,
    restart_count: int,
    safe: int,
    firmware_version: int,
    pcr_indices: List[int],
    pcr_digest: bytes,
) -> bytes:
    """
    Construct a canonical big-endian TCG TPMS_ATTEST binary structure (TPM_ST_ATTEST_QUOTE)
    starting with TPM_GENERATED_VALUE (0xff544347).
    """
    buf = bytearray()
    buf += struct.pack(">I", TPM_GENERATED_VALUE)
    buf += struct.pack(">H", TPM_ST_ATTEST_QUOTE)
    buf += struct.pack(">H", len(qualified_signer)) + qualified_signer
    buf += struct.pack(">H", len(extra_data)) + extra_data
    buf += struct.pack(">QIIB", clock_ms, reset_count, restart_count, safe & 0xFF)
    buf += struct.pack(">Q", firmware_version)
    bitmap = bytearray(3)
    for idx in pcr_indices:
        if 0 <= idx < 24:
            bitmap[idx // 8] |= 1 << (idx % 8)
    buf += struct.pack(">IHB", 1, 0x000B, 3) + bytes(bitmap)
    buf += struct.pack(">H", len(pcr_digest)) + pcr_digest
    return bytes(buf)


def unpack_tpms_attest(raw: bytes) -> Dict[str, Any]:
    """Parse and validate a binary TCG TPMS_ATTEST structure."""
    if len(raw) < 32:
        raise ValueError("TPMS_ATTEST truncated")
    off = 0
    (magic, attest_type) = struct.unpack_from(">IH", raw, off)
    off += 6
    if magic != TPM_GENERATED_VALUE:
        raise ValueError(f"Invalid TPMS_ATTEST magic: 0x{magic:08x} != 0xff544347")
    if attest_type != TPM_ST_ATTEST_QUOTE:
        raise ValueError(f"Unexpected TPMS_ATTEST type: 0x{attest_type:04x}")
    (qs_len,) = struct.unpack_from(">H", raw, off)
    off += 2
    qualified_signer = raw[off : off + qs_len]
    off += qs_len
    (ed_len,) = struct.unpack_from(">H", raw, off)
    off += 2
    extra_data = raw[off : off + ed_len]
    off += ed_len
    clock_ms, reset_count, restart_count, safe = struct.unpack_from(">QIIB", raw, off)
    off += 17
    (fw_ver,) = struct.unpack_from(">Q", raw, off)
    off += 8
    sel_count, hash_alg, size_of_select = struct.unpack_from(">IHB", raw, off)
    off += 7
    bitmap = raw[off : off + size_of_select]
    off += size_of_select
    selected_pcrs = []
    for byte_i, bval in enumerate(bitmap):
        for bit_i in range(8):
            if bval & (1 << bit_i):
                selected_pcrs.append(byte_i * 8 + bit_i)
    (dg_len,) = struct.unpack_from(">H", raw, off)
    off += 2
    pcr_digest = raw[off : off + dg_len]
    return {
        "magic": magic,
        "type": attest_type,
        "qualified_signer_hex": qualified_signer.hex(),
        "extra_data_hex": extra_data.hex(),
        "clock_ms": clock_ms,
        "reset_count": reset_count,
        "restart_count": restart_count,
        "safe": bool(safe),
        "firmware_version": fw_ver,
        "hash_alg": hash_alg,
        "selected_pcrs": selected_pcrs,
        "pcr_digest_hex": pcr_digest.hex(),
    }


def compute_pcr_composite_digest(pcr_map: Dict[str, str], indices: List[int]) -> bytes:
    concat = bytearray()
    for i in indices:
        hex_val = pcr_map.get(str(i)) or pcr_map.get(i)
        if not hex_val:
            raise ValueError(f"Missing PCR {i} in PCR bank")
        concat += bytes.fromhex(hex_val)
    return hashlib.sha256(bytes(concat)).digest()


class TPM2Engine:
    """
    Executes TPM 2.0 operations via the tpm2-tools CLI suite (against /dev/tpmrm0 or swtpm),
    with a deterministic OpenSSL + TCG TPMS_ATTEST fallback backend for container/CI environments
    where /dev/tpmrm0 is absent.
    """

    def __init__(self, state_dir: Path, tcti: Optional[str] = None, mode: str = "auto"):
        self.state_dir = Path(state_dir)
        self.keys_dir = self.state_dir / "tpm_keys"
        self.keys_dir.mkdir(parents=True, exist_ok=True)
        self.tcti = tcti or os.environ.get("TPM2TOOLS_TCTI", "device:/dev/tpmrm0")
        if mode == "auto":
            has_tpm_dev = os.path.exists("/dev/tpmrm0") or os.path.exists("/dev/tpm0") or "swtpm" in (self.tcti or "")
            has_tools = shutil.which("tpm2_quote") is not None or shutil.which("tpm2") is not None
            self.mode = "tpm2" if (has_tpm_dev and has_tools) else "sim"
        else:
            self.mode = mode
        self._init_identity()

    def _run_tpm2(self, tool: str, args: List[str], offline: bool = False) -> subprocess.CompletedProcess:
        env = os.environ.copy()
        if offline:
            env["TPM2TOOLS_TCTI"] = "none"
        else:
            env["TPM2TOOLS_TCTI"] = self.tcti
        cmd_bin = shutil.which(tool)
        if cmd_bin:
            argv = [cmd_bin] + args
        else:
            tpm2_mux = shutil.which("tpm2")
            if not tpm2_mux:
                raise RuntimeError(f"Neither {tool} nor multiplexed tpm2 binary found in PATH")
            sub = tool[5:] if tool.startswith("tpm2_") else tool
            argv = [tpm2_mux, sub] + args
        return subprocess.run(argv, env=env, capture_output=True, text=True, check=True)

    def _init_identity(self) -> None:
        self.ek_pub_pem = self.keys_dir / "ek_pub.pem"
        self.ek_priv_pem = self.keys_dir / "ek_priv_sim.pem"
        self.ak_pub_pem = self.keys_dir / "ak_pub.pem"
        self.ak_priv_pem = self.keys_dir / "ak_priv_sim.pem"
        self.ak_name_file = self.keys_dir / "ak.name"
        self.clock_file = self.state_dir / "tpm_clock_state.json"
        self.pcr_file = self.state_dir / "tpm_pcr_state.json"

        if self.mode == "tpm2":
            ek_ctx = self.keys_dir / "ek.ctx"
            ak_ctx = self.keys_dir / "ak.ctx"
            if not self.ak_pub_pem.exists():
                self._run_tpm2("tpm2_createek", ["-c", str(ek_ctx), "-G", "rsa", "-u", str(self.ek_pub_pem), "-f", "pem"])
                self._run_tpm2(
                    "tpm2_createak",
                    [
                        "-C", str(ek_ctx),
                        "-c", str(ak_ctx),
                        "-G", "rsa",
                        "-g", "sha256",
                        "-s", "rsassa",
                        "-u", str(self.ak_pub_pem),
                        "-f", "pem",
                        "-n", str(self.ak_name_file),
                    ],
                )
        else:
            if not self.ek_pub_pem.exists():
                subprocess.run(
                    ["openssl", "genrsa", "-out", str(self.ek_priv_pem), "2048"],
                    check=True, capture_output=True
                )
                os.chmod(self.ek_priv_pem, 0o600)
                subprocess.run(
                    ["openssl", "rsa", "-in", str(self.ek_priv_pem), "-pubout", "-out", str(self.ek_pub_pem)],
                    check=True, capture_output=True
                )
            if not self.ak_pub_pem.exists():
                subprocess.run(
                    ["openssl", "genrsa", "-out", str(self.ak_priv_pem), "2048"],
                    check=True, capture_output=True
                )
                os.chmod(self.ak_priv_pem, 0o600)
                subprocess.run(
                    ["openssl", "rsa", "-in", str(self.ak_priv_pem), "-pubout", "-out", str(self.ak_pub_pem)],
                    check=True, capture_output=True
                )
                ak_der = subprocess.run(
                    ["openssl", "rsa", "-pubin", "-in", str(self.ak_pub_pem), "-outform", "DER"],
                    check=True, capture_output=True
                ).stdout
                ak_name = b"\x00\x0b" + hashlib.sha256(ak_der).digest()
                self.ak_name_file.write_bytes(ak_name)

        if not self.clock_file.exists():
            self.clock_file.write_text(
                json.dumps(
                    {
                        "clock_ms": int(time.time() * 1000),
                        "reset_count": 1,
                        "restart_count": 0,
                        "nv_counter": 1,
                        "firmware_version": 0x00010008005C0000,
                    },
                    indent=2,
                )
            )

        if not self.pcr_file.exists():
            host_seed = self.state_dir.name.encode("utf-8")
            default_pcrs = {
                "0": hashlib.sha256(b"yubios-bl31-optee-ftpm-v1|" + host_seed).hexdigest(),
                "1": hashlib.sha256(b"yubios-platform-config-v1|" + host_seed).hexdigest(),
                "2": hashlib.sha256(b"yubios-drivers-none-v1").hexdigest(),
                "4": hashlib.sha256(b"yubios-systemd-boot-piv9a-v1").hexdigest(),
                "7": hashlib.sha256(b"yubios-secureboot-pk-kek-db-piv9a-enforced").hexdigest(),
                "11": hashlib.sha256(b"yubios-uki-composefs-sealed-v0.8.92").hexdigest(),
                "14": hashlib.sha256(b"yubios-shim-mok-empty").hexdigest(),
                "15": hashlib.sha256(b"yubios-luks2-root-fido2-cryptenroll").hexdigest(),
            }
            self.pcr_file.write_text(json.dumps(default_pcrs, indent=2))

    def get_random_hex(self, nbytes: int = 32) -> str:
        if self.mode == "tpm2":
            res = self._run_tpm2("tpm2_getrandom", ["--hex", str(nbytes)])
            return res.stdout.strip()
        return secrets.token_hex(nbytes)

    def read_pcrs(self, indices: List[int] = DEFAULT_PCR_LIST) -> Dict[str, str]:
        if self.mode == "tpm2":
            spec = "sha256:" + ",".join(str(i) for i in indices)
            res = self._run_tpm2("tpm2_pcrread", [spec])
            out: Dict[str, str] = {}
            for line in res.stdout.splitlines():
                line = line.strip()
                if ":" in line and not line.startswith("sha"):
                    k, v = line.split(":", 1)
                    k = k.strip()
                    v = v.strip().lower().replace("0x", "")
                    if k.isdigit():
                        out[k] = v
            if out:
                return out
        pcrs = json.loads(self.pcr_file.read_text())
        return {str(i): pcrs[str(i)] for i in indices}

    def pcr_extend(self, index: int, data: bytes) -> str:
        digest = hashlib.sha256(data).hexdigest()
        if self.mode == "tpm2":
            self._run_tpm2("tpm2_pcrextend", [f"{index}:sha256={digest}"])
            return self.read_pcrs([index])[str(index)]
        pcrs = json.loads(self.pcr_file.read_text())
        prev = bytes.fromhex(pcrs.get(str(index), "00" * 32))
        new_val = hashlib.sha256(prev + bytes.fromhex(digest)).hexdigest()
        pcrs[str(index)] = new_val
        self.pcr_file.write_text(json.dumps(pcrs, indent=2))
        return new_val

    def read_clock_and_increment(self) -> Dict[str, int]:
        st = json.loads(self.clock_file.read_text())
        now_ms = int(time.time() * 1000)
        st["clock_ms"] = max(st["clock_ms"] + 1, now_ms)
        st["nv_counter"] = st.get("nv_counter", 1) + 1
        self.clock_file.write_text(json.dumps(st, indent=2))
        return st

    def get_public_identity(self) -> Dict[str, str]:
        ek_pem = self.ek_pub_pem.read_text()
        ak_pem = self.ak_pub_pem.read_text()
        ak_name_hex = self.ak_name_file.read_bytes().hex()
        ek_fp = hashlib.sha256(ek_pem.encode("utf-8")).hexdigest()
        ak_fp = hashlib.sha256(ak_pem.encode("utf-8")).hexdigest()
        return {
            "tcti_mode": self.mode,
            "ek_pub_pem": ek_pem,
            "ak_pub_pem": ak_pem,
            "ak_name_hex": ak_name_hex,
            "ek_fingerprint_sha256": ek_fp,
            "ak_fingerprint_sha256": ak_fp,
        }

    def make_credential(self, peer_ek_pub_pem: str, peer_ak_name_hex: str) -> Tuple[str, str]:
        secret_bytes = secrets.token_bytes(32)
        if self.mode == "tpm2" and shutil.which("tpm2_makecredential"):
            with tempfile.TemporaryDirectory() as td:
                ek_f = Path(td) / "peer_ek.pem"
                sec_f = Path(td) / "secret.bin"
                out_f = Path(td) / "cred.blob"
                ek_f.write_text(peer_ek_pub_pem)
                sec_f.write_bytes(secret_bytes)
                self._run_tpm2(
                    "tpm2_makecredential",
                    ["-T", "none", "-e", str(ek_f), "-s", str(sec_f), "-n", peer_ak_name_hex, "-o", str(out_f)],
                    offline=True,
                )
                return secret_bytes.hex(), base64.b64encode(out_f.read_bytes()).decode("ascii")

        with tempfile.TemporaryDirectory() as td:
            ek_f = Path(td) / "peer_ek.pem"
            in_f = Path(td) / "in.bin"
            out_f = Path(td) / "out.bin"
            ek_f.write_text(peer_ek_pub_pem)
            payload = hashlib.sha256(bytes.fromhex(peer_ak_name_hex)).digest() + secret_bytes
            in_f.write_bytes(payload)
            subprocess.run(
                [
                    "openssl", "pkeyutl", "-encrypt",
                    "-pubin", "-inkey", str(ek_f),
                    "-pkeyopt", "rsa_padding_mode:oaep",
                    "-pkeyopt", "rsa_oaep_md:sha256",
                    "-in", str(in_f), "-out", str(out_f),
                ],
                check=True, capture_output=True,
            )
            return secret_bytes.hex(), base64.b64encode(out_f.read_bytes()).decode("ascii")

    def activate_credential(self, cred_blob_b64: str) -> str:
        blob = base64.b64decode(cred_blob_b64)
        if self.mode == "tpm2" and (self.keys_dir / "ek.ctx").exists():
            with tempfile.TemporaryDirectory() as td:
                in_f = Path(td) / "cred.blob"
                out_f = Path(td) / "secret.bin"
                sess_f = Path(td) / "ek_sess.ctx"
                in_f.write_bytes(blob)
                self._run_tpm2("tpm2_startauthsession", ["--policy-session", "-S", str(sess_f)])
                try:
                    self._run_tpm2("tpm2_policysecret", ["-S", str(sess_f), "-c", "e"])
                    self._run_tpm2(
                        "tpm2_activatecredential",
                        [
                            "-c", str(self.keys_dir / "ak.ctx"),
                            "-C", str(self.keys_dir / "ek.ctx"),
                            "-i", str(in_f),
                            "-o", str(out_f),
                            "-P", f"session:{sess_f}",
                        ],
                    )
                finally:
                    self._run_tpm2("tpm2_flushcontext", [str(sess_f)])
                return out_f.read_bytes().hex()

        with tempfile.TemporaryDirectory() as td:
            in_f = Path(td) / "in.bin"
            out_f = Path(td) / "out.bin"
            in_f.write_bytes(blob)
            subprocess.run(
                [
                    "openssl", "pkeyutl", "-decrypt",
                    "-inkey", str(self.ek_priv_pem),
                    "-pkeyopt", "rsa_padding_mode:oaep",
                    "-pkeyopt", "rsa_oaep_md:sha256",
                    "-in", str(in_f), "-out", str(out_f),
                ],
                check=True, capture_output=True,
            )
            decrypted = out_f.read_bytes()
            expected_prefix = hashlib.sha256(self.ak_name_file.read_bytes()).digest()
            if len(decrypted) != 64 or not hmac.compare_digest(decrypted[:32], expected_prefix):
                raise ValueError("ActivateCredential failed: AK name binding mismatch")
            return decrypted[32:].hex()

    def quote(
        self,
        challenge_hex: str,
        challenge_index_hex: str,
        peer_binding_hex: str = "",
        pcr_indices: List[int] = DEFAULT_PCR_LIST,
    ) -> Dict[str, Any]:
        extra_data = compute_extra_data(challenge_hex, challenge_index_hex, peer_binding_hex)
        pcr_map = self.read_pcrs(pcr_indices)
        pcr_digest = compute_pcr_composite_digest(pcr_map, pcr_indices)
        clk = self.read_clock_and_increment()

        if self.mode == "tpm2" and (self.keys_dir / "ak.ctx").exists():
            with tempfile.TemporaryDirectory() as td:
                msg_f = Path(td) / "quote.msg"
                sig_f = Path(td) / "quote.sig"
                pcr_f = Path(td) / "quote.pcrs"
                pcr_spec = "sha256:" + ",".join(str(i) for i in pcr_indices)
                self._run_tpm2(
                    "tpm2_quote",
                    [
                        "-c", str(self.keys_dir / "ak.ctx"),
                        "-l", pcr_spec,
                        "-q", extra_data.hex(),
                        "-m", str(msg_f),
                        "-s", str(sig_f),
                        "-o", str(pcr_f),
                        "-g", "sha256",
                        "-f", "plain",
                    ],
                )
                tpms_bytes = msg_f.read_bytes()
                sig_bytes = sig_f.read_bytes()
        else:
            tpms_bytes = pack_tpms_attest(
                qualified_signer=self.ak_name_file.read_bytes(),
                extra_data=extra_data,
                clock_ms=clk["clock_ms"],
                reset_count=clk["reset_count"],
                restart_count=clk["restart_count"],
                safe=1,
                firmware_version=clk["firmware_version"],
                pcr_indices=pcr_indices,
                pcr_digest=pcr_digest,
            )
            with tempfile.TemporaryDirectory() as td:
                msg_f = Path(td) / "quote.msg"
                sig_f = Path(td) / "quote.sig"
                msg_f.write_bytes(tpms_bytes)
                subprocess.run(
                    [
                        "openssl", "dgst", "-sha256",
                        "-sign", str(self.ak_priv_pem),
                        "-out", str(sig_f),
                        str(msg_f),
                    ],
                    check=True, capture_output=True,
                )
                sig_bytes = sig_f.read_bytes()

        eventlog_path = Path("/sys/kernel/security/tpm0/binary_bios_measurements")
        if eventlog_path.exists():
            try:
                ev_sha256 = hashlib.sha256(eventlog_path.read_bytes()).hexdigest()
            except Exception:
                ev_sha256 = hashlib.sha256(pcr_digest).hexdigest()
        else:
            ev_sha256 = hashlib.sha256(b"yubios-eventlog-v1|" + pcr_digest).hexdigest()

        return {
            "tpms_attest_b64": base64.b64encode(tpms_bytes).decode("ascii"),
            "quote_sig_b64": base64.b64encode(sig_bytes).decode("ascii"),
            "extra_data_hex": extra_data.hex(),
            "pcr_indices": pcr_indices,
            "pcr_sha256": pcr_map,
            "pcr_composite_sha256": pcr_digest.hex(),
            "eventlog_sha256": ev_sha256,
            "clock_ms": clk["clock_ms"],
            "reset_count": clk["reset_count"],
            "restart_count": clk["restart_count"],
            "nv_counter": clk["nv_counter"],
        }

    @staticmethod
    def verify_quote(
        ak_pub_pem: str,
        tpms_attest_b64: str,
        quote_sig_b64: str,
        expected_challenge_hex: str,
        expected_challenge_index_hex: str,
        expected_peer_binding_hex: str,
        pcr_sha256: Dict[str, str],
        pcr_indices: List[int],
    ) -> Dict[str, Any]:
        tpms_bytes = base64.b64decode(tpms_attest_b64)
        sig_bytes = base64.b64decode(quote_sig_b64)

        with tempfile.TemporaryDirectory() as td:
            pub_f = Path(td) / "ak_pub.pem"
            msg_f = Path(td) / "quote.msg"
            sig_f = Path(td) / "quote.sig"
            pub_f.write_text(ak_pub_pem)
            msg_f.write_bytes(tpms_bytes)
            sig_f.write_bytes(sig_bytes)
            res = subprocess.run(
                [
                    "openssl", "dgst", "-sha256",
                    "-verify", str(pub_f),
                    "-signature", str(sig_f),
                    str(msg_f),
                ],
                capture_output=True, text=True,
            )
            if res.returncode != 0:
                raise ValueError(f"TPM2 quote signature verification failed: {res.stderr.strip()}")

        parsed = unpack_tpms_attest(tpms_bytes)
        expected_extra = compute_extra_data(
            expected_challenge_hex, expected_challenge_index_hex, expected_peer_binding_hex
        ).hex()
        if not hmac.compare_digest(parsed["extra_data_hex"], expected_extra):
            raise ValueError(
                f"TPMS_ATTEST extraData mismatch: got {parsed['extra_data_hex']}, expected {expected_extra}"
            )

        calc_pcr_digest = compute_pcr_composite_digest(pcr_sha256, pcr_indices).hex()
        if not hmac.compare_digest(parsed["pcr_digest_hex"], calc_pcr_digest):
            raise ValueError(
                f"TPMS_ATTEST PCR composite digest mismatch: got {parsed['pcr_digest_hex']}, expected {calc_pcr_digest}"
            )

        return parsed


class YubiKeyStrongBox:
    """
    Handles YubiKey PIV local attestation co-signing (slot 9a/9c) and
    SSH-agent hardware key signing/verification (ssh-keygen -Y sign/verify).

    Security invariant:
    - In production mode (`piv_mode == "pkcs11"`, the default), NEVER generate a
      local software EC private key (`piv_9a_key.pem`). PIV signing uses the
      physical YubiKey token's slot via PKCS#11 (`libykcs11.so` / `pkcs11-tool` /
      OpenSSL PKCS#11 provider/engine) and fails closed if the token is absent.
    - Software simulation keys are created and used ONLY when `piv_mode == "sim"`
      is explicitly passed for hermetic unit/CI tests, and bundles signed in `sim`
      mode are tagged `"piv_mode": "sim"` and rejected by production verifiers.
    """

    def __init__(self, state_dir: Path, piv_slot: str = "9a", piv_mode: Optional[str] = None):
        self.state_dir = Path(state_dir)
        self.piv_dir = self.state_dir / "yubikey_piv"
        self.piv_dir.mkdir(parents=True, exist_ok=True)
        self.piv_slot = piv_slot.lower()
        resolved_mode = (piv_mode or os.environ.get("YUBIOS_ATTEST_PIV_MODE", "pkcs11")).strip().lower()
        if resolved_mode not in ("pkcs11", "sim"):
            raise ValueError(f"Invalid piv_mode '{resolved_mode}': expected 'pkcs11' or 'sim'")
        self.piv_mode = resolved_mode
        self.piv_priv = self.piv_dir / f"piv_{self.piv_slot}_sim_key.pem"
        self.piv_pub = self.piv_dir / f"piv_{self.piv_slot}_pub.pem"
        self.piv_cert = self.piv_dir / f"piv_{self.piv_slot}_cert.pem"
        self._ensure_piv_material()

    @staticmethod
    def _find_pkcs11_module() -> Optional[str]:
        env_mod = os.environ.get("YUBIOS_PKCS11_MODULE") or os.environ.get("PKCS11_MODULE_PATH")
        if env_mod and os.path.exists(env_mod):
            return env_mod
        for candidate in DEFAULT_PKCS11_MODULES:
            if os.path.exists(candidate):
                return candidate
        return None

    def _export_hardware_cert_and_pubkey(self) -> bool:
        if not self.piv_cert.exists() and shutil.which("ykman"):
            for subcmd in (
                ["ykman", "piv", "certificates", "export", self.piv_slot, str(self.piv_cert)],
                ["ykman", "piv", "export-cert", self.piv_slot, str(self.piv_cert)],
            ):
                try:
                    res = subprocess.run(subcmd, capture_output=True, text=True, timeout=5)
                    if res.returncode == 0 and self.piv_cert.exists() and self.piv_cert.stat().st_size > 0:
                        break
                except Exception:
                    pass

        if self.piv_cert.exists() and self.piv_cert.stat().st_size > 0 and not self.piv_pub.exists():
            res = subprocess.run(
                ["openssl", "x509", "-in", str(self.piv_cert), "-pubkey", "-noout", "-out", str(self.piv_pub)],
                capture_output=True, text=True,
            )
            if res.returncode != 0:
                self.piv_pub.unlink(missing_ok=True)
                return False

        return self.piv_cert.exists() and self.piv_pub.exists()

    def _ensure_piv_material(self) -> None:
        if self.piv_mode == "pkcs11":
            if self.piv_priv.exists():
                self.piv_priv.unlink(missing_ok=True)
            self._export_hardware_cert_and_pubkey()
            return

        if not self.piv_pub.exists() or not self.piv_priv.exists() or not self.piv_cert.exists():
            subprocess.run(
                ["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(self.piv_priv)],
                check=True, capture_output=True,
            )
            os.chmod(self.piv_priv, 0o600)
            subprocess.run(
                ["openssl", "ec", "-in", str(self.piv_priv), "-pubout", "-out", str(self.piv_pub)],
                check=True, capture_output=True,
            )
            cnf_f = self.piv_dir / "openssl_piv.cnf"
            cnf_f.write_text(
                "[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=yubiOS-PIV-Sim-Slot-"
                + self.piv_slot
                + "\nO=yubi-OS-Test\n"
            )
            subprocess.run(
                [
                    "openssl", "req", "-new", "-x509",
                    "-config", str(cnf_f),
                    "-key", str(self.piv_priv),
                    "-out", str(self.piv_cert),
                    "-days", "3650",
                ],
                check=True, capture_output=True,
            )

    def is_piv_available(self) -> bool:
        if self.piv_mode == "pkcs11":
            mod = self._find_pkcs11_module()
            if not mod:
                return False
            return self._export_hardware_cert_and_pubkey()
        return self.piv_cert.exists() and self.piv_pub.exists() and self.piv_priv.exists()

    def get_piv_fingerprint_sha256(self) -> Optional[str]:
        if self.piv_pub.exists() and self.piv_pub.stat().st_size > 0:
            return hashlib.sha256(self.piv_pub.read_bytes()).hexdigest()
        return None

    def _sign_piv_pkcs11(self, payload_bytes: bytes) -> bytes:
        if not self._export_hardware_cert_and_pubkey():
            raise RuntimeError(
                f"Hardware YubiKey PIV certificate for slot {self.piv_slot} not present; "
                "cannot sign in production piv_mode=pkcs11"
            )
        pkcs11_mod = self._find_pkcs11_module()
        if not pkcs11_mod:
            raise RuntimeError(
                "No YubiKey PKCS#11 module (libykcs11.so / YUBIOS_PKCS11_MODULE) found for hardware PIV signing"
            )
        slot_id = PIV_SLOT_PKCS11_IDS.get(self.piv_slot, "01")
        pin = os.environ.get("YUBIOS_PIV_PIN")
        pkcs11_uri = f"pkcs11:id=%{slot_id};type=private"
        if pin:
            pkcs11_uri += f"?pin-value={pin}"

        with tempfile.TemporaryDirectory() as td:
            in_f = Path(td) / "payload.bin"
            sig_f = Path(td) / "payload.sig"
            in_f.write_bytes(payload_bytes)

            if shutil.which("pkcs11-tool"):
                cmd = [
                    "pkcs11-tool",
                    "--module", pkcs11_mod,
                    "--sign",
                    "--id", slot_id,
                    "--mechanism", "ECDSA-SHA256",
                    "--signature-format", "openssl",
                    "-i", str(in_f),
                    "-o", str(sig_f),
                ]
                if pin:
                    cmd.extend(["--pin", pin])
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode == 0 and sig_f.exists() and sig_f.stat().st_size > 0:
                    return sig_f.read_bytes()

            env = os.environ.copy()
            env["PKCS11_MODULE_PATH"] = pkcs11_mod
            for ossl_cmd in (
                [
                    "openssl", "dgst", "-sha256",
                    "-provider", "pkcs11", "-provider", "default",
                    "-sign", pkcs11_uri,
                    "-out", str(sig_f),
                    str(in_f),
                ],
                [
                    "openssl", "dgst", "-sha256",
                    "-engine", "pkcs11", "-keyform", "engine",
                    "-sign", pkcs11_uri,
                    "-out", str(sig_f),
                    str(in_f),
                ],
            ):
                res = subprocess.run(ossl_cmd, env=env, capture_output=True, text=True)
                if res.returncode == 0 and sig_f.exists() and sig_f.stat().st_size > 0:
                    return sig_f.read_bytes()

        raise RuntimeError(
            f"Hardware YubiKey PIV signing via PKCS#11 slot {self.piv_slot} (id=%{slot_id}) failed"
        )

    def sign_piv(self, payload_bytes: bytes) -> Dict[str, str]:
        if self.piv_mode == "pkcs11":
            sig_bytes = self._sign_piv_pkcs11(payload_bytes)
        else:
            with tempfile.TemporaryDirectory() as td:
                in_f = Path(td) / "payload.bin"
                sig_f = Path(td) / "payload.sig"
                in_f.write_bytes(payload_bytes)
                subprocess.run(
                    ["openssl", "dgst", "-sha256", "-sign", str(self.piv_priv), "-out", str(sig_f), str(in_f)],
                    check=True, capture_output=True,
                )
                sig_bytes = sig_f.read_bytes()

        sig_b64 = base64.b64encode(sig_bytes).decode("ascii")
        cert_pem = self.piv_cert.read_text()
        pub_pem = self.piv_pub.read_text()
        return {
            "slot": self.piv_slot,
            "piv_mode": self.piv_mode,
            "alg": "ECDSA-P256-SHA256",
            "piv_pub_pem": pub_pem,
            "piv_cert_pem": cert_pem,
            "piv_fingerprint_sha256": hashlib.sha256(pub_pem.encode("utf-8")).hexdigest(),
            "signature_b64": sig_b64,
        }

    @staticmethod
    def verify_piv(payload_bytes: bytes, piv_block: Dict[str, str], allow_sim_piv: bool = False) -> bool:
        block_mode = piv_block.get("piv_mode", "pkcs11")
        if block_mode == "sim" and not allow_sim_piv:
            raise ValueError(
                "YubiKey PIV verification rejected simulated software key signature (piv_mode=sim) in production mode"
            )
        pub_pem = piv_block["piv_pub_pem"]
        sig_bytes = base64.b64decode(piv_block["signature_b64"])
        with tempfile.TemporaryDirectory() as td:
            pub_f = Path(td) / "piv_pub.pem"
            in_f = Path(td) / "payload.bin"
            sig_f = Path(td) / "payload.sig"
            pub_f.write_text(pub_pem)
            in_f.write_bytes(payload_bytes)
            sig_f.write_bytes(sig_bytes)
            res = subprocess.run(
                ["openssl", "dgst", "-sha256", "-verify", str(pub_f), "-signature", str(sig_f), str(in_f)],
                capture_output=True, text=True,
            )
            if res.returncode != 0:
                raise ValueError(f"YubiKey PIV signature verification failed: {res.stderr.strip()}")
        return True

    def get_ssh_agent_pubkey(self, auth_sock: Optional[str] = None) -> Optional[str]:
        env = os.environ.copy()
        if auth_sock:
            env["SSH_AUTH_SOCK"] = auth_sock
        if env.get("SSH_AUTH_SOCK"):
            res = subprocess.run(["ssh-add", "-L"], env=env, capture_output=True, text=True)
            if res.returncode == 0 and res.stdout.strip():
                lines = [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]
                for ln in lines:
                    if "sk-" in ln or "piv" in ln.lower() or "yubi" in ln.lower():
                        return ln
                return lines[0]
        if self.piv_mode == "sim":
            test_key = env.get("YUBIOS_ATTEST_TEST_SSH_KEY")
            if test_key and Path(test_key + ".pub").exists():
                return Path(test_key + ".pub").read_text().strip()
        return None

    def sign_ssh_agent(self, payload_bytes: bytes, principal: str, auth_sock: Optional[str] = None) -> Dict[str, str]:
        pubkey = self.get_ssh_agent_pubkey(auth_sock)
        if not pubkey:
            raise RuntimeError("No YubiKey SSH key available in SSH_AUTH_SOCK")
        env = os.environ.copy()
        if auth_sock:
            env["SSH_AUTH_SOCK"] = auth_sock
        with tempfile.TemporaryDirectory() as td:
            pub_f = Path(td) / "signer.pub"
            msg_f = Path(td) / "message.bin"
            pub_f.write_text(pubkey + "\n")
            msg_f.write_bytes(payload_bytes)
            sign_key_arg = str(pub_f)
            if not env.get("SSH_AUTH_SOCK") and self.piv_mode == "sim" and env.get("YUBIOS_ATTEST_TEST_SSH_KEY"):
                sign_key_arg = env["YUBIOS_ATTEST_TEST_SSH_KEY"]
            subprocess.run(
                [
                    "ssh-keygen", "-Y", "sign",
                    "-f", sign_key_arg,
                    "-n", PROTOCOL_NAMESPACE,
                    str(msg_f),
                ],
                env=env, check=True, capture_output=True, text=True,
            )
            sig_f = Path(str(msg_f) + ".sig")
            ssh_sig = sig_f.read_text()
        fp = hashlib.sha256(pubkey.split()[1].encode("ascii")).hexdigest()
        return {
            "principal": principal,
            "namespace": PROTOCOL_NAMESPACE,
            "ssh_pubkey": pubkey,
            "ssh_pubkey_fingerprint": fp,
            "sshsig_armored": ssh_sig,
        }

    @staticmethod
    def verify_ssh_agent(payload_bytes: bytes, ssh_block: Dict[str, str]) -> bool:
        pubkey = ssh_block["ssh_pubkey"].strip()
        principal = ssh_block["principal"]
        sshsig = ssh_block["sshsig_armored"]
        with tempfile.TemporaryDirectory() as td:
            allowed_f = Path(td) / "allowed_signers"
            sig_f = Path(td) / "message.sig"
            allowed_f.write_text(f"{principal} {pubkey}\n")
            sig_f.write_text(sshsig)
            res = subprocess.run(
                [
                    "ssh-keygen", "-Y", "verify",
                    "-f", str(allowed_f),
                    "-I", principal,
                    "-n", PROTOCOL_NAMESPACE,
                    "-s", str(sig_f),
                ],
                input=payload_bytes,
                capture_output=True,
            )
            if res.returncode != 0:
                raise ValueError(
                    f"SSH-agent YubiKey signature verification failed: {res.stderr.decode('utf-8', 'replace').strip()}"
                )
        return True


class AttestDaemonCore:
    """
    Core stateful engine running inside yubiOS-attestd.
    Manages:
    - TPM2Engine (/dev/tpmrm0 or simulator)
    - YubiKeyStrongBox (PIV slot 9a/9c via PKCS#11 + SSH_AUTH_SOCK)
    - Single-use pairing codes (/run/yubiOS-attest/pairings/)
    - Pinned peer profiles (/var/lib/yubiOS-attest/peers/)
    - Cloud Assured Node 2-of-2 Local StrongBox Pair quorum enforcement &
      single-use quorum challenges (/run/yubiOS-attest/challenges/qverify_*.json)
    """

    def __init__(
        self,
        state_dir: Path,
        run_dir: Path,
        host_id: Optional[str] = None,
        tpm_mode: str = "auto",
        piv_slot: str = "9a",
        piv_mode: Optional[str] = None,
        os_version: str = "45.20261114.0",
        node_role: Optional[str] = None,
        require_pair_quorum: Optional[bool] = None,
        sysroot: Optional[Path] = None,
    ):
        self.state_dir = Path(state_dir)
        self.run_dir = Path(run_dir)
        self.peers_dir = self.state_dir / "peers"
        self.pairings_dir = self.run_dir / "pairings"
        self.challenges_dir = self.run_dir / "challenges"
        for d in (self.state_dir, self.run_dir, self.peers_dir, self.pairings_dir, self.challenges_dir):
            d.mkdir(parents=True, exist_ok=True)
        self.host_id = host_id or socket.gethostname()
        self.os_version = os_version
        self.node_role = node_role or os.environ.get("YUBIOS_NODE_ROLE", "strongbox")
        env_quorum = os.environ.get("YUBIOS_ATTEST_REQUIRE_PAIR_QUORUM")
        if require_pair_quorum is not None:
            self.require_pair_quorum = bool(require_pair_quorum)
        elif env_quorum is not None and env_quorum.strip() != "":
            self.require_pair_quorum = env_quorum.strip().lower() in ("1", "true", "yes")
        else:
            self.require_pair_quorum = self.node_role == "cloud-vtpm"
        raw_arch = os.environ.get("YUBIOS_ARCH") or platform.machine()
        self.arch = (
            "amd64"
            if raw_arch in ("x86_64", "amd64")
            else ("arm64" if raw_arch in ("aarch64", "arm64") else raw_arch)
        )
        self.sysroot = Path(sysroot or os.environ.get("YUBIOS_ATTEST_SYSROOT", "/"))
        self.tpm = TPM2Engine(self.state_dir, mode=tpm_mode)
        self.yk = YubiKeyStrongBox(self.state_dir, piv_slot=piv_slot, piv_mode=piv_mode)
        self._lock = threading.Lock()

    def _read_efivar_byte(self, prefix: str) -> Optional[int]:
        efivars_dir = self.sysroot / "sys/firmware/efi/efivars"
        if not efivars_dir.is_dir():
            return None
        for entry in sorted(efivars_dir.iterdir()):
            if entry.name.startswith(prefix):
                try:
                    raw = entry.read_bytes()
                    if len(raw) >= 5:
                        return raw[4]
                except Exception:
                    return None
        return None

    def _is_composefs_root_mounted(self) -> bool:
        cmdline_path = self.sysroot / "proc/cmdline"
        mounts_path = self.sysroot / "proc/mounts"
        if not cmdline_path.is_file() or not mounts_path.is_file():
            return False
        try:
            cmdline = cmdline_path.read_text(errors="replace")
            mounts = mounts_path.read_text(errors="replace")
        except Exception:
            return False

        has_composefs_karg = False
        for tok in cmdline.split():
            if tok.startswith("composefs=") and len(tok.split("=", 1)[1].strip()) > 0:
                has_composefs_karg = True
                break
        if not has_composefs_karg:
            return False

        for line in mounts.splitlines():
            parts = line.split()
            if len(parts) >= 4:
                src, mnt, fstype, opts = parts[0], parts[1], parts[2], parts[3]
                if mnt in ("/", "/sysroot"):
                    if fstype == "composefs" or "composefs" in src or "verity" in opts:
                        return True
        return False

    def _is_chipsec_passed(self) -> bool:
        for rel in (
            "run/yubiOS/chipsec.status",
            "run/yubiOS/chipsec-firstboot.status",
            "var/lib/yubiOS/chipsec-firstboot.status",
        ):
            p = self.sysroot / rel
            if p.is_file():
                try:
                    txt = p.read_text(errors="replace")
                except Exception:
                    return False
                if ("PASSED" in txt or "RESULT=PASS" in txt) and "FAILED" not in txt:
                    return True
                return False
        return False

    def get_os_enforced_flags(self, auth_sock: Optional[str] = None) -> int:
        flags = 0

        eventlog = self.sysroot / "sys/kernel/security/tpm0/binary_bios_measurements"
        stub_pcr = self._read_efivar_byte("StubPcrKernelImage-")
        try:
            has_eventlog = eventlog.is_file() and eventlog.stat().st_size > 0
        except Exception:
            has_eventlog = False
        if has_eventlog or (stub_pcr is not None and stub_pcr != 0):
            flags |= OS_FLAG_MEASURED_OS

        sb_byte = self._read_efivar_byte("SecureBoot-")
        setup_byte = self._read_efivar_byte("SetupMode-")
        if sb_byte == 1 and setup_byte == 0:
            flags |= OS_FLAG_SECURE_BOOT_ENFORCED

        if self._is_composefs_root_mounted():
            flags |= OS_FLAG_DM_VERITY_ACTIVE

        if self.yk.is_piv_available():
            flags |= OS_FLAG_YUBIKEY_PIV_PRESENT

        if self.yk.get_ssh_agent_pubkey(auth_sock):
            flags |= OS_FLAG_SSH_AGENT_SK_PRESENT

        if self._is_chipsec_passed():
            flags |= OS_FLAG_CHIPSEC_PASSED

        has_kernel_view = (self.sysroot / "proc/modules").is_file() or (self.sysroot / "sys/module").is_dir()
        vfio_dev = (self.sysroot / "dev/vfio/vfio").exists()
        vfio_mod = (self.sysroot / "sys/module/vfio").exists()
        if has_kernel_view and not vfio_dev and not vfio_mod:
            flags |= OS_FLAG_NO_VFIO_ENFORCED

        return flags

    def get_status(self, auth_sock: Optional[str] = None) -> Dict[str, Any]:
        pub = self.tpm.get_public_identity()
        pcrs = self.tpm.read_pcrs()
        ssh_pub = self.yk.get_ssh_agent_pubkey(auth_sock)
        peers = [p.stem for p in sorted(self.peers_dir.glob("*.json"))]
        return {
            "ok": True,
            "host_id": self.host_id,
            "node_role": self.node_role,
            "require_pair_quorum": self.require_pair_quorum,
            "arch": self.arch,
            "protocol_version": PROTOCOL_VERSION,
            "os_version": self.os_version,
            "tcti_mode": pub["tcti_mode"],
            "piv_mode": self.yk.piv_mode,
            "ek_fingerprint_sha256": pub["ek_fingerprint_sha256"],
            "ak_fingerprint_sha256": pub["ak_fingerprint_sha256"],
            "ak_name_hex": pub["ak_name_hex"],
            "pcr_sha256": pcrs,
            "pcr_composite_sha256": compute_pcr_composite_digest(pcrs, DEFAULT_PCR_LIST).hex(),
            "piv_slot": self.yk.piv_slot,
            "piv_available": self.yk.is_piv_available(),
            "piv_fingerprint_sha256": self.yk.get_piv_fingerprint_sha256(),
            "ssh_agent_key_present": ssh_pub is not None,
            "ssh_agent_pubkey": ssh_pub,
            "os_enforced_flags": self.get_os_enforced_flags(auth_sock),
            "paired_peers": peers,
        }

    def pair_init(self, peer_id: str, ttl_sec: int = PAIRING_TTL_SECONDS) -> Dict[str, Any]:
        with self._lock:
            raw_token = bytes.fromhex(self.tpm.get_random_hex(15))
            code = encode_crockford(raw_token)
            norm = normalize_pairing_code(code)
            code_id = hashlib.sha256(norm.encode("ascii")).hexdigest()[:16]
            challenge_index = self.tpm.get_random_hex(32)
            now = int(time.time())
            rec = {
                "code_id": code_id,
                "code_sha256": hashlib.sha256(norm.encode("ascii")).hexdigest(),
                "peer_id": peer_id,
                "challenge_index_local": challenge_index,
                "created_at": now,
                "expires_at": now + ttl_sec,
                "consumed": False,
            }
            pfile = self.pairings_dir / f"{code_id}.json"
            pfile.write_text(json.dumps(rec, indent=2))
            os.chmod(pfile, 0o600)
            return {
                "ok": True,
                "host_id": self.host_id,
                "peer_id": peer_id,
                "pairing_code": code,
                "code_id": code_id,
                "challenge_index": challenge_index,
                "expires_at": rec["expires_at"],
            }

    def _consume_pairing_code(self, code: str) -> Dict[str, Any]:
        norm = normalize_pairing_code(code)
        code_id = hashlib.sha256(norm.encode("ascii")).hexdigest()[:16]
        pfile = self.pairings_dir / f"{code_id}.json"
        if not pfile.exists():
            raise ValueError("Invalid or unknown single-use pairing code")
        rec = json.loads(pfile.read_text())
        if rec.get("consumed"):
            pfile.unlink(missing_ok=True)
            raise ValueError("Single-use pairing code was already consumed")
        rec["consumed"] = True
        pfile.write_text(json.dumps(rec, indent=2))
        pfile.unlink(missing_ok=True)

        now = int(time.time())
        if now > rec["expires_at"]:
            raise ValueError("Single-use pairing code has expired")
        expected_hash = hashlib.sha256(norm.encode("ascii")).hexdigest()
        if not hmac.compare_digest(rec["code_sha256"], expected_hash):
            raise ValueError("Single-use pairing code mismatch")
        return rec

    @staticmethod
    def compute_pairing_mac(
        code: str,
        initiator_id: str,
        responder_id: str,
        challenge_index_a: str,
        challenge_index_b: str,
        ek_fp_a: str,
        ek_fp_b: str,
    ) -> str:
        norm = normalize_pairing_code(code).encode("ascii")
        transcript = f"{initiator_id}|{responder_id}|{challenge_index_a}|{challenge_index_b}|{ek_fp_a}|{ek_fp_b}".encode("utf-8")
        key = hkdf_sha256(norm, b"yubios-pair-salt-v1", b"yubios-pair-mac-v1", 32)
        return hmac.new(key, transcript, hashlib.sha256).hexdigest()

    def build_hello(self, challenge_index: Optional[str] = None) -> Dict[str, Any]:
        pub = self.tpm.get_public_identity()
        c_idx = challenge_index or self.tpm.get_random_hex(32)
        nonce = self.tpm.get_random_hex(32)
        return {
            "protocol_version": PROTOCOL_VERSION,
            "host_id": self.host_id,
            "node_role": self.node_role,
            "arch": self.arch,
            "os_version": self.os_version,
            "challenge_index": c_idx,
            "nonce": nonce,
            "ek_pub_pem": pub["ek_pub_pem"],
            "ak_pub_pem": pub["ak_pub_pem"],
            "ak_name_hex": pub["ak_name_hex"],
            "ek_fingerprint_sha256": pub["ek_fingerprint_sha256"],
            "ak_fingerprint_sha256": pub["ak_fingerprint_sha256"],
        }

    def pair_begin_responder(self, code: str, initiator_hello: Dict[str, Any]) -> Dict[str, Any]:
        if self.require_pair_quorum:
            raise ValueError(
                "Cloud Assured Node enforces 2-of-2 Local StrongBox Pair quorum "
                "(YUBIOS_ATTEST_REQUIRE_PAIR_QUORUM=1); single-peer pairing is disabled"
            )
        with self._lock:
            rec = self._consume_pairing_code(code)
            resp_hello = self.build_hello(challenge_index=rec["challenge_index_local"])
            secret_for_a, cred_blob_for_a = self.tpm.make_credential(
                initiator_hello["ek_pub_pem"], initiator_hello["ak_name_hex"]
            )
            session_id = secrets.token_hex(16)
            st = {
                "session_id": session_id,
                "code_norm": normalize_pairing_code(code),
                "initiator_hello": initiator_hello,
                "responder_hello": resp_hello,
                "expected_secret_from_a": secret_for_a,
                "created_at": int(time.time()),
            }
            (self.challenges_dir / f"pair_{session_id}.json").write_text(json.dumps(st, indent=2))
            return {
                "ok": True,
                "session_id": session_id,
                "responder_hello": resp_hello,
                "cred_blob_for_initiator_b64": cred_blob_for_a,
            }

    def create_attestation_bundle(
        self,
        challenge_hex: str,
        challenge_index_hex: str,
        peer_binding_hex: str = "",
        include_piv: bool = True,
        include_ssh_agent: bool = False,
        auth_sock: Optional[str] = None,
    ) -> Dict[str, Any]:
        pub = self.tpm.get_public_identity()
        quote_data = self.tpm.quote(
            challenge_hex=challenge_hex,
            challenge_index_hex=challenge_index_hex,
            peer_binding_hex=peer_binding_hex,
        )
        bundle: Dict[str, Any] = {
            "protocol_version": PROTOCOL_VERSION,
            "host_id": self.host_id,
            "os_version": self.os_version,
            "os_enforced_flags": self.get_os_enforced_flags(auth_sock),
            "challenge_hex": challenge_hex.lower(),
            "challenge_index_hex": challenge_index_hex.lower(),
            "peer_binding_hex": peer_binding_hex.lower(),
            "ek_pub_pem": pub["ek_pub_pem"],
            "ak_pub_pem": pub["ak_pub_pem"],
            "ak_name_hex": pub["ak_name_hex"],
            "ek_fingerprint_sha256": pub["ek_fingerprint_sha256"],
            "ak_fingerprint_sha256": pub["ak_fingerprint_sha256"],
            "quote": quote_data,
            "timestamp": int(time.time()),
        }
        canonical_bytes = self._bundle_signing_bytes(bundle)
        if include_piv:
            bundle["piv_attestation"] = self.yk.sign_piv(canonical_bytes)
        if include_ssh_agent:
            bundle["ssh_agent_attestation"] = self.yk.sign_ssh_agent(
                canonical_bytes, principal=self.host_id, auth_sock=auth_sock
            )
        return bundle

    @staticmethod
    def _bundle_signing_bytes(bundle: Dict[str, Any]) -> bytes:
        core = {
            "protocol_version": bundle["protocol_version"],
            "host_id": bundle["host_id"],
            "os_version": bundle["os_version"],
            "os_enforced_flags": bundle["os_enforced_flags"],
            "challenge_hex": bundle["challenge_hex"],
            "challenge_index_hex": bundle["challenge_index_hex"],
            "peer_binding_hex": bundle["peer_binding_hex"],
            "ek_fingerprint_sha256": bundle["ek_fingerprint_sha256"],
            "ak_fingerprint_sha256": bundle["ak_fingerprint_sha256"],
            "tpms_attest_b64": bundle["quote"]["tpms_attest_b64"],
            "quote_sig_b64": bundle["quote"]["quote_sig_b64"],
            "pcr_composite_sha256": bundle["quote"]["pcr_composite_sha256"],
            "eventlog_sha256": bundle["quote"]["eventlog_sha256"],
            "clock_ms": bundle["quote"]["clock_ms"],
            "nv_counter": bundle["quote"]["nv_counter"],
        }
        return json.dumps(core, sort_keys=True, separators=(",", ":")).encode("utf-8")

    def verify_and_pin_bundle(
        self,
        bundle: Dict[str, Any],
        expected_challenge_hex: str,
        expected_challenge_index_hex: str,
        expected_peer_binding_hex: str = "",
        peer_id: Optional[str] = None,
        allow_tofu: bool = False,
        require_piv: bool = False,
        require_ssh_agent: bool = False,
        local_challenge_index_for_peer: Optional[str] = None,
    ) -> Dict[str, Any]:
        q = bundle["quote"]
        parsed_tpms = TPM2Engine.verify_quote(
            ak_pub_pem=bundle["ak_pub_pem"],
            tpms_attest_b64=q["tpms_attest_b64"],
            quote_sig_b64=q["quote_sig_b64"],
            expected_challenge_hex=expected_challenge_hex,
            expected_challenge_index_hex=expected_challenge_index_hex,
            expected_peer_binding_hex=expected_peer_binding_hex,
            pcr_sha256=q["pcr_sha256"],
            pcr_indices=q["pcr_indices"],
        )

        canonical_bytes = self._bundle_signing_bytes(bundle)
        piv_verified = False
        if bundle.get("piv_attestation"):
            YubiKeyStrongBox.verify_piv(
                canonical_bytes,
                bundle["piv_attestation"],
                allow_sim_piv=(self.yk.piv_mode == "sim"),
            )
            piv_verified = True
        elif require_piv:
            raise ValueError("Missing required YubiKey PIV co-signature")

        ssh_verified = False
        if bundle.get("ssh_agent_attestation"):
            YubiKeyStrongBox.verify_ssh_agent(canonical_bytes, bundle["ssh_agent_attestation"])
            ssh_verified = True
        elif require_ssh_agent:
            raise ValueError("Missing required SSH-agent YubiKey StrongBox signature")

        target_peer = peer_id or bundle["host_id"]
        peer_file = self.peers_dir / f"{target_peer}.json"
        now = int(time.time())

        if not peer_file.exists():
            if not allow_tofu:
                raise ValueError(f"Peer '{target_peer}' is not pinned and allow_tofu=False")
            pin_record = {
                "peer_id": target_peer,
                "host_id": bundle["host_id"],
                "remote_challenge_index": expected_challenge_index_hex.lower(),
                "local_challenge_index": (local_challenge_index_for_peer or expected_challenge_index_hex).lower(),
                "pinned_ek_pub_pem": bundle["ek_pub_pem"],
                "pinned_ak_pub_pem": bundle["ak_pub_pem"],
                "pinned_ak_name_hex": bundle["ak_name_hex"],
                "pinned_ek_fingerprint_sha256": bundle["ek_fingerprint_sha256"],
                "pinned_ak_fingerprint_sha256": bundle["ak_fingerprint_sha256"],
                "pinned_pcr_sha256": q["pcr_sha256"],
                "pinned_pcr_composite_sha256": q["pcr_composite_sha256"],
                "pinned_os_version": bundle["os_version"],
                "pinned_piv_fingerprint_sha256": bundle.get("piv_attestation", {}).get("piv_fingerprint_sha256"),
                "pinned_ssh_pubkey": bundle.get("ssh_agent_attestation", {}).get("ssh_pubkey"),
                "last_clock_ms": q["clock_ms"],
                "last_nv_counter": q["nv_counter"],
                "verified_time_first": now,
                "verified_time_last": now,
                "audit_count": 1,
            }
            peer_file.write_text(json.dumps(pin_record, indent=2))
            return {
                "ok": True,
                "status": "PAIRED_AND_PINNED",
                "peer_id": target_peer,
                "tpms_attest": parsed_tpms,
                "piv_verified": piv_verified,
                "ssh_agent_verified": ssh_verified,
                "audit_count": 1,
            }

        pin = json.loads(peer_file.read_text())
        if not hmac.compare_digest(pin["pinned_ak_fingerprint_sha256"], bundle["ak_fingerprint_sha256"]):
            raise ValueError("Pinned AK fingerprint mismatch (hardware identity changed)")
        if not hmac.compare_digest(pin["pinned_ek_fingerprint_sha256"], bundle["ek_fingerprint_sha256"]):
            raise ValueError("Pinned EK fingerprint mismatch")
        if not hmac.compare_digest(pin["remote_challenge_index"], expected_challenge_index_hex.lower()):
            raise ValueError("Challenge index mismatch against pinned peer record")

        for critical_pcr in ("0", "4", "7", "11"):
            if pin["pinned_pcr_sha256"].get(critical_pcr) != q["pcr_sha256"].get(critical_pcr):
                raise ValueError(
                    f"Measured-boot PCR {critical_pcr} drift detected: "
                    f"pinned={pin['pinned_pcr_sha256'].get(critical_pcr)} vs quote={q['pcr_sha256'].get(critical_pcr)}"
                )

        if q["nv_counter"] < pin["last_nv_counter"]:
            raise ValueError(
                f"TPM NV monotonic counter rollback detected: {q['nv_counter']} < {pin['last_nv_counter']}"
            )
        if q["clock_ms"] + CLOCK_SKEW_MS < pin["last_clock_ms"]:
            raise ValueError(
                f"TPM clock rollback detected: {q['clock_ms']} < {pin['last_clock_ms']}"
            )
        if bundle["os_version"] < pin["pinned_os_version"]:
            raise ValueError(
                f"OS version downgrade detected: {bundle['os_version']} < {pin['pinned_os_version']}"
            )
        if require_piv and pin.get("pinned_piv_fingerprint_sha256"):
            got_piv = bundle.get("piv_attestation", {}).get("piv_fingerprint_sha256", "")
            if not hmac.compare_digest(got_piv, pin["pinned_piv_fingerprint_sha256"]):
                raise ValueError("Pinned YubiKey PIV hardware strongbox key mismatch")
        if require_ssh_agent and pin.get("pinned_ssh_pubkey"):
            got_ssh = bundle.get("ssh_agent_attestation", {}).get("ssh_pubkey", "").strip()
            if got_ssh != pin["pinned_ssh_pubkey"].strip():
                raise ValueError("Pinned YubiKey SSH-agent key mismatch")

        pin["last_clock_ms"] = q["clock_ms"]
        pin["last_nv_counter"] = q["nv_counter"]
        pin["pinned_os_version"] = max(pin["pinned_os_version"], bundle["os_version"])
        pin["verified_time_last"] = now
        pin["audit_count"] = pin.get("audit_count", 1) + 1
        peer_file.write_text(json.dumps(pin, indent=2))

        return {
            "ok": True,
            "status": "VERIFIED_AGAINST_PIN",
            "peer_id": target_peer,
            "tpms_attest": parsed_tpms,
            "piv_verified": piv_verified,
            "ssh_agent_verified": ssh_verified,
            "audit_count": pin["audit_count"],
        }

    def pair_finalize_responder(
        self,
        session_id: str,
        recovered_secret_from_a_hex: str,
        cred_blob_for_b_b64: str,
        pair_mac_from_a: str,
        bundle_from_a: Dict[str, Any],
        auth_sock: Optional[str] = None,
    ) -> Dict[str, Any]:
        if self.require_pair_quorum:
            raise ValueError(
                "Cloud Assured Node enforces 2-of-2 Local StrongBox Pair quorum "
                "(YUBIOS_ATTEST_REQUIRE_PAIR_QUORUM=1); single-peer pairing is disabled"
            )
        with self._lock:
            sfile = self.challenges_dir / f"pair_{session_id}.json"
            if not sfile.exists():
                raise ValueError("Unknown or expired pairing session_id")
            st = json.loads(sfile.read_text())
            sfile.unlink(missing_ok=True)

            if not hmac.compare_digest(st["expected_secret_from_a"], recovered_secret_from_a_hex.lower()):
                raise ValueError("Initiator failed MakeCredential/ActivateCredential fTPM residency challenge")

            init_h = st["initiator_hello"]
            resp_h = st["responder_hello"]
            expected_mac = self.compute_pairing_mac(
                st["code_norm"],
                init_h["host_id"],
                resp_h["host_id"],
                init_h["challenge_index"],
                resp_h["challenge_index"],
                init_h["ek_fingerprint_sha256"],
                resp_h["ek_fingerprint_sha256"],
            )
            if not hmac.compare_digest(expected_mac, pair_mac_from_a.lower()):
                raise ValueError("Pairing transcript MAC verification failed")

            recovered_secret_for_b = self.tpm.activate_credential(cred_blob_for_b_b64)
            peer_binding = hashlib.sha256(
                f"{expected_mac}|{st['expected_secret_from_a']}|{recovered_secret_for_b}".encode("utf-8")
            ).hexdigest()

            verify_a = self.verify_and_pin_bundle(
                bundle=bundle_from_a,
                expected_challenge_hex=resp_h["nonce"],
                expected_challenge_index_hex=init_h["challenge_index"],
                expected_peer_binding_hex=peer_binding,
                peer_id=init_h["host_id"],
                allow_tofu=True,
                require_piv=True,
                require_ssh_agent=bool(bundle_from_a.get("ssh_agent_attestation")),
                local_challenge_index_for_peer=resp_h["challenge_index"],
            )

            use_ssh = bool(self.yk.get_ssh_agent_pubkey(auth_sock))
            bundle_b = self.create_attestation_bundle(
                challenge_hex=init_h["nonce"],
                challenge_index_hex=resp_h["challenge_index"],
                peer_binding_hex=peer_binding,
                include_piv=True,
                include_ssh_agent=use_ssh,
                auth_sock=auth_sock,
            )

            return {
                "ok": True,
                "recovered_secret_from_b_hex": recovered_secret_for_b,
                "peer_binding_hex": peer_binding,
                "initiator_verification": verify_a,
                "responder_bundle": bundle_b,
            }

    def get_peer_pin(self, peer_id: str) -> Dict[str, Any]:
        pfile = self.peers_dir / f"{peer_id}.json"
        if not pfile.exists():
            raise ValueError(f"Peer '{peer_id}' is not paired")
        return json.loads(pfile.read_text())

    @staticmethod
    def compute_quorum_mac(
        code: str,
        node_a_id: str,
        node_b_id: str,
        cloud_id: str,
        c_idx_a: str,
        c_idx_b: str,
        c_idx_cloud: str,
        ek_fp_a: str,
        ek_fp_b: str,
        ek_fp_cloud: str,
    ) -> str:
        norm = normalize_pairing_code(code).encode("ascii")
        transcript = (
            f"{node_a_id}|{node_b_id}|{cloud_id}|{c_idx_a}|{c_idx_b}|{c_idx_cloud}|{ek_fp_a}|{ek_fp_b}|{ek_fp_cloud}"
        ).encode("utf-8")
        key = hkdf_sha256(norm, b"yubios-cloud-quorum-salt-v1", b"yubios-cloud-quorum-mac-v1", 32)
        return hmac.new(key, transcript, hashlib.sha256).hexdigest()

    def pair_cloud_quorum_begin(
        self,
        code: str,
        node_a_hello: Dict[str, Any],
        node_b_hello: Dict[str, Any],
    ) -> Dict[str, Any]:
        with self._lock:
            rec = self._consume_pairing_code(code)
            if node_a_hello["host_id"] == node_b_hello["host_id"]:
                raise ValueError("Local StrongBox Pair must consist of two distinct host_ids")
            if hmac.compare_digest(
                node_a_hello["ek_fingerprint_sha256"], node_b_hello["ek_fingerprint_sha256"]
            ):
                raise ValueError("Local StrongBox Pair must have two distinct TPM Endorsement Keys")

            cloud_hello = self.build_hello(challenge_index=rec["challenge_index_local"])
            secret_for_a, cred_blob_for_a = self.tpm.make_credential(
                node_a_hello["ek_pub_pem"], node_a_hello["ak_name_hex"]
            )
            secret_for_b, cred_blob_for_b = self.tpm.make_credential(
                node_b_hello["ek_pub_pem"], node_b_hello["ak_name_hex"]
            )
            session_id = secrets.token_hex(16)
            st = {
                "session_id": session_id,
                "code_norm": normalize_pairing_code(code),
                "node_a_hello": node_a_hello,
                "node_b_hello": node_b_hello,
                "cloud_hello": cloud_hello,
                "expected_secret_from_a": secret_for_a,
                "expected_secret_from_b": secret_for_b,
                "created_at": int(time.time()),
            }
            (self.challenges_dir / f"quorum_{session_id}.json").write_text(json.dumps(st, indent=2))
            return {
                "ok": True,
                "session_id": session_id,
                "cloud_hello": cloud_hello,
                "cred_blob_for_a_b64": cred_blob_for_a,
                "cred_blob_for_b_b64": cred_blob_for_b,
            }

    def pair_cloud_quorum_finalize(
        self,
        session_id: str,
        recovered_secret_from_a_hex: str,
        recovered_secret_from_b_hex: str,
        cred_blob_for_cloud_b64: str,
        quorum_mac_hex: str,
        bundle_from_a: Dict[str, Any],
        bundle_from_b: Dict[str, Any],
        mutual_pair_binding_ab_hex: str,
    ) -> Dict[str, Any]:
        with self._lock:
            sfile = self.challenges_dir / f"quorum_{session_id}.json"
            if not sfile.exists():
                raise ValueError("Unknown or expired cloud quorum pairing session_id")
            st = json.loads(sfile.read_text())
            sfile.unlink(missing_ok=True)

            if not hmac.compare_digest(st["expected_secret_from_a"], recovered_secret_from_a_hex.lower()):
                raise ValueError("Local Node A failed MakeCredential/ActivateCredential TPM residency challenge")
            if not hmac.compare_digest(st["expected_secret_from_b"], recovered_secret_from_b_hex.lower()):
                raise ValueError("Local Node B failed MakeCredential/ActivateCredential TPM residency challenge")

            ha = st["node_a_hello"]
            hb = st["node_b_hello"]
            hc = st["cloud_hello"]
            expected_mac = self.compute_quorum_mac(
                st["code_norm"],
                ha["host_id"],
                hb["host_id"],
                hc["host_id"],
                ha["challenge_index"],
                hb["challenge_index"],
                hc["challenge_index"],
                ha["ek_fingerprint_sha256"],
                hb["ek_fingerprint_sha256"],
                hc["ek_fingerprint_sha256"],
            )
            if not hmac.compare_digest(expected_mac, quorum_mac_hex.lower()):
                raise ValueError("Cloud quorum transcript MAC verification failed")

            piv_a = bundle_from_a.get("piv_attestation") or {}
            piv_b = bundle_from_b.get("piv_attestation") or {}
            if not piv_a.get("piv_fingerprint_sha256") or not piv_b.get("piv_fingerprint_sha256"):
                raise ValueError("Both nodes in the Local StrongBox Pair must provide YubiKey PIV signatures")
            if hmac.compare_digest(piv_a["piv_fingerprint_sha256"], piv_b["piv_fingerprint_sha256"]):
                raise ValueError("Distinct hardware strongbox keys required across the 2-node Local Pair")

            if not mutual_pair_binding_ab_hex or len(mutual_pair_binding_ab_hex) < 32:
                raise ValueError("Missing mutual local pair binding proof between Node A and Node B")

            recovered_secret_cloud = self.tpm.activate_credential(cred_blob_for_cloud_b64)
            peer_binding = hashlib.sha256(
                f"quorum-v1|{expected_mac}|{st['expected_secret_from_a']}|{st['expected_secret_from_b']}|{recovered_secret_cloud}|{mutual_pair_binding_ab_hex}".encode("utf-8")
            ).hexdigest()

            verify_a = self.verify_and_pin_bundle(
                bundle=bundle_from_a,
                expected_challenge_hex=hc["nonce"],
                expected_challenge_index_hex=ha["challenge_index"],
                expected_peer_binding_hex=peer_binding,
                peer_id=ha["host_id"],
                allow_tofu=True,
                require_piv=True,
                require_ssh_agent=bool(bundle_from_a.get("ssh_agent_attestation")),
                local_challenge_index_for_peer=hc["challenge_index"],
            )
            verify_b = self.verify_and_pin_bundle(
                bundle=bundle_from_b,
                expected_challenge_hex=hc["nonce"],
                expected_challenge_index_hex=hb["challenge_index"],
                expected_peer_binding_hex=peer_binding,
                peer_id=hb["host_id"],
                allow_tofu=True,
                require_piv=True,
                require_ssh_agent=bool(bundle_from_b.get("ssh_agent_attestation")),
                local_challenge_index_for_peer=hc["challenge_index"],
            )

            quorum_rec = {
                "quorum_id": f"{ha['host_id']}+{hb['host_id']}",
                "node_a_id": ha["host_id"],
                "node_b_id": hb["host_id"],
                "piv_fp_a": piv_a["piv_fingerprint_sha256"],
                "piv_fp_b": piv_b["piv_fingerprint_sha256"],
                "mutual_pair_binding_ab_hex": mutual_pair_binding_ab_hex,
                "cloud_challenge_index": hc["challenge_index"],
                "paired_at": int(time.time()),
                "audit_count": 1,
            }
            (self.peers_dir / f"quorum_{ha['host_id']}__{hb['host_id']}.json").write_text(
                json.dumps(quorum_rec, indent=2)
            )

            pair_challenge = hashlib.sha256(
                f"{ha['nonce']}|{hb['nonce']}".encode("utf-8")
            ).hexdigest()
            cloud_bundle = self.create_attestation_bundle(
                challenge_hex=pair_challenge,
                challenge_index_hex=hc["challenge_index"],
                peer_binding_hex=peer_binding,
                include_piv=(self.node_role != "cloud-vtpm"),
                include_ssh_agent=False,
            )

            return {
                "ok": True,
                "cloud_host_id": self.host_id,
                "cloud_node_role": self.node_role,
                "cloud_arch": self.arch,
                "recovered_secret_from_cloud_hex": recovered_secret_cloud,
                "peer_binding_hex": peer_binding,
                "verified_node_a": verify_a,
                "verified_node_b": verify_b,
                "cloud_bundle": cloud_bundle,
            }

    def issue_cloud_quorum_challenge(
        self,
        node_a_id: str,
        node_b_id: str,
        ttl_sec: int = QUORUM_CHALLENGE_TTL_SECONDS,
    ) -> Dict[str, Any]:
        """
        Issue and persist an unexpired, single-use challenge bound to the specific
        2-node Local StrongBox Pair `(node_a_id, node_b_id)`.
        """
        with self._lock:
            qfile = self.peers_dir / f"quorum_{node_a_id}__{node_b_id}.json"
            if not qfile.exists():
                raise ValueError(f"Local StrongBox Pair '{node_a_id}+{node_b_id}' is not paired with this Cloud Node")
            qrec = json.loads(qfile.read_text())
            pin_a = self.get_peer_pin(node_a_id)
            pin_b = self.get_peer_pin(node_b_id)
            challenge_id = secrets.token_hex(16)
            cloud_nonce = self.tpm.get_random_hex(32)
            now = int(time.time())
            crec = {
                "challenge_id": challenge_id,
                "node_a_id": node_a_id,
                "node_b_id": node_b_id,
                "cloud_nonce": cloud_nonce,
                "created_at": now,
                "expires_at": now + ttl_sec,
                "consumed": False,
            }
            cfile = self.challenges_dir / f"qverify_{challenge_id}.json"
            cfile.write_text(json.dumps(crec, indent=2))
            os.chmod(cfile, 0o600)
            return {
                "ok": True,
                "challenge_id": challenge_id,
                "cloud_host_id": self.host_id,
                "cloud_node_role": self.node_role,
                "cloud_arch": self.arch,
                "cloud_nonce": cloud_nonce,
                "expires_at": crec["expires_at"],
                "cloud_challenge_index": qrec["cloud_challenge_index"],
                "expected_c_idx_a": pin_a["remote_challenge_index"],
                "expected_c_idx_b": pin_b["remote_challenge_index"],
            }

    def respond_cloud_quorum_challenge(
        self,
        challenge_id: str,
        node_a_id: str,
        node_b_id: str,
        nonce_a: str,
        nonce_b: str,
        bundle_a: Dict[str, Any],
        bundle_b: Dict[str, Any],
        cloud_nonce: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Verify a 2-node Local StrongBox Pair quorum response against a stored,
        unexpired, single-use challenge (`challenge_id`) issued for `(node_a_id, node_b_id)`.
        """
        with self._lock:
            if not challenge_id or not isinstance(challenge_id, str):
                raise ValueError("Missing required single-use quorum challenge_id")
            safe_cid = "".join(ch for ch in challenge_id.strip().lower() if ch in "0123456789abcdef")
            if not safe_cid or safe_cid != challenge_id.strip().lower():
                raise ValueError("Invalid quorum challenge_id format")

            cfile = self.challenges_dir / f"qverify_{safe_cid}.json"
            if not cfile.exists():
                raise ValueError("Unknown, expired, or already-consumed cloud quorum challenge_id")
            crec = json.loads(cfile.read_text())
            # Burn immediately before verification (strict single-attempt / single-use semantics)
            cfile.unlink(missing_ok=True)
            if crec.get("consumed"):
                raise ValueError("Cloud quorum challenge_id was already consumed")

            now = int(time.time())
            if now > crec["expires_at"]:
                raise ValueError("Cloud quorum challenge_id has expired")
            if crec["node_a_id"] != node_a_id or crec["node_b_id"] != node_b_id:
                raise ValueError(
                    f"Cloud quorum challenge_id was issued for '{crec['node_a_id']}+{crec['node_b_id']}', "
                    f"not '{node_a_id}+{node_b_id}'"
                )
            stored_cloud_nonce = crec["cloud_nonce"]
            if cloud_nonce is not None and not hmac.compare_digest(stored_cloud_nonce, cloud_nonce.lower()):
                raise ValueError("Caller cloud_nonce does not match stored single-use quorum challenge")

            qfile = self.peers_dir / f"quorum_{node_a_id}__{node_b_id}.json"
            if not qfile.exists():
                raise ValueError(f"Local StrongBox Pair '{node_a_id}+{node_b_id}' is not paired with this Cloud Node")
            qrec = json.loads(qfile.read_text())
            pin_a = self.get_peer_pin(node_a_id)
            pin_b = self.get_peer_pin(node_b_id)

            piv_a = (bundle_a.get("piv_attestation") or {}).get("piv_fingerprint_sha256", "")
            piv_b = (bundle_b.get("piv_attestation") or {}).get("piv_fingerprint_sha256", "")
            if not hmac.compare_digest(piv_a, qrec["piv_fp_a"]) or not hmac.compare_digest(piv_b, qrec["piv_fp_b"]):
                raise ValueError("Local StrongBox Pair YubiKey PIV fingerprints do not match pinned quorum record")

            peer_binding = hashlib.sha256(
                f"cloud-quorum-verify-v1|{nonce_a}|{nonce_b}|{stored_cloud_nonce}|{pin_a['remote_challenge_index']}|{pin_b['remote_challenge_index']}|{qrec['cloud_challenge_index']}".encode("utf-8")
            ).hexdigest()

            ver_a = self.verify_and_pin_bundle(
                bundle=bundle_a,
                expected_challenge_hex=stored_cloud_nonce,
                expected_challenge_index_hex=pin_a["remote_challenge_index"],
                expected_peer_binding_hex=peer_binding,
                peer_id=node_a_id,
                allow_tofu=False,
                require_piv=True,
                require_ssh_agent=bool(bundle_a.get("ssh_agent_attestation")),
            )
            ver_b = self.verify_and_pin_bundle(
                bundle=bundle_b,
                expected_challenge_hex=stored_cloud_nonce,
                expected_challenge_index_hex=pin_b["remote_challenge_index"],
                expected_peer_binding_hex=peer_binding,
                peer_id=node_b_id,
                allow_tofu=False,
                require_piv=True,
                require_ssh_agent=bool(bundle_b.get("ssh_agent_attestation")),
            )

            qrec["audit_count"] = qrec.get("audit_count", 1) + 1
            qfile.write_text(json.dumps(qrec, indent=2))

            pair_challenge = hashlib.sha256(f"{nonce_a}|{nonce_b}".encode("utf-8")).hexdigest()
            cloud_bundle = self.create_attestation_bundle(
                challenge_hex=pair_challenge,
                challenge_index_hex=qrec["cloud_challenge_index"],
                peer_binding_hex=peer_binding,
                include_piv=(self.node_role != "cloud-vtpm"),
                include_ssh_agent=False,
            )
            return {
                "ok": True,
                "challenge_id": safe_cid,
                "cloud_host_id": self.host_id,
                "cloud_node_role": self.node_role,
                "cloud_arch": self.arch,
                "peer_binding_hex": peer_binding,
                "verified_node_a": ver_a,
                "verified_node_b": ver_b,
                "quorum_audit_count": qrec["audit_count"],
                "cloud_bundle": cloud_bundle,
            }
