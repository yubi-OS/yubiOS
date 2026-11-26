#!/bin/sh
# SPDX-License-Identifier: LGPL-2.1-or-later
# dracut pre-pivot 61 hook (sourced by dracut-pre-pivot): runs after ima_policy=tcb has measured the
# initramfs and right before switch-root to $NEWROOT.
#
# 1. keyctl padd the IMA signer (leaf) cert into %:.ima. The kernel only accepts it when its CA is
#    trusted via .machine -> .secondary_trusted_keys, i.e. when systemd-boot ran the db-signed
#    yubios-ima-mokvar driver that installs LINUX_EFI_MOK_VARIABLE_TABLE.
# 2. Make $NEWROOT/etc/ima/ima-policy byte-identical to the initramfs copy and set its
#    security.ima from ima-policy.sig.hex (copy + signature come from the same build).
# 3. PID 1 freeze guard: systemd's ima_setup() (src/core/ima-setup.c) falls back to writing the
#    policy line by line when the path write fails; with Secure Boot's arch rule
#    "appraise func=POLICY_CHECK appraise_type=imasig" the kernel rejects that (-EACCES),
#    initialize_security() fails and PID 1 freezes. So if appraisal is required and the key is
#    not in %:.ima (direct UKI boot, driver missing, CA rejected) or the xattr did not stick,
#    remove $NEWROOT/etc/ima/ima-policy: the boot continues on ima_policy=tcb.

yubios_ima_kmsg() {
    printf '<4>yubios-ima: %s\n' "$*" > "${YUBIOS_IMA_KMSG:-/dev/kmsg}" 2>/dev/null || true
}

yubios_ima_load() {
    _src="${YUBIOS_IMA_INITRD_DIR:-/usr/lib/yubiOS/ima}"
    _root="${NEWROOT:-/sysroot}"
    _secfs="${YUBIOS_IMA_SECFS_POLICY:-/sys/kernel/security/ima/policy}"
    _dst="$_root/etc/ima/ima-policy"
    _key_ok=0
    _xattr_ok=0

    if [ -s "$_src/yubios-ima.der" ]; then
        if keyctl padd asymmetric "yubios-ima" %:.ima < "$_src/yubios-ima.der" >/dev/null 2>&1; then
            yubios_ima_kmsg "loaded yubios-ima signer into .ima"
        else
            yubios_ima_kmsg "keyctl padd into .ima rejected (IMA CA not in .machine? yubios-ima-mokvar driver not run)"
        fi
    fi
    if keyctl list %:.ima 2>/dev/null | grep -q 'yubios-ima'; then
        _key_ok=1
    fi

    if [ "$_key_ok" = 1 ] && [ -s "$_src/ima-policy" ] && [ -s "$_src/ima-policy.sig.hex" ] && [ -d "$_root/etc" ]; then
        mkdir -p "$_root/etc/ima"
        if ! cmp -s "$_src/ima-policy" "$_dst" 2>/dev/null; then
            cp -f "$_src/ima-policy" "$_dst"
        fi
        _hex="$(cat "$_src/ima-policy.sig.hex")"
        setfattr -n security.ima -v "$_hex" "$_dst" 2>/dev/null || true
        _cur="$(getfattr --absolute-names -n security.ima -e hex "$_dst" 2>/dev/null | sed -n 's/^security\.ima=//p')"
        if [ "$_cur" = "$_hex" ] && cmp -s "$_src/ima-policy" "$_dst"; then
            _xattr_ok=1
        fi
    fi

    _appraise=1
    if [ -r "$_secfs" ]; then
        if ! grep -q 'appraise func=POLICY_CHECK' "$_secfs" 2>/dev/null; then
            _appraise=0
        fi
    fi

    if [ "$_appraise" = 1 ] && [ -e "$_dst" ] && { [ "$_key_ok" != 1 ] || [ "$_xattr_ok" != 1 ]; }; then
        rm -f "$_dst"
        yubios_ima_kmsg "POLICY_CHECK appraisal active but signed policy cannot load (key=$_key_ok xattr=$_xattr_ok): removed $_dst so PID 1 ima_setup() cannot freeze the boot; staying on ima_policy=tcb"
    fi
    unset _src _root _secfs _dst _key_ok _xattr_ok _hex _cur _appraise
    return 0
}

yubios_ima_load
