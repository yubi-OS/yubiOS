import os, subprocess, sys, shutil, stat
TSV = sys.argv[1]
WORK = sys.argv[2] if len(sys.argv) > 2 else "/tmp/fakeroot-check"
S = 1792321149_000000000
S5 = 1792321149_500000000
REF = 1792321520_000000000
BASE_BOOT = 1792321400_987654321
EFI_O = 1792321401_222222222
LINUX_O = 1792321402_333333333
UKI_O = 1792321403_444444444
SYSD_O = 1792321403_555555555
BOOTD_O = 1792321403_666666666
DIAG_O = 1792321404_555555555
DIAGF_O = 1792321404_666666666
ETC_O = 1792321300_111111111
RES_O = 1792321300_222222222
PROC_O = 1792321100_000000001
ROOT_O = 1792321500_123456789
USR_O = 1792321000_111111111
FILES = [
 ("boot/EFI/Linux/uki.efi", UKI_O), ("boot/EFI/systemd/systemd-bootx64.efi", SYSD_O),
 ("boot/EFI/BOOT/BOOTX64.EFI", BOOTD_O), ("boot/yubios-diag/diag.txt", DIAGF_O),
 ("usr/lib/os-release", USR_O), ("etc/hosts", ETC_O), ("etc/resolv.conf", ETC_O),
 ("etc/hostname", ETC_O), ("run/systemd/resolve/resolv.conf", RES_O)]
DIRS = [("boot", BASE_BOOT), ("boot/EFI", EFI_O), ("boot/EFI/Linux", LINUX_O),
 ("boot/EFI/systemd", 1792321403_700000000), ("boot/EFI/BOOT", 1792321403_800000000),
 ("boot/yubios-diag", DIAG_O), ("usr", USR_O), ("usr/lib", USR_O), ("etc", ETC_O),
 ("run", 1792321300_900000000), ("run/systemd", RES_O), ("run/systemd/resolve", RES_O),
 ("proc", PROC_O), ("sys", PROC_O), ("dev", PROC_O), ("var", 1792321600_000000000)]
def build(root):
    os.makedirs(root)
    for d, _ in DIRS: os.makedirs(os.path.join(root, d), exist_ok=True)
    for f, _ in FILES:
        with open(os.path.join(root, f), "w") as fh: fh.write("x\n")
    for f, t in FILES: os.utime(os.path.join(root, f), ns=(t, t))
    for d, t in sorted(DIRS, key=lambda x: -x[0].count("/")):
        os.utime(os.path.join(root, d), ns=(t, t))
    os.chmod(os.path.join(root, "boot"), 0o755)
    os.utime(root, ns=(ROOT_O, ROOT_O))
ORIG = {k: v for k, v in FILES + DIRS}
ORIG["."] = ROOT_O
def snap(root):
    out = {".": os.lstat(root).st_mtime_ns}
    for dp, dn, fn in os.walk(root):
        for n in dn + fn:
            p = os.path.join(dp, n)
            out[os.path.relpath(p, root)] = os.lstat(p).st_mtime_ns
    return out
def under(k, p): return k == p or k.startswith(p + "/")
def boot_keys(s): return [k for k in s if under(k, "boot") and k != "boot"]
PRUNE18 = ["proc", "sys", "dev", "run"]
PRUNE20 = ["proc", "sys", "dev", "etc/hosts", "etc/resolv.conf", "etc/hostname", "run/systemd/resolve"]
def expect(vid, s, root):
    e = []
    def need(c, msg):
        if not c: e.append(msg)
    if vid == "V00": need(s["boot"] == BASE_BOOT and s["boot/EFI"] == EFI_O, "base state changed")
    elif vid == "V07": need(s["boot"] == S and s["boot/EFI"] == EFI_O and "boot/EFI/Linux/uki.efi" in s, "V07 state")
    elif vid == "V21": need(s["boot"] == S5 and s["boot/EFI"] == EFI_O, "V21 state")
    elif vid == "V22": need(s["boot"] == S and s["boot/EFI"] == S5 and s["boot/EFI/Linux"] == LINUX_O and s["boot/yubios-diag"] == DIAG_O, "V22 state")
    elif vid == "V15": need(all(s[k] == S for k in s if under(k, "boot")), "V15 not all /boot == S")
    elif vid in ("V16", "V03"): need(boot_keys(s) == [] and s["boot"] == S, vid + " state")
    elif vid == "V19": need("boot/EFI" not in s and s["boot/yubios-diag"] == S and s["boot"] == S, "V19 state")
    elif vid == "V01": need("boot/EFI" not in s and "boot/yubios-diag" not in s and s["boot"] == BASE_BOOT, "V01 state")
    elif vid == "V02": need(boot_keys(s) == [] and s["boot"] not in (S, REF, BASE_BOOT), "V02 state")
    elif vid == "V14": need(s["boot"] == S and s["boot/EFI"] == S, "V14 state")
    elif vid == "V08": need(s["boot"] == REF and s["boot/EFI"] == EFI_O, "V08 state")
    elif vid == "V09": need(s["boot"] == 0 and s["boot/EFI"] == EFI_O, "V09 state")
    elif vid == "V11": need("boot/EFI/Linux" not in s and s["boot/EFI"] == EFI_O and s["boot"] == BASE_BOOT, "V11 state")
    elif vid == "V12": need("boot/EFI/systemd" not in s and "boot/EFI/BOOT" not in s and "boot/EFI/Linux/uki.efi" in s and s["boot/EFI"] == EFI_O, "V12 state")
    elif vid == "V13": need(s["boot/EFI"] == S and s["boot"] == BASE_BOOT and s["boot/EFI/Linux"] == LINUX_O, "V13 state")
    elif vid == "V05": need("boot/EFI" not in s and "boot/yubios-diag" not in s and s["boot"] == S, "V05 state")
    elif vid == "V06": need("boot/EFI" not in s and "boot/yubios-diag" not in s and s["boot"] == REF, "V06 state")
    elif vid == "V04": need(boot_keys(s) == [] and s["boot"] == REF, "V04 state")
    elif vid == "V10": need(boot_keys(s) == [] and s["boot"] == 0, "V10 state")
    elif vid == "V17":
        need(boot_keys(s) == [] and s["boot"] == S and s["."] == ROOT_O, "V17 state")
        need(stat.S_IMODE(os.lstat(os.path.join(root, "boot")).st_mode) == 0o755, "V17 mode")
    elif vid in ("V18", "V20"):
        prune = PRUNE18 if vid == "V18" else PRUNE20
        for k, v in s.items():
            want = ORIG[k] if (k != "." and any(under(k, p) for p in prune)) else S
            if k == ".": want = S
            if v != want: e.append("%s %s=%d want %d" % (vid, k, v, want)); break
    else: e.append("no expectation defined")
    if vid not in ("V18", "V20"):
        for k, v in s.items():
            if k == "." or under(k, "boot"): continue
            if v != ORIG.get(k, v): e.append("outside-boot changed: " + k); break
    return e
shutil.rmtree(WORK, ignore_errors=True)
base = os.path.join(WORK, "base"); build(base)
rows = [l.rstrip("\n").split("\t") for l in open(TSV) if l.strip()][1:]
bad = 0
for prio, vid, vbase, cmd in rows:
    R = os.path.join(WORK, "run", vid + "-" + vbase, "root")
    os.makedirs(os.path.dirname(R), exist_ok=True)
    subprocess.run(["cp", "-a", base + "/.", R], check=True)
    r = subprocess.run(["bash", "-c", cmd], cwd=R, env=dict(os.environ, R=R), capture_output=True, text=True)
    errs = [] if r.returncode == 0 else ["cmd rc=%d %s" % (r.returncode, r.stderr.strip()[-120:])]
    if r.returncode == 0:
        errs += expect(vid, snap(R), R)
    status = "PASS" if not errs else "FAIL"
    bad += bool(errs)
    print("%s %-4s %-5s prio=%s %s" % (status, vid, vbase, prio, "; ".join(errs)))
print("rows=%d failing=%d" % (len(rows), bad))
