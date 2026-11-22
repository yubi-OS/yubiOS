#!/usr/bin/env python3
# SPDX-License-Identifier: LGPL-2.1-or-later
"""
End-to-end verification suite for yubiOS-attest (library, systemd/D-Bus daemon,
CLI client, single-use pairing code, hardware PKCS#11 vs test sim PIV policy,
observed runtime enforcement flags, SSH-agent StrongBox signing, and anti-rollback).
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ATTEST_DIR = ROOT_DIR / "usr/lib/yubiOS/attest"
DAEMON_BIN = ATTEST_DIR / "yubios-attestd"
CLI_BIN = ATTEST_DIR / "yubios-attest-cli"

sys.path.insert(0, str(ATTEST_DIR))
import yubios_attest as ya


class TestYubiOSAttestEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp_root = Path(tempfile.mkdtemp(prefix="yubios-attest-e2e-"))
        cls.env = os.environ.copy()
        cls.env["YUBIOS_ATTEST_PIV_MODE"] = "sim"

        cls.ssh_key = cls.tmp_root / "id_yubico_ed25519_sk"
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-N", "", "-C", "yubikey-piv-9a@yubiOS", "-f", str(cls.ssh_key)],
            check=True, capture_output=True,
        )
        cls.env["YUBIOS_ATTEST_TEST_SSH_KEY"] = str(cls.ssh_key)

        # Start an ephemeral ssh-agent when Unix socket creation is permitted in this environment
        try:
            agent_sock = cls.tmp_root / "ssh_agent.sock"
            agent_res = subprocess.run(
                ["ssh-agent", "-a", str(agent_sock), "-s"],
                check=True, capture_output=True, text=True,
            )
            for line in agent_res.stdout.splitlines():
                if line.startswith("SSH_AUTH_SOCK="):
                    cls.env["SSH_AUTH_SOCK"] = line.split("=", 1)[1].split(";", 1)[0]
                elif line.startswith("SSH_AGENT_PID="):
                    cls.env["SSH_AGENT_PID"] = line.split("=", 1)[1].split(";", 1)[0]
            subprocess.run(["ssh-add", str(cls.ssh_key)], env=cls.env, check=True, capture_output=True)
        except Exception:
            cls.env.pop("SSH_AUTH_SOCK", None)

        # Build a synthetic observed runtime sysroot for the test daemons
        cls.sysroot = cls.tmp_root / "sysroot"
        (cls.sysroot / "sys/kernel/security/tpm0").mkdir(parents=True, exist_ok=True)
        (cls.sysroot / "sys/kernel/security/tpm0/binary_bios_measurements").write_bytes(b"\x00\x01\x02\x03TCG_EVENTLOG")
        (cls.sysroot / "sys/firmware/efi/efivars").mkdir(parents=True, exist_ok=True)
        (cls.sysroot / "sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c").write_bytes(
            b"\x06\x00\x00\x00\x01"
        )
        (cls.sysroot / "sys/firmware/efi/efivars/SetupMode-8be4df61-93ca-11d2-aa0d-00e098032b8c").write_bytes(
            b"\x06\x00\x00\x00\x00"
        )
        (cls.sysroot / "proc").mkdir(parents=True, exist_ok=True)
        (cls.sysroot / "proc/cmdline").write_text("root=LABEL=yubios-root ro composefs=8f4e2b9a1c3d5e7f\n")
        (cls.sysroot / "proc/mounts").write_text("composefs / composefs ro,relatime,verity 0 0\n")
        (cls.sysroot / "proc/modules").write_text("tpm_ftpm_tee 16384 0 - Live 0x0000000000000000\n")
        (cls.sysroot / "run/yubiOS").mkdir(parents=True, exist_ok=True)
        (cls.sysroot / "run/yubiOS/chipsec.status").write_text("RESULT=PASSED\n")
        cls.env["YUBIOS_ATTEST_SYSROOT"] = str(cls.sysroot)

        # Create a notify socket to test systemd Type=notify READY=1 signaling
        cls.notify_sock_path = cls.tmp_root / "sd_notify.sock"
        cls.notify_sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        cls.notify_sock.bind(str(cls.notify_sock_path))
        cls.notify_sock.settimeout(5.0)

        # Launch two yubios-attestd instances: host-alpha and host-beta
        cls.alpha_state = cls.tmp_root / "alpha_state"
        cls.alpha_run = cls.tmp_root / "alpha_run"
        cls.alpha_sock = cls.alpha_run / "attest.sock"

        cls.beta_state = cls.tmp_root / "beta_state"
        cls.beta_run = cls.tmp_root / "beta_run"
        cls.beta_sock = cls.beta_run / "attest.sock"

        env_alpha = cls.env.copy()
        env_alpha["NOTIFY_SOCKET"] = str(cls.notify_sock_path)

        cls.proc_alpha = subprocess.Popen(
            [
                sys.executable, str(DAEMON_BIN),
                "--state-dir", str(cls.alpha_state),
                "--run-dir", str(cls.alpha_run),
                "--host-id", "yubios-host-alpha",
                "--tpm-mode", "sim",
                "--piv-mode", "sim",
                "--sysroot", str(cls.sysroot),
                "--os-version", "45.20261114.0",
            ],
            env=env_alpha,
        )
        cls.proc_beta = subprocess.Popen(
            [
                sys.executable, str(DAEMON_BIN),
                "--state-dir", str(cls.beta_state),
                "--run-dir", str(cls.beta_run),
                "--host-id", "yubios-host-beta",
                "--tpm-mode", "sim",
                "--piv-mode", "sim",
                "--sysroot", str(cls.sysroot),
                "--os-version", "45.20261114.0",
            ],
            env=cls.env,
        )

        ready_msg = cls.notify_sock.recv(1024).decode("utf-8")
        assert "READY=1" in ready_msg, f"Expected READY=1 from sd_notify, got {ready_msg}"

        for sock in (cls.alpha_sock, cls.beta_sock):
            for _ in range(50):
                if sock.exists():
                    break
                time.sleep(0.1)
            assert sock.exists(), f"Daemon socket {sock} did not appear"

        cls.mock_ssh = cls.tmp_root / "mock-ssh"
        cls.mock_ssh.write_text(
            f"""#!/usr/bin/env bash
if [[ "$*" != *"ForwardAgent=no"* ]]; then
  echo "SECURITY FAIL: ForwardAgent=no missing from ssh invocation: $*" >&2
  exit 99
fi
unset SSH_AUTH_SOCK
exec "{sys.executable}" "{CLI_BIN}" --socket "{cls.beta_sock}" stdio-peer
"""
        )
        cls.mock_ssh.chmod(0o755)

    @classmethod
    def tearDownClass(cls):
        for p in (getattr(cls, "proc_alpha", None), getattr(cls, "proc_beta", None)):
            if p:
                p.terminate()
                try:
                    p.wait(timeout=5)
                except Exception:
                    p.kill()
        if hasattr(cls, "notify_sock"):
            cls.notify_sock.close()
        if cls.env.get("SSH_AGENT_PID"):
            subprocess.run(["ssh-agent", "-k"], env=cls.env, capture_output=True)
        shutil.rmtree(cls.tmp_root, ignore_errors=True)

    def _run_cli(self, sock: Path, args: list) -> dict:
        res = subprocess.run(
            [sys.executable, str(CLI_BIN), "--socket", str(sock)] + args,
            env=self.env,
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            raise RuntimeError(f"CLI {args} failed ({res.returncode}): {res.stderr}\n{res.stdout}")
        return json.loads(res.stdout)

    def test_01_dbus_introspect_and_status(self):
        req = {"jsonrpc": "2.0", "id": 1, "method": "org.freedesktop.DBus.Introspectable.Introspect", "params": {}}
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.connect(str(self.alpha_sock))
            s.sendall((json.dumps(req) + "\n").encode("utf-8"))
            resp = json.loads(s.recv(65536).decode("utf-8"))["result"]
        self.assertTrue(resp["ok"])
        self.assertIn("org.yubios.Attest1", resp["xml"])
        self.assertEqual(resp["peer_cred"]["uid"], os.getuid())

        st = self._run_cli(self.alpha_sock, ["status"])
        self.assertEqual(st["host_id"], "yubios-host-alpha")
        self.assertEqual(st["piv_mode"], "sim")
        self.assertTrue(st["ssh_agent_key_present"])
        self.assertEqual(len(st["pcr_sha256"]), 8)

    def test_02_local_attest_with_piv_and_ssh_agent(self):
        out_file = self.tmp_root / "local_bundle.json"
        res = self._run_cli(self.alpha_sock, ["local-attest", "--ssh-agent", "--out", str(out_file)])
        self.assertTrue(out_file.exists())
        self.assertEqual(res["verification"]["status"], "PAIRED_AND_PINNED")
        self.assertTrue(res["verification"]["piv_verified"])
        self.assertTrue(res["verification"]["ssh_agent_verified"])
        self.assertEqual(res["verification"]["tpms_attest"]["magic"], 0xFF544347)

    def test_03_single_use_pairing_and_replay_rejection(self):
        pair_init = self._run_cli(self.beta_sock, ["pair-init", "--peer", "yubios-host-alpha"])
        code = pair_init["pairing_code"]
        self.assertTrue(code.startswith("YUBI-"))

        pair_res = self._run_cli(
            self.alpha_sock,
            [
                "pair-ssh",
                "--peer", "yubios-host-beta",
                "--code", code,
                "--ssh-target", "root@yubios-host-beta",
                "--ssh-cmd", str(self.mock_ssh),
            ],
        )
        self.assertEqual(pair_res["mutual_pairing"], "ESTABLISHED")
        self.assertEqual(pair_res["responder_verified_initiator"]["status"], "PAIRED_AND_PINNED")
        self.assertTrue(pair_res["responder_verified_initiator"]["piv_verified"])
        self.assertTrue(pair_res["responder_verified_initiator"]["ssh_agent_verified"])
        self.assertEqual(pair_res["initiator_verified_responder"]["status"], "PAIRED_AND_PINNED")
        self.assertTrue(pair_res["initiator_verified_responder"]["piv_verified"])

        with self.assertRaises(RuntimeError) as ctx:
            self._run_cli(
                self.alpha_sock,
                [
                    "pair-ssh",
                    "--peer", "yubios-host-beta",
                    "--code", code,
                    "--ssh-target", "root@yubios-host-beta",
                    "--ssh-cmd", str(self.mock_ssh),
                ],
            )
        self.assertIn("Invalid or unknown single-use pairing code", str(ctx.exception))

    def test_04_mutual_verify_and_tamper_rollback_detection(self):
        ver1 = self._run_cli(
            self.alpha_sock,
            [
                "mutual-verify",
                "--peer", "yubios-host-beta",
                "--ssh-target", "root@yubios-host-beta",
                "--ssh-cmd", str(self.mock_ssh),
            ],
        )
        self.assertEqual(ver1["mutual_attestation"], "VERIFIED")
        self.assertEqual(ver1["responder_verified_initiator"]["audit_count"], 2)
        self.assertEqual(ver1["initiator_verified_responder"]["audit_count"], 2)

        beta_pin_on_alpha = self.alpha_state / "peers/yubios-host-beta.json"
        pin_data = json.loads(beta_pin_on_alpha.read_text())
        orig_ver = pin_data["pinned_os_version"]
        pin_data["pinned_os_version"] = "99.99999999.0"
        beta_pin_on_alpha.write_text(json.dumps(pin_data, indent=2))
        try:
            with self.assertRaises(RuntimeError) as ctx:
                self._run_cli(
                    self.alpha_sock,
                    [
                        "mutual-verify",
                        "--peer", "yubios-host-beta",
                        "--ssh-target", "root@yubios-host-beta",
                        "--ssh-cmd", str(self.mock_ssh),
                    ],
                )
            self.assertIn("OS version downgrade detected", str(ctx.exception))
        finally:
            pin_data["pinned_os_version"] = orig_ver
            beta_pin_on_alpha.write_text(json.dumps(pin_data, indent=2))

        beta_pcr_file = self.beta_state / "tpm_pcr_state.json"
        beta_pcrs = json.loads(beta_pcr_file.read_text())
        orig_pcr11 = beta_pcrs["11"]
        beta_pcrs["11"] = "deadbeef" * 8
        beta_pcr_file.write_text(json.dumps(beta_pcrs, indent=2))
        try:
            with self.assertRaises(RuntimeError) as ctx:
                self._run_cli(
                    self.alpha_sock,
                    [
                        "mutual-verify",
                        "--peer", "yubios-host-beta",
                        "--ssh-target", "root@yubios-host-beta",
                        "--ssh-cmd", str(self.mock_ssh),
                    ],
                )
            self.assertIn("Measured-boot PCR 11 drift detected", str(ctx.exception))
        finally:
            beta_pcrs["11"] = orig_pcr11
            beta_pcr_file.write_text(json.dumps(beta_pcrs, indent=2))

    def test_05_systemd_units_and_lex_sort_compliance(self):
        svc_txt = (ROOT_DIR / "usr/lib/systemd/system/yubiOS-attestd.service").read_text()
        sock_txt = (ROOT_DIR / "usr/lib/systemd/system/yubiOS-attestd.socket").read_text()
        required_directives = [
            "ConditionSecurity=measured-os",
            "Type=notify",
            "ProtectSystem=strict",
            "ProtectHome=yes",
            "PrivateTmp=yes",
            "NoNewPrivileges=yes",
            "CapabilityBoundingSet=",
            "RestrictFileSystems=~@network",
            "DevicePolicy=closed",
            "DeviceAllow=/dev/tpmrm0 rw",
            "MemoryDenyWriteExecute=yes",
            "SystemCallFilter=@system-service",
            "IPAddressDeny=any",
        ]
        for d in required_directives:
            self.assertIn(d, svc_txt, f"Missing hardening directive: {d}")
        self.assertIn("ConditionSecurity=measured-os", sock_txt)
        self.assertIn("PassCredentials=yes", sock_txt)
        self.assertGreater("yubiOS-attest.conf", "static-nodes-permissions.conf")

    def test_06_production_piv_rejects_software_keys_and_sim_bundles(self):
        prod_dir = self.tmp_root / "prod_piv_state"
        yk_prod = ya.YubiKeyStrongBox(prod_dir, piv_slot="9a", piv_mode="pkcs11")
        # Production mode must NEVER generate a local software EC private key
        self.assertFalse(yk_prod.piv_priv.exists())
        with self.assertRaises(RuntimeError) as ctx:
            yk_prod.sign_piv(b"test-payload")
        self.assertIn("pkcs11", str(ctx.exception).lower())

        # Simulated PIV block must be rejected when allow_sim_piv=False (production verifier)
        sim_dir = self.tmp_root / "sim_piv_state"
        yk_sim = ya.YubiKeyStrongBox(sim_dir, piv_slot="9a", piv_mode="sim")
        sim_block = yk_sim.sign_piv(b"test-payload")
        self.assertEqual(sim_block["piv_mode"], "sim")
        self.assertTrue(ya.YubiKeyStrongBox.verify_piv(b"test-payload", sim_block, allow_sim_piv=True))
        with self.assertRaises(ValueError) as vctx:
            ya.YubiKeyStrongBox.verify_piv(b"test-payload", sim_block, allow_sim_piv=False)
        self.assertIn("piv_mode=sim", str(vctx.exception))

    def test_07_observed_os_enforced_flags_require_runtime_evidence(self):
        empty_sysroot = self.tmp_root / "empty_sysroot"
        empty_sysroot.mkdir(parents=True, exist_ok=True)
        core = ya.AttestDaemonCore(
            state_dir=self.tmp_root / "flags_state",
            run_dir=self.tmp_root / "flags_run",
            host_id="flags-test",
            tpm_mode="sim",
            piv_mode="pkcs11",
            sysroot=empty_sysroot,
        )
        # On an empty sysroot (including absent chipsec.status), NO platform enforcement flag may be set
        flags_empty = core.get_os_enforced_flags(auth_sock="")
        self.assertEqual(flags_empty & ya.OS_FLAG_MEASURED_OS, 0)
        self.assertEqual(flags_empty & ya.OS_FLAG_SECURE_BOOT_ENFORCED, 0)
        self.assertEqual(flags_empty & ya.OS_FLAG_DM_VERITY_ACTIVE, 0)
        self.assertEqual(flags_empty & ya.OS_FLAG_CHIPSEC_PASSED, 0)
        self.assertEqual(flags_empty & ya.OS_FLAG_NO_VFIO_ENFORCED, 0)

        # Populate SecureBoot=1 without SetupMode -> must STILL be 0 (SetupMode unreadable)
        efivars = empty_sysroot / "sys/firmware/efi/efivars"
        efivars.mkdir(parents=True, exist_ok=True)
        (efivars / "SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c").write_bytes(b"\x06\x00\x00\x00\x01")
        self.assertEqual(core.get_os_enforced_flags(auth_sock="") & ya.OS_FLAG_SECURE_BOOT_ENFORCED, 0)

        # Populate SetupMode=0 -> now SECURE_BOOT_ENFORCED becomes 1
        (efivars / "SetupMode-8be4df61-93ca-11d2-aa0d-00e098032b8c").write_bytes(b"\x06\x00\x00\x00\x00")
        self.assertNotEqual(core.get_os_enforced_flags(auth_sock="") & ya.OS_FLAG_SECURE_BOOT_ENFORCED, 0)

        # Populate composefs= in /proc/cmdline WITHOUT a mounted composefs root in /proc/mounts -> must be 0
        (empty_sysroot / "proc").mkdir(parents=True, exist_ok=True)
        (empty_sysroot / "proc/cmdline").write_text("composefs=deadbeef1234\n")
        (empty_sysroot / "proc/mounts").write_text("/dev/sda2 / ext4 rw,relatime 0 0\n")
        self.assertEqual(core.get_os_enforced_flags(auth_sock="") & ya.OS_FLAG_DM_VERITY_ACTIVE, 0)

        # Mount composefs on / -> now DM_VERITY_ACTIVE becomes 1
        (empty_sysroot / "proc/mounts").write_text("composefs / composefs ro,relatime,verity 0 0\n")
        self.assertNotEqual(core.get_os_enforced_flags(auth_sock="") & ya.OS_FLAG_DM_VERITY_ACTIVE, 0)

        # Populate chipsec.status with FAILED -> must be 0; with PASSED -> becomes 1
        (empty_sysroot / "run/yubiOS").mkdir(parents=True, exist_ok=True)
        (empty_sysroot / "run/yubiOS/chipsec.status").write_text("RESULT=FAILED\n")
        self.assertEqual(core.get_os_enforced_flags(auth_sock="") & ya.OS_FLAG_CHIPSEC_PASSED, 0)
        (empty_sysroot / "run/yubiOS/chipsec.status").write_text("RESULT=PASSED\n")
        self.assertNotEqual(core.get_os_enforced_flags(auth_sock="") & ya.OS_FLAG_CHIPSEC_PASSED, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
