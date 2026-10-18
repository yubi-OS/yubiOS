import os
S = "1792321149"
S5 = "1792321149.500000000"
R_ = "1792321520"
E = 'find "$R/boot" -mindepth 1 -delete'
M = "touch -h -d @" + S
ROWS = [
(1,"V00","true"),
(1,"V07",M+' "$R/boot"'),
(1,"V21",'touch -h -d @'+S5+' "$R/boot"'),
(1,"V15",'find "$R/boot" -mindepth 1 -exec touch -h -d @'+S+' {} + ; '+M+' "$R/boot"'),
(1,"V16",E+' ; find "$R/boot" -mindepth 0 -exec touch -h -d @'+S+' {} +'),
(1,"V03",E+' ; '+M+' "$R/boot"'),
(1,"V01",'m=$(stat -c %.9Y "$R/boot") ; rm -rf "$R/boot/EFI" "$R/boot/yubios-diag" ; touch -h -d "@$m" "$R/boot"'),
(1,"V02",E+' ; echo "BOOT_MTIME_AS_RM_LEFT=$(stat -c %.9Y "$R/boot")" >&2'),
(2,"V19",'rm -rf "$R/boot/EFI" ; find "$R/boot" -mindepth 0 -exec touch -h -d @'+S+' {} +'),
(2,"V14",'touch -h -d @'+S+' "$R/boot" "$R/boot/EFI"'),
(2,"V08",'touch -h -d @'+R_+' "$R/boot"'),
(2,"V09",'touch -h -d @0 "$R/boot"'),
(2,"V11",'e=$(stat -c %.9Y "$R/boot/EFI") ; rm -rf "$R/boot/EFI/Linux" ; touch -h -d "@$e" "$R/boot/EFI"'),
(2,"V12",'e=$(stat -c %.9Y "$R/boot/EFI") ; rm -rf "$R/boot/EFI/systemd" "$R/boot/EFI/BOOT" ; touch -h -d "@$e" "$R/boot/EFI"'),
(2,"V13",M+' "$R/boot/EFI"'),
(2,"V05",'rm -rf "$R/boot/EFI" "$R/boot/yubios-diag" ; '+M+' "$R/boot"'),
(2,"V06",'rm -rf "$R/boot/EFI" "$R/boot/yubios-diag" ; touch -h -d @'+R_+' "$R/boot"'),
(2,"V04",E+' ; touch -h -d @'+R_+' "$R/boot"'),
(2,"V10",E+' ; touch -h -d @0 "$R/boot"'),
(2,"V17",'B="$R/boot" ; RM=$(stat -c %.9Y "$R") ; M=$(stat -c %a "$B") ; O=$(stat -c %u:%g "$B") ; rm -rf "$B" && mkdir "$B" && chmod "$M" "$B" && chown "$O" "$B" && '+M+' "$B" && touch -h -d "@$RM" "$R"'),
(2,"V22",M+' "$R/boot" ; if [ -d "$R/boot/EFI" ]; then touch -h -d @'+S5+' "$R/boot/EFI"; fi'),
(3,"V18",'find "$R" -xdev -mindepth 1 \\( -path "$R/proc" -o -path "$R/sys" -o -path "$R/dev" -o -path "$R/run" \\) -prune -o -exec touch -h -d @'+S+' {} + ; '+M+' "$R"'),
(3,"V20",'find "$R" -xdev -mindepth 1 \\( -path "$R/proc" -o -path "$R/sys" -o -path "$R/dev" -o -path "$R/etc/hosts" -o -path "$R/etc/resolv.conf" -o -path "$R/etc/hostname" -o -path "$R/run/systemd/resolve" \\) -prune -o -exec touch -h -d @'+S+' {} + ; '+M+' "$R"'),
]
out = ["prio\tid\tbase\tcmd"]
seen = set()
for p, v, c in ROWS:
    assert "\t" not in c and "\n" not in c and v not in seen, v
    seen.add(v)
    for b in ("FA02", "D7E"):
        out.append("%d\t%s\t%s\t%s" % (p, v, b, c))
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "variants_v2.tsv"), "w").write("\n".join(out) + "\n")
print("variants", len(ROWS), "ids", "rows", len(out) - 1, "prio1 ids", [r[1] for r in ROWS if r[0]==1], "prio3 ids", [r[1] for r in ROWS if r[0]==3])
