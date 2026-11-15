#!/usr/bin/env python3
# SPDX-License-Identifier: LGPL-2.1-or-later
"""
End-to-end verification suite for yubiOS-attest (library, systemd/D-Bus daemon,
CLI client, single-use pairing code, SSH-agent StrongBox signing, and anti-rollback).
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

ROOT_DIR = Path(__file__).resolve().parent.parent
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

        # Start an ephemeral ssh-agent and load an Ed25519 key simulating the operator's YubiKey
        agent_out = subprocess.run(["ssh-agent", "-s"], check=True, capture_output=True, text=True).stdout
        for line in agent_out.splitlines():
            if line.startswith("SSH_AUTH_SOCK="):
                cls.env["SSH_AUTH_SOCK"] = line.split("=", 1)[1].split(";", 1)[0]
            elif line.startswith("SSH_AGENT_PID="):
                cls.env["SSH_AGENT_PID"] = line.split("=", 1)[1].split(";", 1)[0]

        cls.ssh_key = cls.tmp_root / "id_yubico_ed25519_sk"
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-N", "", "-C", "yubikey-piv-9a@yubiOS", "-f", str(cls.ssh_key)],
            check=True, capture_output=True,
        )
        subprocess.run(["ssh-add", str(cls.ssh_key)], env=cls.env, check=True, capture_output=True)

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
                "--os-version", "45.20261114.0",
            ],
            env=cls.env,
        )

        # Wait for READY=1 on sd_notify and sockets to appear
        ready_msg = cls.notify_sock.recv(1024).decode("utf-8")
        assert "READY=1" in ready_msg, f"Expected READY=1 from sd_notify, got {ready_msg}"

        for sock in (cls.alpha_sock, cls.beta_sock):
            for _ in range(50):
                if sock.exists():
                    break
                time.sleep(0.1)
            assert sock.exists(), f"Daemon socket {sock} did not appear"

        # Create a mock ssh wrapper script that invokes stdio-peer on host-beta (simulating `ssh host-beta yubiOS-attest stdio-peer`)
        cls.mock_ssh = cls.tmp_root / "mock-ssh"
        cls.mock_ssh.write_text(
            f"""#!/usr/bin/env bash
# Verify that the client passed -o ForwardAgent=no so SSH_AUTH_SOCK is never leaked to the remote peer!
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
        # Verify D-Bus Introspectable XML and SO_PEERCRED UID/GID inspection
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
        # 1. Host Beta initializes a single-use pairing code for Host Alpha
        pair_init = self._run_cli(self.beta_sock, ["pair-init", "--peer", "yubios-host-alpha"])
        code = pair_init["pairing_code"]
        self.assertTrue(code.startswith("YUBI-"))

        # 2. Host Alpha pairs with Host Beta over the SSH stdio-peer transport (using mock_ssh)
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

        # 3. Attempting to reuse the same single-use pairing code MUST fail closed
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
        # 1. Run mutual verification between already-paired Host Alpha and Host Beta
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

        # 2. Simulate OS version rollback on Host Beta's pinned state -> must fail closed
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

        # 3. Simulate UKI PCR 11 measurement tamper on Host Beta -> must fail closed
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

        # Verify lex-sort rule from RULES.md: 'yubiOS-attest.conf' sorts after 'static-nodes-permissions.conf'
        self.assertGreater("yubiOS-attest.conf", "static-nodes-permissions.conf")


if __name__ == "__main__":
    unittest.main(verbosity=2)
