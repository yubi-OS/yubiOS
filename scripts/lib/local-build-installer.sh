#!/usr/bin/env bash

# Native local equivalent of the build + installer-publish paths in
# .github/workflows/ci_mkosi-installer.yml. This file is sourced by
# scripts/build-local-images.sh after the pinned DHI/rootless Docker bootstrap.

readonly LOCAL_MKOSI_REF='000b5cefe2b130e928fcfe6a649b417d6f78f66d' # yubios branch (v27.1 descendant)

install_local_installer_dependencies() {
    local dependencies mkosi_wheel mkosi_wheel_dir

    apt-get update -qq
    apt-get install -y -qq --no-install-recommends \
        ca-certificates debian-archive-keyring findutils openssl procps \
        python3-pip sbsigntool softhsm2 uidmap zstd

    mkosi_wheel_dir=$(mktemp -d)
    python3 -m pip wheel --no-deps --wheel-dir "$mkosi_wheel_dir" \
        "git+https://github.com/yubi-OS/mkosi.git@${LOCAL_MKOSI_REF}"
    mkosi_wheel=$(find "$mkosi_wheel_dir" -maxdepth 1 -type f -name 'mkosi-*.whl' -print -quit)
    [[ -n "$mkosi_wheel" ]] || die 'the pinned mkosi source did not produce a wheel'
    python3 -m pip install --break-system-packages "$mkosi_wheel"

    dependencies="$mkosi_wheel_dir/dependencies"
    mkosi dependencies > "$dependencies"
    xargs -r -d '\n' apt-get install -y -qq --no-install-recommends < "$dependencies"

    # mkosi's dependency set can replace DHI's Python. Reinstall the same
    # pure-Python wheel for the final interpreter, matching CI.
    python3 -m pip install --break-system-packages --force-reinstall "$mkosi_wheel"
    hash -r
    python3 -c 'import mkosi'
    mkosi --version
    sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 || true
}

create_local_installer_signing_token() {
    rm -rf /run/yubios-hsm
    mkdir -p /run/yubios-hsm/tokens
    openssl req -x509 -newkey rsa:3072 -sha256 -days 365 -nodes \
        -subj '/CN=yubiOS reproducibility test Secure Boot (non-production)/' \
        -keyout sb.key -out mkosi.secure-boot.pem
    openssl pkcs8 -topk8 -nocrypt -in sb.key -out sb.p8
    printf 'directories.tokendir = /run/yubios-hsm/tokens\nobjectstore.backend = file\n' \
        > /run/yubios-hsm/softhsm2.conf
    SOFTHSM2_CONF=/run/yubios-hsm/softhsm2.conf \
        softhsm2-util --init-token --free --label yubios-9c --pin 123456 --so-pin 123456
    SOFTHSM2_CONF=/run/yubios-hsm/softhsm2.conf \
        softhsm2-util --import sb.p8 --token yubios-9c --label piv-9c --id 9c --pin 123456
    shred -u sb.key sb.p8
    chmod -R a+rwX /run/yubios-hsm
    printf 'pkcs11:token=yubios-9c;object=piv-9c;type=private?pin-value=123456' \
        > mkosi.secure-boot.pkcs11-uri
}

build_local_installer() {
    local mkosi_arch raw uki

    prepare_artifact_worktree
    install_local_installer_dependencies

    case "$ARCH" in
        amd64) mkosi_arch=x86-64 ;;
        arm64) mkosi_arch=arm64 ;;
        *) die "unsupported installer architecture: $ARCH" ;;
    esac

    cd "$ARTIFACT_REPO" || die "cannot enter artifact worktree: $ARTIFACT_REPO"
    rm -rf inst mkosi.output mkosi.cache
    create_local_installer_signing_token

    mkosi \
        --source-date-epoch "$SOURCE_DATE_EPOCH" \
        --seed "$YUBIOS_MKOSI_SEED" \
        --incremental=no \
        --distribution fedora \
        --release 45 \
        --architecture "$mkosi_arch" \
        --profile minimal \
        --package kernel \
        --package systemd-boot-unsigned \
        --bootable yes \
        --tools-tree-package softhsm2 \
        --tools-tree-package pkcs11-provider \
        --tools-tree-package distribution-gpg-keys \
        --tools-tree-package dnf \
        --tools-tree-package rpm \
        --environment PKCS11_PROVIDER_MODULE=/usr/lib/softhsm/libsofthsm2.so \
        --environment SOFTHSM2_CONF=/run/yubios-hsm/softhsm2.conf \
        --environment PKCS11_PROVIDER_DEBUG=file:/dev/stderr,level:1 \
        --secure-boot-key-source provider:pkcs11 \
        --secure-boot-key "$(<mkosi.secure-boot.pkcs11-uri)" \
        --secure-boot-certificate mkosi.secure-boot.pem \
        --secure-boot-sign-tool systemd-sbsign \
        --sign-expected-pcr-key-source provider:pkcs11 \
        --sign-expected-pcr-key "$(<mkosi.secure-boot.pkcs11-uri)" \
        --sign-expected-pcr-certificate mkosi.secure-boot.pem \
        build

    uki=$(find mkosi.output -name '*.efi' -type f -print -quit)
    [[ -n "$uki" ]] || die 'mkosi produced no UKI'
    sbverify --cert mkosi.secure-boot.pem "$uki"

    mkdir -p inst/installer
    raw=mkosi.output/yubiOS.raw
    [[ -s "$raw" ]] || die 'mkosi produced no yubiOS.raw disk image'
    zstd -T1 -8 --force -o "inst/installer/$(basename "$raw").zst" "$raw"
    find mkosi.output -maxdepth 1 -name '*.efi' -type f -exec cp {} inst/installer/ \;
    find mkosi.output -maxdepth 1 -name '*manifest*' -type f -exec cp {} inst/installer/ \;
    cp mkosi.secure-boot.pem inst/installer/ci-secure-boot-cert.pem
    {
        printf '%s\n' 'yubiOS mkosi installer image (minimal profile)'
        printf 'architecture=%s\n' "$ARCH"
        printf 'yubios_commit=%s\n' "$GIT_SHA"
        printf 'source_date_epoch=%s\n' "$SOURCE_DATE_EPOCH"
        printf 'mkosi_seed=%s\n' "$YUBIOS_MKOSI_SEED"
        printf 'mkosi_source=https://github.com/yubi-OS/mkosi@%s (approved source; release provenance in PINNED.md)\n' "$LOCAL_MKOSI_REF"
        printf '%s\n' 'signing=UKI signed via SecureBootKeySource=provider:pkcs11 + systemd-sbsign'
        printf '%s\n' 'signature_envelope=random non-production SoftHSM key; excluded from byte-for-byte proof'
        printf '%s\n' 'NOTE: Signing key is a SoftHSM mock of U2F/HSM PIV slot 9c.'
        printf '%s\n' 'Production images are signed with the real U2F/HSM (ADR-008); this'
        printf '%s\n' 'image validates the build + PKCS#11 signing path, not a production key.'
        printf '%s\n' 'Install flow (ADR-022): write this image to disk, boot; the installed'
        printf '%s\n' 'system tracks 0mniteck/yubios:latest via bootc. ARM64 targets flash'
        printf '%s\n' '0mniteck/yubios:firmware first (secure world) per ADR-018/019/020.'
    } > inst/installer/MANIFEST.txt
    normalize_reproducible_tree inst/installer
    write_reproducible_checksums inst/installer

    export INSTALLER_CONTEXT=inst PUSH=false
    docker buildx bake \
        --builder hardened \
        --file yubiOS-bake.hcl \
        installer
    append_image_tag "yubios:${LOCAL_TAG}-installer"
}
