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


REPO = pathlib.Path(__file__).resolve().parents[2]
GCC_RELEASE = "https://github.com/yubi-OS/gnome-control-center/releases/download/v51.2.1-yubios.1"
GCC_PINS = {
    "gnome-control-center-51.2.1-2.yubios.fc45.x86_64.rpm": (
        "5924324dbf2544940470dc6b7656405bcf3592f8133e8a9df1cbb5bd042d44b2",
        "504231f92b7ebb1bf84777c2dc3863b2cc7c90a785a9313c4169cf0866196d55003b9253bd8af6204462fbc9bb9874b28b693a014003ae0cf2e55419a3762457",
    ),
    "gnome-control-center-51.2.1-2.yubios.fc45.aarch64.rpm": (
        "565452664f0aae15f778610fa75456d389ea62e74e5acc9f573f5032dfd84d21",
        "fc34ab6bcfd4f1f9f556bece765214f99ae1f91594593e943d7ab700312badd3ecff97e3740e50bef5e7518bfb5f69ee7142d49a83b0e084d5f829fcca34b0aa",
    ),
    "gnome-control-center-filesystem-51.2.1-2.yubios.fc45.noarch.rpm": (
        "0ff4b91ecab71e20d965cf1386c8426e089b4ee6458d785ffe9d977433d61e6e",
        "00eaa112cef405b590722e2266d0ad1f9a0124137a423cfb3035e6fc9254306cb66c042199c1ad4a3b4c4b81bf0bb2ec519f0f4462b84ea498e539df29d74fc8",
    ),
}
UCM_HIFI = "usr/share/alsa/ucm2/Rockchip/rk3588-es8316/HiFi.conf"
WP_DROPIN = "usr/share/wireplumber/wireplumber.conf.d/50-yubios-rk3588-hdmi-audio.conf"


def wp_block(text: str, match: str) -> str:
    start = text.index(match)
    nxt = text.find("matches = [", start)
    return text[start:] if nxt == -1 else text[start:nxt]


@unittest.skipUnless((REPO / "Containerfile").exists(), "repo checkout not available")
class ImageWiringTests(unittest.TestCase):
    """Static checks: System Trust RPM pin (OMN-193) and RK3588 audio wiring (OMN-194)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.containerfile = (REPO / "Containerfile").read_text()
        cls.pinned = (REPO / "PINNED.md").read_text()

    def test_gnome_control_center_release_rpms_pinned(self) -> None:
        cf = self.containerfile
        self.assertIn(f'gcc_base="{GCC_RELEASE}"', cf)
        self.assertIn('"${gcc_base}/gnome-control-center-51.2.1-2.yubios.fc45.${gcc_arch}.rpm"', cf)
        self.assertIn('"${gcc_base}/gnome-control-center-filesystem-51.2.1-2.yubios.fc45.noarch.rpm"', cf)
        for sha256, sha512 in GCC_PINS.values():
            self.assertIn(sha256, cf)
            self.assertIn(sha512, cf)
        self.assertIn("sha256sum --check --strict /tmp/gcc.sha256", cf)
        self.assertIn("sha512sum --check --strict /tmp/gcc.sha512", cf)
        self.assertIn("rpm -Uvh --nodigest --nosignature --nodeps /tmp/gcc-fs.rpm && \\\n"
                      "    rpm -Uvh --nodigest --nosignature /tmp/gcc.rpm && \\\n", cf)
        self.assertNotIn("rpm -Uvh --nodigest --nosignature /tmp/gcc.rpm /tmp/gcc-fs.rpm", cf)
        self.assertIn("[ \"$(rpm -q --qf '%{VERSION}-%{RELEASE} ' gnome-control-center gnome-control-center-filesystem)\" = '51.2.1-2.yubios.fc45 51.2.1-2.yubios.fc45 ' ]", cf)
        self.assertIn("test -f /usr/share/applications/gnome-system-trust-panel.desktop", cf)
        self.assertIn("test -f /usr/share/icons/hicolor/scalable/apps/org.gnome.Settings-system-trust-symbolic.svg", cf)
        # installed after the dnf block and after Antimony, before the config overlay
        self.assertLess(cf.index("test -x /usr/lib/opt/antimony/chrome"), cf.index('gcc_base="'))
        self.assertLess(cf.index('gcc_base="'), cf.index("COPY usr/ /usr/"))

    def test_pinned_md_lists_release_assets(self) -> None:
        section = self.pinned.split("## yubi-OS Release Binaries", 1)[1].split("\n## ", 1)[0]
        for name, (sha256, sha512) in GCC_PINS.items():
            row = next((l for l in section.splitlines() if f"{GCC_RELEASE}/{name}" in l), None)
            self.assertIsNotNone(row, name)
            self.assertIn("f127a35fa7a313bf5a4ab7334925adb351e6f83c", row)
            self.assertIn(sha256, row)
            self.assertIn(sha512, row)

    def test_pipewire_pulse_installed_and_user_units_enabled(self) -> None:
        cf = self.containerfile
        self.assertRegex(cf, r"\n\s+pipewire-alsa \\\n\s+pipewire-pulseaudio \\\n")
        self.assertIn(
            "RUN systemctl preset-all && \\\n    systemctl --global enable pipewire.socket pipewire-pulse.socket wireplumber.service && \\\n",
            cf,
        )

    def test_es8316_ucm_override_has_no_jack_control(self) -> None:
        hifi = (REPO / UCM_HIFI).read_text()
        self.assertNotIn("JackControl", hifi)
        self.assertIn('SectionDevice."Headphones"', hifi)
        self.assertIn('SectionDevice."Headset"', hifi)
        self.assertIn(f"test -f /{UCM_HIFI} && ! grep -q 'JackControl' /{UCM_HIFI}", self.containerfile.replace(" && \\\n    !", " && !"))
        self.assertLess(self.containerfile.index("COPY usr/ /usr/"), self.containerfile.index(f"test -f /{UCM_HIFI}"))

    def test_wireplumber_dropin_single_canonical_copy(self) -> None:
        self.assertNotIn("/etc/wireplumber", self.containerfile)
        wp = (REPO / WP_DROPIN).read_text()
        self.assertNotIn("api.alsa.auto-profile", wp)
        self.assertNotIn("api.alsa.auto-port", wp)
        self.assertNotIn("node.pause-on-idle", wp)
        hdmi_card = wp_block(wp, '"~alsa_card.platform-hdmi*"')
        self.assertIn("api.acp.auto-profile = false", hdmi_card)
        self.assertIn("api.acp.auto-port = false", hdmi_card)
        analog_card = wp_block(wp, '"~alsa_card.platform-analog-sound*"')
        for prop in ("api.alsa.use-acp = true", "api.alsa.use-ucm = true", "api.acp.auto-profile = false",
                     "api.acp.auto-port = false", 'device.profile = "HiFi"'):
            self.assertIn(prop, analog_card)
        hdmi_node = wp_block(wp, '"~alsa_output.platform-hdmi*"')
        self.assertNotIn("session.suspend-timeout-seconds", hdmi_node)
        for node in ('"~alsa_output.platform-hdmi*"', '"~alsa_output.platform-analog-sound*"'):
            blk = wp_block(wp, node)
            for prop in ('audio.format = "S16LE"', "audio.rate = 48000", "audio.channels = 2", 'audio.position = "FL,FR"'):
                self.assertIn(prop, blk)

    def test_rk3588_usb_root_hubs_kept_active(self) -> None:
        rules = (REPO / "usr/lib/udev/rules.d/90-yubios-rk3588-usb.rules").read_text()
        self.assertIn(
            'ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="1d6b", KERNELS=="fc400000.usb|fcd00000.usb", ATTR{power/control}="on"',
            rules,
        )


if __name__ == "__main__":
    unittest.main()
