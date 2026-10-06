#!/usr/bin/env bash

# Native local equivalent of the build, QEMU verification, and firmware-publish
# paths in .github/workflows/ci_firmware-rk.yml. This file is sourced by
# scripts/build-local-images.sh after the pinned DHI/rootless Docker bootstrap.

readonly LOCAL_TFA_REF='da738d5eae93af342fdc4995dd3c05acb4c9d757'
readonly LOCAL_OPTEE_OS_REF='440b10c3f9b1c8501f2550e282ae071bb5424972'
readonly LOCAL_OPTEE_FTPM_REF='5e09cdbe1bcb1bc3bcf4875ebafb4e1a1154417c'
readonly LOCAL_UBOOT_REF='5508406582f6f7120dce0c4b3059819a41788db2'
readonly LOCAL_EDK2_REF='b7a715f7c03c45c6b4575bf88596bfd79658b8ce'
readonly LOCAL_EDK2_PLATFORMS_REF='cc384840c440415a091623a7658112fedc416094'
readonly LOCAL_MS_TPM_REF='98b60a44aba79b15fcce1c0d1e46cf5918400f6a'
readonly LOCAL_MBEDTLS_REF='0bebf8b8c7f07abe3571ded48a11aa907a1ffb20'
readonly LOCAL_FTPM_UUID='bc50d971-d4c9-42c4-82cb-343fb7f37896'
readonly LOCAL_STMM_PLATFORM='Platform/StandaloneMm/PlatformStandaloneMmPkg/PlatformStandaloneMmRpmb.dsc'

install_local_firmware_dependencies() {
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends \
        bc bison build-essential ca-certificates coreutils \
        device-tree-compiler flex gcc-aarch64-linux-gnu \
        gcc-arm-linux-gnueabihf gcc-arm-none-eabi git iasl ipxe-qemu \
        libgnutls28-dev libssl-dev nasm openssl python3 \
        python3-cryptography python3-dev python3-pyelftools python3-setuptools \
        python3-venv qemu-system-arm qemu-utils swig tpm2-tools uuid-dev

    if [[ "$(uname -m)" == x86_64 ]]; then
        FW_AARCH64_PREFIX=aarch64-linux-gnu-
    else
        FW_AARCH64_PREFIX=
    fi
    export FW_AARCH64_PREFIX
}

clone_local_pinned_source() {
    local repository=$1 ref=$2 destination=$3

    git init -q "$destination"
    git -C "$destination" remote add origin "$repository"
    git -C "$destination" fetch -q --depth=1 origin "$ref"
    git -C "$destination" checkout --detach FETCH_HEAD
    [[ "$(git -C "$destination" rev-parse HEAD)" == "$ref" ]] || \
        die "fetched source does not match pinned ref: $repository@$ref"
}

build_local_standalone_mm() {
    local fd stmm_root

    stmm_root="$FIRMWARE_ROOT/stmm"
    mkdir -p "$stmm_root"
    clone_local_pinned_source \
        https://github.com/yubi-OS/edk2.git "$LOCAL_EDK2_REF" "$stmm_root/edk2"
    clone_local_pinned_source \
        https://github.com/yubi-OS/edk2-platforms.git \
        "$LOCAL_EDK2_PLATFORMS_REF" "$stmm_root/edk2-platforms"
    git -C "$stmm_root/edk2" submodule update --init --recursive
    [[ -f "$stmm_root/edk2-platforms/$LOCAL_STMM_PLATFORM" ]] || \
        die 'the pinned edk2-platforms source is missing the StandaloneMM DSC'
    [[ -f "$stmm_root/edk2-platforms/${LOCAL_STMM_PLATFORM%.dsc}.fdf" ]] || \
        die 'the pinned edk2-platforms source is missing the StandaloneMM FDF'

    # VfrCompile generates several PCCTS outputs from one ordinary multi-target
    # rule, which is unsafe under parallel make on ARM64.
    make -C "$stmm_root/edk2/BaseTools" -j1
    write_reproducible_edk2_stack_cookies \
        "$stmm_root/Build/MmStandaloneRpmb/RELEASE_GCCNOLTO" \
        "${LOCAL_EDK2_REF}:${LOCAL_EDK2_PLATFORMS_REF}:${LOCAL_STMM_PLATFORM}"
    (
        export WORKSPACE="$stmm_root"
        export PACKAGES_PATH="$stmm_root/edk2:$stmm_root/edk2-platforms"
        export EDK_TOOLS_PATH="$stmm_root/edk2/BaseTools"
        export PYTHON_COMMAND=python3
        cd "$stmm_root/edk2" || die "cannot enter EDK2 source: $stmm_root/edk2"
        set +u
        # shellcheck disable=SC1091
        source ./edksetup.sh
        set -u
        sed -i \
            's@^#define MBEDTLS_HAVE_ASM@/* yubiOS local: aarch64 inline asm disabled */ // #define MBEDTLS_HAVE_ASM@' \
            CryptoPkg/Library/MbedTlsLib/Include/mbedtls/mbedtls_config.h
        sed -i \
            's@^#define MBEDTLS_AESCE_C@/* yubiOS local: ARM AES-CE disabled under -mgeneral-regs-only */ // #define MBEDTLS_AESCE_C@' \
            CryptoPkg/Library/MbedTlsLib/Include/mbedtls/mbedtls_config.h
        sed -i 's/ -Werror//g' Conf/tools_def.txt
        export GCCNOLTO_AARCH64_PREFIX="$FW_AARCH64_PREFIX"
        build -a AARCH64 -t GCCNOLTO -b RELEASE \
            -p "$LOCAL_STMM_PLATFORM" \
            -n "$(nproc)"
    )

    fd=$(find "$stmm_root/Build" -name BL32_AP_MM.fd -type f -print -quit)
    [[ -n "$fd" ]] || die 'the StandaloneMM build produced no BL32_AP_MM.fd'
    cp "$fd" "$FIRMWARE_ROOT/BL32_AP_MM.fd"
    sha256sum "$FIRMWARE_ROOT/BL32_AP_MM.fd"
}

configure_local_firmware_board() {
    case "$1" in
        qemu-arm64)
            FW_BOARD=qemu-arm64
            FW_BOARD_TITLE='QEMU ARM64 CI baseline'
            FW_BUILD_KIND=qemu
            FW_UBOOT_DEFCONFIG=qemu_arm64_defconfig
            FW_OPTEE_PLATFORM=vexpress-qemu_armv8a
            FW_OPTEE_FLAVOR=
            FW_TFA_PLAT=qemu
            FW_REQUIRES_TPL=false
            FW_REQUIRED_IMAGE=flash.bin
            FW_STORAGE_NOTE='Volatile StMM and fTPM NV for QEMU virt CI'
            FW_PUBLISH_ORIGINAL=true
            ;;
        rockpro64-rk3399)
            FW_BOARD=rockpro64-rk3399
            FW_BOARD_TITLE='ROCKPro64 / RK3399 supported secondary Path A'
            FW_BUILD_KIND=rockchip
            FW_UBOOT_DEFCONFIG=rockpro64-rk3399_defconfig
            FW_OPTEE_PLATFORM=rockchip
            FW_OPTEE_FLAVOR=rk3399
            FW_TFA_PLAT=rk3399
            FW_REQUIRES_TPL=false
            FW_REQUIRED_IMAGE=u-boot-rockchip.bin
            FW_STORAGE_NOTE='RPMB-backed StMM and fTPM NV required before production hardware claim'
            FW_PUBLISH_ORIGINAL=false
            ;;
        rock5b-rk3588)
            FW_BOARD=rock5b-rk3588
            FW_BOARD_TITLE='Radxa ROCK 5B / RK3588 primary Path A'
            FW_BUILD_KIND=rockchip
            FW_UBOOT_DEFCONFIG=rock5b-rk3588_defconfig
            FW_OPTEE_PLATFORM=rockchip
            FW_OPTEE_FLAVOR=rk3588
            FW_TFA_PLAT=rk3588
            FW_REQUIRES_TPL=true
            FW_REQUIRED_IMAGE=u-boot-rockchip.bin
            FW_STORAGE_NOTE='RPMB-backed StMM and fTPM NV required before production hardware claim'
            FW_PUBLISH_ORIGINAL=false
            ;;
        *)
            die "unknown firmware board: $1"
            ;;
    esac
    export FW_BOARD FW_BOARD_TITLE FW_BUILD_KIND FW_UBOOT_DEFCONFIG
    export FW_OPTEE_PLATFORM FW_OPTEE_FLAVOR FW_TFA_PLAT FW_REQUIRES_TPL
    export FW_REQUIRED_IMAGE FW_STORAGE_NOTE FW_PUBLISH_ORIGINAL
}

stage_local_uboot_source() {
    clone_local_pinned_source https://github.com/yubi-OS/u-boot "$LOCAL_UBOOT_REF" "$FW_BUILD_ROOT/u-boot"
    cat > "$FW_BUILD_ROOT/u-boot/yubios_ftpm.config" <<'EOF'
CONFIG_TEE=y
CONFIG_OPTEE=y
CONFIG_TPM=y
CONFIG_TPM_V2=y
CONFIG_TPM2_FTPM_TEE=y
CONFIG_EFI_LOADER=y
CONFIG_EFI_MM_COMM_TEE=y
CONFIG_EFI_TCG2_PROTOCOL=y
CONFIG_HASH=y
CONFIG_MEASURED_BOOT=y
CONFIG_CMD_TPM=y
CONFIG_BOOTDELAY=1
CONFIG_BOOTCOMMAND="tpm2 init && tpm2 startup TPM2_SU_CLEAR && tpm2 self_test full && echo YUBIOS_TPM_OK; bootefi bootmgr"
# CONFIG_UNIT_TEST is not set
EOF
}

build_local_qemu_uboot() {
    make -C "$FW_BUILD_ROOT/u-boot" \
        CROSS_COMPILE="$FW_AARCH64_PREFIX" ARCH=arm "$FW_UBOOT_DEFCONFIG"
    "$FW_BUILD_ROOT/u-boot/scripts/kconfig/merge_config.sh" -m \
        -O "$FW_BUILD_ROOT/u-boot" \
        "$FW_BUILD_ROOT/u-boot/.config" \
        "$FW_BUILD_ROOT/u-boot/yubios_ftpm.config"
    make -C "$FW_BUILD_ROOT/u-boot" \
        CROSS_COMPILE="$FW_AARCH64_PREFIX" ARCH=arm olddefconfig
    make -C "$FW_BUILD_ROOT/u-boot" -j"$(nproc)" \
        CROSS_COMPILE="$FW_AARCH64_PREFIX" ARCH=arm
    [[ -s "$FW_BUILD_ROOT/u-boot/u-boot.bin" ]] || die 'QEMU U-Boot produced no u-boot.bin'
    FW_BL33_BIN="$FW_BUILD_ROOT/u-boot/u-boot.bin"
}

build_local_optee_stack() {
    local devkit stripped tee_bin
    local -a optee_args

    clone_local_pinned_source https://github.com/yubi-OS/optee_os \
        "$LOCAL_OPTEE_OS_REF" "$FW_BUILD_ROOT/optee_os"
    optee_args=(PLATFORM="$FW_OPTEE_PLATFORM")
    if [[ -n "$FW_OPTEE_FLAVOR" ]]; then
        optee_args+=(PLATFORM_FLAVOR="$FW_OPTEE_FLAVOR")
    fi
    make -C "$FW_BUILD_ROOT/optee_os" -j"$(nproc)" \
        "${optee_args[@]}" \
        CROSS_COMPILE64=aarch64-linux-gnu- \
        CROSS_COMPILE=arm-linux-gnueabihf- \
        CFG_RPMB_FS=y CFG_REE_FS=n CFG_EARLY_TA=y \
        CFG_STMM_VOLATILE_STORAGE=y \
        CFG_CORE_HEAP_SIZE=524288 CFG_TEE_RAM_VA_SIZE=0x00400000 \
        CFG_TEE_CORE_LOG_LEVEL=3 CFG_TEE_TA_LOG_LEVEL=3 \
        ta_dev_kit
    devkit=$(find "$FW_BUILD_ROOT/optee_os/out" -type d -name export-ta_arm64 -print -quit)
    [[ -f "$devkit/mk/ta_dev_kit.mk" ]] || die 'OP-TEE produced no arm64 TA dev kit'

    clone_local_pinned_source https://github.com/yubi-OS/optee_ftpm \
        "$LOCAL_OPTEE_FTPM_REF" "$FW_BUILD_ROOT/optee_ftpm"
    clone_local_pinned_source https://github.com/yubi-OS/ms-tpm-20-ref \
        "$LOCAL_MS_TPM_REF" "$FW_BUILD_ROOT/ms-tpm-20-ref"
    make -C "$FW_BUILD_ROOT/optee_ftpm" -j"$(nproc)" \
        CFG_FTPM_VOLATILE_NV=y \
        TA_DEV_KIT_DIR="$devkit" \
        CFG_MS_TPM_20_REF="$FW_BUILD_ROOT/ms-tpm-20-ref" \
        CROSS_COMPILE_ta_arm64=aarch64-linux-gnu- \
        CFG_ARM64_ta_arm64=y
    stripped=$(find "$FW_BUILD_ROOT/optee_ftpm" \
        -name "${LOCAL_FTPM_UUID}.stripped.elf" -type f -print -quit)
    [[ -n "$stripped" ]] || die 'the fTPM build produced no stripped early TA'

    make -C "$FW_BUILD_ROOT/optee_os" -j"$(nproc)" \
        "${optee_args[@]}" \
        CROSS_COMPILE64=aarch64-linux-gnu- \
        CROSS_COMPILE=arm-linux-gnueabihf- \
        CFG_RPMB_FS=y CFG_REE_FS=n \
        CFG_STMM_VOLATILE_STORAGE=y \
        CFG_CORE_HEAP_SIZE=524288 CFG_TEE_RAM_VA_SIZE=0x00400000 \
        CFG_EARLY_TA=y EARLY_TA_PATHS="$stripped" \
        CFG_CORE_DYN_SHM=y \
        CFG_TEE_CORE_LOG_LEVEL=3 CFG_TEE_TA_LOG_LEVEL=3 \
        CFG_STMM_PATH="$FIRMWARE_ROOT/BL32_AP_MM.fd" \
        all

    FW_BL32_HDR=$(find "$FW_BUILD_ROOT/optee_os/out" -name tee-header_v2.bin -type f -print -quit)
    FW_BL32_PAGER=$(find "$FW_BUILD_ROOT/optee_os/out" -name tee-pager_v2.bin -type f -print -quit)
    FW_BL32_PAGEABLE=$(find "$FW_BUILD_ROOT/optee_os/out" -name tee-pageable_v2.bin -type f -print -quit)
    [[ -n "$FW_BL32_HDR" && -n "$FW_BL32_PAGER" && -n "$FW_BL32_PAGEABLE" ]] || \
        die 'the OP-TEE build produced an incomplete BL32 v2 image set'
    tee_bin=$(find "$FW_BUILD_ROOT/optee_os/out" -type f \
        \( -name tee.elf -o -name tee.bin \) -print -quit)
    [[ -n "$tee_bin" ]] || die 'the OP-TEE build produced no tee.elf or tee.bin'
    FW_TEE_BIN=$tee_bin
}

build_local_trusted_firmware() {
    local bl31 fip m0_makefile tfa_ld
    local -a tfa_args

    clone_local_pinned_source https://github.com/yubi-OS/arm-trusted-firmware \
        "$LOCAL_TFA_REF" "$FW_BUILD_ROOT/arm-trusted-firmware"
    if [[ "$FW_TFA_PLAT" == rk3399 ]]; then
        m0_makefile="$FW_BUILD_ROOT/arm-trusted-firmware/plat/rockchip/rk3399/drivers/m0/Makefile"
        sed -i 's/-Wall -O3 -nostdlib/-Wall -Os -nostdlib/' "$m0_makefile"
        grep -q -- '-Wall -Os -nostdlib' "$m0_makefile"
    fi

    tfa_args=(
        CROSS_COMPILE="$FW_AARCH64_PREFIX"
        PLAT="$FW_TFA_PLAT"
        ARCH=aarch64
        BUILD_MESSAGE_TIMESTAMP="\"${TF_A_BUILD_TIMESTAMP}\""
        BUILD_STRING="$TF_A_BUILD_STRING"
    )
    if [[ "$FW_TFA_PLAT" == rk3399 ]]; then
        tfa_ld="${FW_AARCH64_PREFIX}ld.bfd"
        [[ -n "$FW_AARCH64_PREFIX" ]] || tfa_ld=ld.bfd
        command -v "$tfa_ld" >/dev/null
        tfa_args+=(LD="$tfa_ld")
    fi

    if [[ "$FW_BUILD_KIND" == qemu ]]; then
        git init -q "$FW_BUILD_ROOT/mbedtls"
        git -C "$FW_BUILD_ROOT/mbedtls" remote add origin https://github.com/Mbed-TLS/mbedtls
        git -C "$FW_BUILD_ROOT/mbedtls" fetch --depth 1 origin "$LOCAL_MBEDTLS_REF"
        git -C "$FW_BUILD_ROOT/mbedtls" checkout --detach FETCH_HEAD
        make -C "$FW_BUILD_ROOT/arm-trusted-firmware" -j"$(nproc)" \
            "${tfa_args[@]}" \
            SPD=opteed \
            BL32="$FW_BL32_HDR" \
            BL32_EXTRA1="$FW_BL32_PAGER" \
            BL32_EXTRA2="$FW_BL32_PAGEABLE" \
            BL32_RAM_LOCATION=tdram \
            BL33="$FW_BL33_BIN" \
            TRUSTED_BOARD_BOOT=1 GENERATE_COT=1 CREATE_KEYS=1 \
            MBEDTLS_DIR="$FW_BUILD_ROOT/mbedtls" \
            DEBUG=1 \
            all fip
        fip=$(find "$FW_BUILD_ROOT/arm-trusted-firmware/build" -name fip.bin -type f -print -quit)
        [[ -n "$fip" ]] || die 'TF-A produced no QEMU fip.bin'
        FW_FIP_BIN=$fip
    else
        make -C "$FW_BUILD_ROOT/arm-trusted-firmware" -j"$(nproc)" \
            "${tfa_args[@]}" bl31
        bl31=$(find "$FW_BUILD_ROOT/arm-trusted-firmware/build" \
            -path '*/release/bl31/bl31.elf' -type f -print -quit)
        [[ -n "$bl31" ]] || die 'TF-A produced no Rockchip bl31.elf'
        FW_BL31_BIN=$bl31
    fi
}

verify_local_fip_contents() {
    local fiptool

    fiptool="$FW_BUILD_ROOT/arm-trusted-firmware/tools/fiptool/fiptool"
    [[ -x "$fiptool" ]] || make -C "$FW_BUILD_ROOT/arm-trusted-firmware" fiptool
    "$fiptool" info "$FW_FIP_BIN" | tee "$FW_BUILD_ROOT/fip-info.txt"
    grep -Eqi 'Secure Payload BL32|tos-fw|Trusted OS' "$FW_BUILD_ROOT/fip-info.txt"
    grep -Eqi 'Non-Trusted Firmware BL33|nt-fw|Non-Trusted' "$FW_BUILD_ROOT/fip-info.txt"
}

build_local_rockchip_uboot() {
    local -a build_args

    make -C "$FW_BUILD_ROOT/u-boot" \
        CROSS_COMPILE="$FW_AARCH64_PREFIX" ARCH=arm "$FW_UBOOT_DEFCONFIG"
    "$FW_BUILD_ROOT/u-boot/scripts/kconfig/merge_config.sh" -m \
        -O "$FW_BUILD_ROOT/u-boot" \
        "$FW_BUILD_ROOT/u-boot/.config" \
        "$FW_BUILD_ROOT/u-boot/yubios_ftpm.config"
    make -C "$FW_BUILD_ROOT/u-boot" \
        CROSS_COMPILE="$FW_AARCH64_PREFIX" ARCH=arm olddefconfig
    grep -E 'CONFIG_ROCKCHIP_RK(3399|3588)=y|CONFIG_ROCKCHIP_EXTERNAL_TPL=y|CONFIG_SPL_ATF=y|CONFIG_TPM2_FTPM_TEE=y' \
        "$FW_BUILD_ROOT/u-boot/.config" | tee "$FW_BUILD_ROOT/u-boot-config-summary.txt"
    make -C "$FW_BUILD_ROOT/u-boot" -j"$(nproc)" \
        CROSS_COMPILE="$FW_AARCH64_PREFIX" ARCH=arm u-boot.bin
    [[ -s "$FW_BUILD_ROOT/u-boot/u-boot.bin" ]] || die 'Rockchip U-Boot produced no u-boot.bin'

    build_args=(BL31="$FW_BL31_BIN" TEE="$FW_TEE_BIN")
    if [[ "$FW_REQUIRES_TPL" == true ]]; then
        if [[ -z "${ROCKCHIP_TPL:-}" ]]; then
            {
                printf 'board=%s\n' "$FW_BOARD"
                printf 'uboot_defconfig=%s\n' "$FW_UBOOT_DEFCONFIG"
                printf '%s\n' 'reason=ROCKCHIP_TPL is required for RK3588 board images'
                printf '%s\n' 'detail=U-Boot RK3588 Kconfig implies ROCKCHIP_EXTERNAL_TPL; binman marks missing/faked blobs non-functional.'
                printf 'next=Set ROCKCHIP_TPL to a real rk3588 DDR/TPL blob before using local-firmware-%s.\n' "$FW_BOARD"
            } > "$FW_BUILD_ROOT/rk-tpl-required.txt"
            printf 'notice: %s source pieces built; final Rockchip image skipped because ROCKCHIP_TPL is unset\n' \
                "$FW_BOARD" >&2
            return
        fi
        [[ -s "$ROCKCHIP_TPL" ]] || die "ROCKCHIP_TPL is not a readable non-empty file: $ROCKCHIP_TPL"
        build_args+=(ROCKCHIP_TPL="$ROCKCHIP_TPL")
    fi

    make -C "$FW_BUILD_ROOT/u-boot" -j"$(nproc)" \
        CROSS_COMPILE="$FW_AARCH64_PREFIX" ARCH=arm \
        "${build_args[@]}" 2>&1 | tee "$FW_BUILD_ROOT/u-boot-build.log"
    ! grep -Eiq 'missing external blobs|faked external blobs|non-functional|Some images are invalid' \
        "$FW_BUILD_ROOT/u-boot-build.log"
    [[ -s "$FW_BUILD_ROOT/u-boot/u-boot.bin" ]]
}

write_local_firmware_build_manifest() {
    {
        printf '%s\n' 'yubiOS ARM64 firmware build artifact'
        printf 'board=%s\n' "$FW_BOARD"
        printf 'board_title=%s\n' "$FW_BOARD_TITLE"
        printf 'build_kind=%s\n' "$FW_BUILD_KIND"
        printf 'arch=%s\n' "$ARCH"
        printf 'uboot_defconfig=%s\n' "$FW_UBOOT_DEFCONFIG"
        printf 'optee_platform=%s\n' "$FW_OPTEE_PLATFORM"
        printf 'optee_flavor=%s\n' "$FW_OPTEE_FLAVOR"
        printf 'tfa_plat=%s\n' "$FW_TFA_PLAT"
        printf 'rockchip_tpl_required=%s\n' "$FW_REQUIRES_TPL"
        if [[ -n "${ROCKCHIP_TPL:-}" ]]; then
            printf '%s\n' 'rockchip_tpl_provided=true'
        else
            printf '%s\n' 'rockchip_tpl_provided=false'
        fi
        printf 'yubios_commit=%s\n' "$GIT_SHA"
        printf 'source_date_epoch=%s\n' "$SOURCE_DATE_EPOCH"
        printf 'tfa_ref=%s\n' "$LOCAL_TFA_REF"
        printf 'optee_os_ref=%s\n' "$LOCAL_OPTEE_OS_REF"
        printf 'optee_ftpm_ref=%s\n' "$LOCAL_OPTEE_FTPM_REF"
        printf 'uboot_ref=%s\n' "$LOCAL_UBOOT_REF"
        printf 'edk2_ref=%s\n' "$LOCAL_EDK2_REF"
        printf 'edk2_platforms_ref=%s\n' "$LOCAL_EDK2_PLATFORMS_REF"
        printf 'ms_tpm_ref=%s\n' "$LOCAL_MS_TPM_REF"
        printf 'ftpm_uuid=%s\n' "$LOCAL_FTPM_UUID"
        if [[ "$FW_BUILD_KIND" == qemu ]]; then
            printf '%s\n' 'signature_envelope=TF-A CREATE_KEYS=1; excluded from byte-for-byte proof'
        fi
    } > "$FW_BUILD_ROOT/firmware-manifest.txt"
}

copy_first_local_firmware_file() {
    local destination=$1 pattern=$2 rename=${3:-} source

    source=$(find "$FW_BUILD_ROOT" -name "$pattern" -type f -print -quit)
    [[ -n "$source" ]] || return 0
    if [[ -n "$rename" ]]; then
        cp "$source" "$destination/$rename"
    else
        cp "$source" "$destination/"
    fi
}

assemble_local_firmware_payload() {
    local file payload

    payload="$FW_BUILD_ROOT/fw/firmware"
    mkdir -p "$payload"
    copy_first_local_firmware_file "$payload" fip.bin
    copy_first_local_firmware_file "$payload" flash.bin
    copy_first_local_firmware_file "$payload" bl1.bin
    copy_first_local_firmware_file "$payload" bl31.elf
    cp "$FIRMWARE_ROOT/BL32_AP_MM.fd" "$payload/"
    copy_first_local_firmware_file "$payload" u-boot.bin
    copy_first_local_firmware_file "$payload" u-boot.itb
    copy_first_local_firmware_file "$payload" idbloader.img
    copy_first_local_firmware_file "$payload" u-boot-rockchip.bin
    copy_first_local_firmware_file "$payload" u-boot-rockchip-spi.bin
    copy_first_local_firmware_file "$payload" fip-info.txt
    copy_first_local_firmware_file "$payload" firmware-manifest.txt BUILD-MANIFEST.txt
    copy_first_local_firmware_file "$payload" rk-tpl-required.txt RK-TPL-REQUIRED.txt
    copy_first_local_firmware_file "$payload" tee.elf
    copy_first_local_firmware_file "$payload" tee.bin
    while IFS= read -r file; do
        cp "$file" "$payload/"
    done < <(find "$FW_BUILD_ROOT/optee_os/out" -name 'tee-*_v2.bin' -type f -print)

    if [[ "$FW_BOARD" == qemu-arm64 && ! -s "$payload/flash.bin" ]]; then
        [[ -s "$payload/bl1.bin" && -s "$payload/fip.bin" ]] || \
            die 'QEMU payload cannot assemble flash.bin without bl1.bin and fip.bin'
        dd if="$payload/bl1.bin" of="$payload/flash.bin" bs=4096 conv=notrunc
        dd if="$payload/fip.bin" of="$payload/flash.bin" seek=64 bs=4096 conv=notrunc
    fi

    [[ -s "$payload/$FW_REQUIRED_IMAGE" ]] || \
        printf 'warning: no bootable %s image found for %s\n' "$FW_REQUIRED_IMAGE" "$FW_BOARD" >&2
    [[ -s "$payload/BL32_AP_MM.fd" ]] || die 'firmware payload is missing BL32_AP_MM.fd'
    if [[ "$FW_BOARD" == qemu-arm64 ]]; then
        [[ -s "$payload/fip.bin" && -s "$payload/bl1.bin" && -s "$payload/flash.bin" ]] || \
            die 'QEMU firmware payload is incomplete'
    else
        [[ -s "$payload/bl31.elf" && -s "$payload/u-boot.bin" ]] || \
            die "Rockchip firmware payload is incomplete for $FW_BOARD"
        [[ -s "$payload/u-boot.itb" ]] || printf 'warning: no bootable ITB image found for %s\n' "$FW_BOARD" >&2
        [[ -s "$payload/idbloader.img" ]] || printf 'warning: no bootable IDB image found for %s\n' "$FW_BOARD" >&2
        [[ -s "$payload/tee.elf" || -s "$payload/tee.bin" ]] || \
            die "Rockchip firmware payload has no OP-TEE image for $FW_BOARD"
    fi

    {
        printf '%s\n' 'yubiOS ARM64 firmware bundle'
        printf 'board=%s\n' "$FW_BOARD"
        printf 'board_title=%s\n' "$FW_BOARD_TITLE"
        printf 'yubios_commit=%s\n' "$GIT_SHA"
        printf 'source_date_epoch=%s\n' "$SOURCE_DATE_EPOCH"
        printf 'tfa_ref=%s\n' "$LOCAL_TFA_REF"
        printf 'optee_os_ref=%s (approved source; release provenance in PINNED.md)\n' "$LOCAL_OPTEE_OS_REF"
        printf 'optee_ftpm_ref=%s (approved source; release provenance in PINNED.md)\n' "$LOCAL_OPTEE_FTPM_REF"
        printf 'uboot_ref=%s\n' "$LOCAL_UBOOT_REF"
        printf 'edk2_ref=%s\n' "$LOCAL_EDK2_REF"
        printf 'edk2_platforms_ref=%s\n' "$LOCAL_EDK2_PLATFORMS_REF"
        printf 'ms_tpm_ref=%s\n' "$LOCAL_MS_TPM_REF"
        printf 'ftpm_uuid=%s\n' "$LOCAL_FTPM_UUID"
        printf 'optee_platform=%s\n' "$FW_OPTEE_PLATFORM"
        printf 'optee_flavor=%s\n' "$FW_OPTEE_FLAVOR"
        printf 'tfa_plat=%s\n' "$FW_TFA_PLAT"
        printf 'uboot_defconfig=%s\n' "$FW_UBOOT_DEFCONFIG"
        printf 'required_image=%s\n' "$FW_REQUIRED_IMAGE"
        printf 'storage_note=%s\n' "$FW_STORAGE_NOTE"
        if [[ "$FW_BUILD_KIND" == qemu ]]; then
            printf '%s\n' 'signature_envelope=TF-A CREATE_KEYS=1; excluded from byte-for-byte proof'
        fi
        if [[ -n "${ROCKCHIP_TPL:-}" ]]; then
            printf 'rockchip_tpl_sha256=%s\n' "$(sha256sum "$ROCKCHIP_TPL" | cut -d' ' -f1)"
        fi
    } > "$payload/MANIFEST.txt"
    normalize_reproducible_tree "$payload"
    write_reproducible_checksums "$payload"
    FW_PAYLOAD=$payload
}

verify_local_qemu_firmware() {
    local fail=0

    timeout 180 qemu-system-aarch64 \
        -M virt,secure=on -cpu max -m 2048 \
        -bios "$FW_PAYLOAD/flash.bin" \
        -nographic -d guest_errors \
        -serial "file:$FW_BUILD_ROOT/nw.log" \
        -serial "file:$FW_BUILD_ROOT/optee.log" || true
    touch "$FW_BUILD_ROOT/nw.log" "$FW_BUILD_ROOT/optee.log"
    grep -Eiq "early_ta_init.*${LOCAL_FTPM_UUID}|Early TA ${LOCAL_FTPM_UUID}" \
        "$FW_BUILD_ROOT/nw.log" "$FW_BUILD_ROOT/optee.log" || fail=1
    grep -Eiq "ldelf: Loading TS ${LOCAL_FTPM_UUID}|Lookup user TA ELF ${LOCAL_FTPM_UUID}" \
        "$FW_BUILD_ROOT/nw.log" "$FW_BUILD_ROOT/optee.log" || fail=1
    grep -q YUBIOS_TPM_OK "$FW_BUILD_ROOT/nw.log" || fail=1
    ! grep -Eq "Missing TPMv2 device|Couldn't set TPM|TA panicked|ldelf failed|data-abort" \
        "$FW_BUILD_ROOT/nw.log" "$FW_BUILD_ROOT/optee.log" || fail=1
    grep -Eiq 'stmm load address' "$FW_BUILD_ROOT/nw.log" "$FW_BUILD_ROOT/optee.log" || fail=1
    ((fail == 0)) || die 'QEMU fTPM firmware verification failed'
}

package_local_firmware_image() {
    rm -rf "$ARTIFACT_REPO/fw"
    mkdir -p "$ARTIFACT_REPO/fw/firmware"
    cp -a "$FW_PAYLOAD/." "$ARTIFACT_REPO/fw/firmware/"
    normalize_reproducible_tree "$ARTIFACT_REPO/fw/firmware"
    cd "$ARTIFACT_REPO" || die "cannot enter artifact worktree: $ARTIFACT_REPO"
    export FIRMWARE_CONTEXT=fw
    export FIRMWARE_BOARD="$FW_BOARD"
    export FIRMWARE_BOARD_TITLE="$FW_BOARD_TITLE"
    export FIRMWARE_PUBLISH_ORIGINAL="$FW_PUBLISH_ORIGINAL"
    export PUSH=false
    docker buildx bake \
        --builder hardened \
        --file yubiOS-bake.hcl \
        firmware
    append_image_tag "yubios:${LOCAL_TAG}-firmware-${FW_BOARD}"
}

build_local_firmware_board() {
    configure_local_firmware_board "$1"
    FW_BUILD_ROOT="$FIRMWARE_ROOT/$FW_BOARD"
    mkdir -p "$FW_BUILD_ROOT"
    FW_BL33_BIN=
    FW_BL31_BIN=
    FW_FIP_BIN=

    stage_local_uboot_source
    if [[ "$FW_BUILD_KIND" == qemu ]]; then
        build_local_qemu_uboot
    fi
    build_local_optee_stack
    build_local_trusted_firmware
    if [[ "$FW_BUILD_KIND" == qemu ]]; then
        verify_local_fip_contents
    else
        build_local_rockchip_uboot
    fi
    write_local_firmware_build_manifest
    assemble_local_firmware_payload
    if [[ "$FW_BOARD" == qemu-arm64 ]]; then
        verify_local_qemu_firmware
    fi
    package_local_firmware_image
}

build_local_firmware() {
    local selection=$1 board
    local -a boards

    prepare_artifact_worktree
    install_local_firmware_dependencies
    FIRMWARE_ROOT="$BUILD_WORK_ROOT/firmware"
    mkdir -p "$FIRMWARE_ROOT"
    build_local_standalone_mm

    case "$selection" in
        all)
            boards=(qemu-arm64 rockpro64-rk3399 rock5b-rk3588)
            ;;
        qemu-arm64|rockpro64-rk3399|rock5b-rk3588)
            boards=("$selection")
            ;;
        *)
            die "unknown firmware selection: $selection"
            ;;
    esac
    for board in "${boards[@]}"; do
        build_local_firmware_board "$board"
    done
}
