#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent / "system-trust-status.sh"
if not SCRIPT.exists():
    SCRIPT = pathlib.Path(__file__).resolve().parents[2] / "usr/lib/yubiOS/system-trust-status.sh"


def write_efivar(root: pathlib.Path, name: str, val: int) -> None:
    efidir = root / "sys/firmware/efi/efivars"
    efidir.mkdir(parents=True, exist_ok=True)
    (efidir / name).write_bytes(b"\x07\x00\x00\x00" + bytes([val]))


class SystemTrustStatusTests(unittest.TestCase):
    def run_probe(self, root: pathlib.Path, *args: str) -> str:
        env = os.environ.copy()
        env["YUBIOS_TRUST_SYSROOT"] = str(root)
        res = subprocess.run(
            ["bash", str(SCRIPT), *args],
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        return res.stdout

    def test_all_verified_when_evidence_present(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            write_efivar(root, "SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c", 1)
            write_efivar(root, "SetupMode-8be4df61-93ca-11d2-aa0d-00e098032b8c", 0)
            write_efivar(root, "StubPcrKernelImage-4a67b082-0a4c-41cf-b6c7-440b29bb8c4f", 1)
            (root / "dev").mkdir(parents=True, exist_ok=True)
            (root / "dev/tpmrm0").write_text("")
            (root / "proc").mkdir(parents=True, exist_ok=True)
            (root / "proc/cmdline").write_text("root=UUID=1234 ro composefs=990ebc2678ff3dbca3f0143c8d5f1a15\n")
            (root / "proc/mounts").write_text("composefs / composefs ro,relatime,verity 0 0\n")
            (root / "run").mkdir(parents=True, exist_ok=True)
            (root / "run/ostree-booted").write_text("")
            (root / "var/lib/yubiOS/sb").mkdir(parents=True, exist_ok=True)
            (root / "var/lib/yubiOS/.enrolled").write_text("")
            (root / "var/lib/yubiOS/sb/db.crt").write_text("CERT")
            (root / "etc/yubico").mkdir(parents=True, exist_ok=True)
            (root / "etc/yubico/u2f_keys").write_text("yubios:KH1,PK1,es256,+presence\n")

            out = self.run_probe(root)
            self.assertIn("FIRMWARE_STATUS=Verified", out)
            self.assertIn("FIRMWARE_CLASS=verified", out)
            self.assertIn("BOOT_IMAGE_STATUS=Verified", out)
            self.assertIn("BOOT_IMAGE_CLASS=verified", out)
            self.assertIn("root-mount=composefs", out)
            self.assertIn("OWNER_KEY_STATUS=Verified", out)
            self.assertIn("OWNER_KEY_CLASS=verified", out)

            j = json.loads(self.run_probe(root, "--json"))
            self.assertEqual(j["firmware"]["status"], "Verified")
            self.assertEqual(j["boot_image"]["status"], "Verified")
            self.assertEqual(j["owner_key"]["status"], "Verified")

    def test_unreadable_setupmode_and_unmounted_composefs_not_verified(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            # SecureBoot=1 present, but SetupMode efivar is unreadable/absent -> MUST NOT be Verified or display SetupMode=0
            write_efivar(root, "SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c", 1)
            # composefs= present in /proc/cmdline, but / is mounted as ext4 (not composefs) -> MUST NOT be Verified
            (root / "proc").mkdir(parents=True, exist_ok=True)
            (root / "proc/cmdline").write_text("root=UUID=1234 ro composefs=990ebc2678ff3dbca3f0143c8d5f1a15\n")
            (root / "proc/mounts").write_text("/dev/sda2 / ext4 rw,relatime 0 0\n")

            out = self.run_probe(root)
            self.assertIn("FIRMWARE_STATUS=Unverified", out)
            self.assertIn("FIRMWARE_CLASS=warning", out)
            self.assertIn("SetupMode=unknown", out)
            self.assertNotIn("SetupMode=0", out)

            self.assertIn("BOOT_IMAGE_STATUS=Unverified", out)
            self.assertIn("BOOT_IMAGE_CLASS=warning", out)
            self.assertIn("root-mount=ext4", out)

    def test_unverified_and_chipsec_failed_states(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            (root / "run/yubiOS").mkdir(parents=True, exist_ok=True)
            (root / "run/yubiOS/chipsec-firstboot.status").write_text("RESULT=FAILED\n")
            out = self.run_probe(root)
            self.assertIn("FIRMWARE_STATUS=Failed", out)
            self.assertIn("FIRMWARE_CLASS=failed", out)
            self.assertIn("SecureBoot=unknown", out)
            self.assertIn("SetupMode=unknown", out)
            self.assertIn("BOOT_IMAGE_STATUS=Unmeasured", out)
            self.assertIn("OWNER_KEY_STATUS=Not Enrolled", out)


if __name__ == "__main__":
    unittest.main()
