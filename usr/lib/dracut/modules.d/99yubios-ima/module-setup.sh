#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# dracut module yubios-ima: load the build's IMA signer cert into %:.ima at pre-pivot and make
# sure PID 1's ima_setup() only ever sees a /etc/ima/ima-policy it can load (see load-ima-key.sh).

check() {
    return 0
}

depends() {
    return 0
}

install() {
    inst_multiple keyctl setfattr getfattr cmp
    inst_simple /usr/lib/yubiOS/ima/yubios-ima.der
    inst_simple /usr/lib/yubiOS/ima/ima-policy
    inst_simple /usr/lib/yubiOS/ima/ima-policy.sig.hex
    # shellcheck disable=SC2154  # $moddir is set by dracut for every module
    inst_hook pre-pivot 61 "$moddir/load-ima-key.sh"
}
