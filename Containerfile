# yubiOS — FIDO2-first immutable OS image (Fedora base)
# Build: use scripts/build-local-images.sh or initialize
# scripts/lib/reproducible-build.sh before invoking Bake directly.
# Source: bootc design https://github.com/bootc-dev/bootc
# Source: particleos ethos https://github.com/systemd/particleos

# Base: digest-only ref (OMN-170 / B-REPRO-MIRROR). The Fedora stream (:45) is
# tracked by .github/workflows/fetch-fedora-bootc-manifest.yml and recorded in
# PINNED.md; the FROM carries only the immutable OCI index digest so there is a
# single source of identity (no tag+digest ambiguity for Build Policy/tooling).
# quay.io/fedora/fedora-bootc:45 (org.opencontainers.image.version=45.20261114.0)
FROM quay.io/fedora/fedora-bootc@sha256:990ebc2678ff3dbca3f0143c8d5f1a150a2fb0c418888a3bdf218aea109fc1d2 AS rootfs

# BuildKit also consumes this special argument for OCI timestamps. Declaring it
# makes the same canonical epoch visible to package/build tools in RUN steps.
ARG SOURCE_DATE_EPOCH

# ── U2F/HSM and FIDO2 stack ──────────────────────────────────────────────
# libfido2:       FIDO2/CTAP2 library; used by systemd-cryptenroll, OpenSSH, pam-u2f
# yubikey-manager: ykman CLI for PIV, FIDO2, OATH management
# yubico-piv-tool: PIV operations for Secure Boot signing (slot 9c)
# opensc:          PKCS#11 middleware; systemd-sbsign uses this to talk to U2F/HSM PIV
# pam-u2f:         PAM module for FIDO2/U2F; requires >= 1.3.1 (CVE-2025-23013)
#                  Source: https://www.yubico.com/support/security-advisories/ysa-2025-01/
# pcsc-lite:       PC/SC daemon; needed for PIV/CCID interface
# Fedora 45's DNF5 emits mutable cache, log, repository countme, and
# transaction-history state;
# package scriptlets also refresh ldconfig's regenerable auxiliary cache in
# filesystem-dependent order. RPM itself honors SOURCE_DATE_EPOCH, so remove
# those caches while retaining the installed RPM and runtime linker databases.
RUN dnf -y --setopt=history_record=false --setopt=install_weak_deps=False \
      --setopt=metadata_expire=never \
      --setopt=updates-testing.excludepkgs=kernel-headers,libXfont2,libcue,libfontenc,parted,pcsc-lite,pcsc-lite-ccid,pcsc-lite-libs,python3-devel,python3-keyring,python3-pip,taglib \
      install \
      libfido2 \
      yubikey-manager \
      yubico-piv-tool \
      opensc \
      pam-u2f \
      pamu2fcfg \
      pcsc-lite \
      pcsc-lite-ccid \
      tpm2-tools \
      tpm2-tss \
      cryptsetup \
      openssh-clients \
      openssh-server \
      fido2-tools \
      btrfs-progs \
      diffutils \
      python3-brotli \
      python3-pip \
      python3-devel \
      gcc \
      osslsigncode \
      efitools \
      pkcs11-provider \
      sbsigntools \
      systemd-boot-unsigned \
      systemd-ukify \
      ostree \
      rpm-ostree \
      python3-gobject \
      gdm \
      gnome-shell \
      gnome-session-wayland-session \
      gnome-control-center \
      ptyxis \
      nautilus \
      adwaita-icon-theme \
      dejavu-sans-fonts \
      liberation-fonts \
      mesa-dri-drivers \
      mesa-vulkan-drivers \
      xorg-x11-server-Xwayland \
      qt5-qtbase-gui \
      qt6-qtbase-gui \
      vulkan-loader \
      cups-libs \
      alsa-lib \
      alsa-ucm \
      alsa-utils \
      pipewire-alsa \
      at-spi2-atk \
      gtk3 \
      gtk4 \
      libxcb \
      libxkbcommon \
      nss \
      python3-pillow \
      plymouth \
      plymouth-system-theme \
      plymouth-theme-spinner \
      plymouth-plugin-two-step \
      wget \
      xdg-utils && \
    dnf clean all && \
    rm -rf \
      /run/dnf \
      /var/cache/dnf \
      /var/cache/ldconfig/aux-cache \
      /var/cache/libdnf5 \
      /var/log/dnf* \
      /var/log/hawkey.log \
      /var/log/libdnf* \
      /var/lib/dnf/repos \
      /var/lib/dnf/system-repo.lock \
      /usr/lib/sysimage/libdnf5/transaction_history.sqlite* && \
    rm -f /etc/machine-id /var/lib/systemd/random-seed && \
    ! test -e /etc/machine-id && \
    ! test -e /var/lib/systemd/random-seed

# ── First-boot firmware validation (ADR-024) ─────────────────────────────
# CHIPSEC is distributed from PyPI rather than Fedora repos. Pin the source
# release and hash so the first-boot firmware checker is reproducible.
# chipsec==1.13.16 (sha256:63bed5ad4224402397817ea82b94c3a21736386a04ff778c003704bd6dfdbca3)
RUN echo 'chipsec==1.13.16 --hash=sha256:63bed5ad4224402397817ea82b94c3a21736386a04ff778c003704bd6dfdbca3' \
      > /tmp/chipsec-requirements.txt && \
    PYTHONHASHSEED=0 python3 -m pip install --no-cache-dir --no-compile \
      --break-system-packages --require-hashes \
      -r /tmp/chipsec-requirements.txt && \
    chipsec_site="$(PYTHONDONTWRITEBYTECODE=1 python3 -c \
      'import sysconfig; print(sysconfig.get_path("platlib"))')" && \
    test -d "${chipsec_site}/chipsec" && \
    mkdir -p "${chipsec_site}/chipsec/library/tpm" /var/log/chipsec && \
    ln -sfn /var/log/chipsec "$(dirname "${chipsec_site}")/logs" && \
    printf '%s\n' 'from chipsec.library.tpm import tpm_defines' > "${chipsec_site}/chipsec/library/tpm/__init__.py" && \
    printf '%s\n' 'TPM1 = "1.2"' 'TPM2 = "2.0"' 'FIFO_LEGACY = "fifo_legacy"' 'FIFO = "fifo"' 'CRB = "crb"' > "${chipsec_site}/chipsec/library/tpm/tpm_defines.py" && \
    PYTHONHASHSEED=0 python3 -m compileall -f -q -j 1 \
      --invalidation-mode=checked-hash \
      "${chipsec_site}/chipsec" && \
    rm -rf /root/.cache /tmp/pip-* /tmp/chipsec-requirements.txt

# ── Antimony Browser (yubi-OS/chromium-provenance antimony-v156.0.8078.47-r1) ──
# Pinned in PINNED.md under "yubi-OS Release Binaries". Verify both SHA-256 and
# SHA-512 before installing, then relocate /opt/antimony (/var/opt/antimony) to
# /usr/lib/opt/antimony so the browser payload resides inside the immutable
# composefs /usr tree and leaves build-time /var clean for `bootc container lint`.
RUN case "$(uname -m)" in \
      aarch64) \
        ant_arch="aarch64"; \
        ant_sha256="7921e25c1cf2a379f7be3ff96b10813704153128426b34e38696900b4a48ecef"; \
        ant_sha512="68eb5dfb99a7fbabb1fc88b2d44d7fd48cdded36d2b04391d53e7dd0eccff8800ab0a563959237328bd0a417e642b67f90a02e8bef786f1ca6c72dff4d4855cb" ;; \
      x86_64) \
        ant_arch="x86_64"; \
        ant_sha256="1e7260b6e01bfbfa77599e4a69a3a3118f826146b1e373e92adce4e756384168"; \
        ant_sha512="0537e7279176afafd043d18123be4a15c2d18c6f9cc06296bdc42629bbe9b371247fa348d47322384731ea5a9a16e68e6e6ffec8c866d22cf2dc5fa03cca62d3" ;; \
      *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;; \
    esac && \
    ant_url="https://github.com/yubi-OS/chromium-provenance/releases/download/antimony-v156.0.8078.47-r1/antimony-stable-156.0.8078.47-1.${ant_arch}.rpm" && \
    curl -fsSL --retry 3 --retry-delay 2 -o /tmp/antimony.rpm "${ant_url}" && \
    printf '%s  /tmp/antimony.rpm\n' "${ant_sha256}" > /tmp/antimony.sha256 && \
    printf '%s  /tmp/antimony.rpm\n' "${ant_sha512}" > /tmp/antimony.sha512 && \
    sha256sum --check --strict /tmp/antimony.sha256 && \
    sha512sum --check --strict /tmp/antimony.sha512 && \
    rpm -Uvh --nodigest --nosignature /tmp/antimony.rpm && \
    rm -f /tmp/antimony.rpm /tmp/antimony.sha256 /tmp/antimony.sha512 && \
    mkdir -p /usr/lib/opt && \
    if [ -d /var/opt/antimony ]; then \
      mv /var/opt/antimony /usr/lib/opt/antimony; \
    elif [ -d /opt/antimony ] && [ ! -L /opt/antimony ]; then \
      mv /opt/antimony /usr/lib/opt/antimony; \
    fi && \
    ln -sf /usr/lib/opt/antimony/antimony /usr/bin/antimony && \
    ln -sf /usr/lib/opt/antimony/antimony /usr/bin/antimony-stable && \
    test -x /usr/lib/opt/antimony/chrome

# ── yubiOS Default Wallpaper (yubi-OS/assets @ 09f209a48153c6cef4faae9b247146abce4c5441) ──
# Pinned in PINNED.md under "External GitHub Source Refs". Verify both SHA-256 and
# SHA-512 before installing into /usr/share/backgrounds/yubios/yubios-aurora-ridge-4k.jpg.
RUN wp_commit="09f209a48153c6cef4faae9b247146abce4c5441" && \
    wp_sha256="a700d15d5fe5b217a027c7a2b196c13f27f1aace9a675874310020ceb1d4918f" && \
    wp_sha512="330eaf8730cb5f8d37855d1bcf4214893153b6cc8a979d873425b4c9d809ef697d59cf68ea8672d2e03c0098d0911527b4ca86d09e1b199217ac41f021cebfe3" && \
    wp_url="https://raw.githubusercontent.com/yubi-OS/assets/${wp_commit}/wallpapers/yubios-aurora-ridge-4k.jpg" && \
    install -d -m 0755 /usr/share/backgrounds/yubios && \
    curl -fsSL --retry 3 --retry-delay 2 -o /tmp/yubios-aurora-ridge-4k.jpg "${wp_url}" && \
    printf '%s  /tmp/yubios-aurora-ridge-4k.jpg\n' "${wp_sha256}" > /tmp/wp.sha256 && \
    printf '%s  /tmp/yubios-aurora-ridge-4k.jpg\n' "${wp_sha512}" > /tmp/wp.sha512 && \
    sha256sum --check --strict /tmp/wp.sha256 && \
    sha512sum --check --strict /tmp/wp.sha512 && \
    install -m 0644 /tmp/yubios-aurora-ridge-4k.jpg /usr/share/backgrounds/yubios/yubios-aurora-ridge-4k.jpg && \
    rm -f /tmp/yubios-aurora-ridge-4k.jpg /tmp/wp.sha256 /tmp/wp.sha512 && \
    test -s /usr/share/backgrounds/yubios/yubios-aurora-ridge-4k.jpg && \
    logo_sha256="351fc8cbeead6060506938dd5a3cae2c18f96878e6b04fd7d89f5f370e65ad15" && \
    logo_sha512="5697513b6022af7cbeacd85d9eb2eaf404918922d357a68bd6189f0231cf8f035509cf2ec8907403b6e58061d26d5f760fd4787871751205c833fc528cc2141d" && \
    logo_url="https://raw.githubusercontent.com/yubi-OS/assets/${wp_commit}/new_logo/yubios-owner-orbit-2048.png" && \
    curl -fsSL --retry 3 --retry-delay 2 -o /tmp/yubios-owner-orbit-2048.png "${logo_url}" && \
    printf '%s  /tmp/yubios-owner-orbit-2048.png\n' "${logo_sha256}" > /tmp/logo.sha256 && \
    printf '%s  /tmp/yubios-owner-orbit-2048.png\n' "${logo_sha512}" > /tmp/logo.sha512 && \
    sha256sum --check --strict /tmp/logo.sha256 && \
    sha512sum --check --strict /tmp/logo.sha512 && \
    install -d -m 0755 /usr/share/yubiOS/splash /usr/share/plymouth/themes/spinner /usr/share/pixmaps /etc/plymouth && \
    python3 -c 'from PIL import Image; im = Image.open("/tmp/yubios-owner-orbit-2048.png").convert("RGB"); im.resize((512, 512), Image.Resampling.BOX).save("/usr/share/yubiOS/splash/yubios-owner-orbit.bmp", format="BMP"); im.resize((512, 512), Image.Resampling.BOX).save("/usr/share/pixmaps/yubios-logo.png", format="PNG"); im.resize((256, 256), Image.Resampling.BOX).save("/usr/share/plymouth/themes/spinner/header-image.png", format="PNG"); im.resize((128, 128), Image.Resampling.BOX).save("/usr/share/plymouth/themes/spinner/watermark.png", format="PNG"); im.resize((256, 256), Image.Resampling.BOX).save("/usr/share/pixmaps/fedora-logo-small.png", format="PNG"); im.resize((256, 256), Image.Resampling.BOX).save("/usr/share/pixmaps/system-logo-white.png", format="PNG")' && \
    printf '[Daemon]\nTheme=spinner\nShowDelay=0\nDeviceTimeout=8\n' > /etc/plymouth/plymouthd.conf && \
    printf '[Daemon]\nTheme=spinner\nShowDelay=0\nDeviceTimeout=8\n' > /usr/share/plymouth/plymouthd.defaults && \
    rm -f /tmp/yubios-owner-orbit-2048.png /tmp/logo.sha256 /tmp/logo.sha512 && \
    test -s /usr/share/yubiOS/splash/yubios-owner-orbit.bmp && \
    test -s /usr/share/plymouth/themes/spinner/header-image.png && \
    test -s /usr/share/plymouth/themes/spinner/watermark.png

# ── Overlay yubiOS config tree ───────────────────────────────────────────
COPY usr/ /usr/

# ── Compile GNOME GSettings schema override, GDM dconf profile, & PM/audio configs ──
RUN glib-compile-schemas /usr/share/glib-2.0/schemas && \
    install -d -m 0755 /etc/dconf/profile /etc/dconf/db/local.d /etc/dconf/db/gdm.d /etc/systemd/sleep.conf.d /etc/systemd/logind.conf.d /etc/wireplumber/wireplumber.conf.d && \
    printf 'user-db:user\nsystem-db:local\n' > /etc/dconf/profile/user && \
    printf 'user-db:user\nsystem-db:gdm\nsystem-db:local\n' > /etc/dconf/profile/gdm && \
    cp -f /usr/lib/dconf/db/local.d/00-yubios-wallpaper /etc/dconf/db/local.d/00-yubios-wallpaper && \
    cp -f /usr/lib/dconf/db/local.d/00-yubios-wallpaper /etc/dconf/db/gdm.d/00-yubios-wallpaper && \
    cp -f /usr/lib/systemd/sleep.conf.d/yubiOS-no-sleep.conf /etc/systemd/sleep.conf.d/yubiOS-no-sleep.conf && \
    cp -f /usr/lib/systemd/logind.conf.d/yubiOS-no-sleep.conf /etc/systemd/logind.conf.d/yubiOS-no-sleep.conf && \
    cp -f /usr/share/wireplumber/wireplumber.conf.d/50-yubios-rk3588-hdmi-audio.conf /etc/wireplumber/wireplumber.conf.d/50-yubios-rk3588-hdmi-audio.conf && \
    dconf update

# ── SSH: allow bcvk CI root key credentials only when present ─────────────
RUN mkdir -p /etc/ssh/sshd_config.d && \
    cp /usr/lib/yubiOS/sshd_config.d/10-yubiOS-bcvk-root-key.conf \
      /etc/ssh/sshd_config.d/10-yubiOS-bcvk-root-key.conf

# ── Permissions for enrollment and first-boot scripts + staged Secure Boot keys ──
RUN chmod +x /usr/lib/yubiOS/*.sh /usr/lib/yubiOS/chipsec/*.sh /usr/lib/yubiOS/uki/*.sh /usr/lib/kernel/install.d/*.install && \
    mkdir -p /etc/kernel/install.d /etc/ostree /usr/lib/yubiOS/secureboot /boot/EFI/yubiOS/secureboot /boot/EFI/yubiOS/keys && \
    if [ ! -f /usr/lib/yubiOS/secureboot/PK.auth ]; then \
      SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1700000000}" /usr/lib/yubiOS/uki/stage-ci-sb-keys.sh /; \
    fi && \
    cp -f /usr/lib/yubiOS/secureboot/* /boot/EFI/yubiOS/secureboot/ && \
    cp -f /usr/lib/yubiOS/secureboot/* /boot/EFI/yubiOS/keys/ && \
    test -s /usr/lib/yubiOS/secureboot/PK.auth && \
    test -s /boot/EFI/yubiOS/secureboot/PK.auth && \
    test -s /boot/EFI/yubiOS/keys/PK.auth && \
    cp -f /usr/lib/ostree/prepare-root.conf /etc/ostree/prepare-root.conf && \
    cp -f /usr/lib/kernel/install.d/05-rpmostree.install /etc/kernel/install.d/05-rpmostree.install && \
    cp -f /usr/lib/kernel/install.d/95-yubios-uki-resign.install /etc/kernel/install.d/95-yubios-uki-resign.install

# ── /usr/bin symlinks for enrollment commands ────────────────────────────
# Wrapper scripts in /usr/lib/yubiOS/ exec the real scripts.
# Symlinks here make commands available as: yubiOS-enroll-sb, -luks, -pam, -ssh
RUN ln -sf /usr/lib/yubiOS/enroll.sh              /usr/bin/yubiOS-enroll       && \
    ln -sf /usr/lib/systemd/systemd-sbsign        /usr/bin/systemd-sbsign      && \
    ln -sf /usr/lib/yubiOS/enroll-sb-wrapper.sh   /usr/bin/yubiOS-enroll-sb   && \
    ln -sf /usr/lib/yubiOS/enroll-luks-wrapper.sh /usr/bin/yubiOS-enroll-luks && \
    ln -sf /usr/lib/yubiOS/enroll-pam-wrapper.sh  /usr/bin/yubiOS-enroll-pam  && \
    ln -sf /usr/lib/yubiOS/enroll-ssh-wrapper.sh  /usr/bin/yubiOS-enroll-ssh  && \
    ln -sf /usr/lib/yubiOS/enroll-homed-wrapper.sh /usr/bin/yubiOS-enroll-homed && \
    ln -sf /usr/lib/yubiOS/uki/uki-sync-and-sign.sh /usr/bin/yubiOS-uki-sync && \
    if [ ! -e /usr/lib64/libykcs11.so ] && [ -e /usr/lib64/libykcs11.so.2 ]; then \
      ln -sf libykcs11.so.2 /usr/lib64/libykcs11.so; \
    fi

# ── Wire PAM: yubiOS-sudo config → /etc/pam.d/sudo ──────────────────────
# Replaces Fedora's stock sudo PAM with yubiOS policy:
#   auth required pam_u2f.so  (U2F/HSM touch ALWAYS needed, not optional)
# Recovery if locked out: boot with rd.break, remount rw, comment out pam_u2f
# Source: https://github.com/Yubico/pam-u2f
RUN cp /usr/lib/pam.d/yubiOS-sudo /etc/pam.d/sudo

# ── Wire PAM: yubiOS-system-auth → /etc/pam.d/system-auth ────────────────────
# Adds pam_systemd_home.so to the system auth stack so homed users are activated
# on login. Homed FIDO2 handles auth for homed users; pam_u2f handles classic users.
# suspend=1: forgets key material on system suspend.
# Source: https://www.man7.org/linux/man-pages/man8/pam_systemd_home.8.html
RUN rm -f /etc/pam.d/system-auth /etc/pam.d/password-auth && \
    cp /usr/lib/pam.d/yubiOS-system-auth /etc/pam.d/system-auth && \
    cp /usr/lib/pam.d/yubiOS-system-auth /etc/pam.d/password-auth && \
    cp /usr/lib/pam.d/yubiOS-system-auth /usr/lib/pam.d/system-auth && \
    cp /usr/lib/pam.d/yubiOS-system-auth /usr/lib/pam.d/password-auth && \
    if [ -d /etc/authselect ]; then \
      cp /usr/lib/pam.d/yubiOS-system-auth /etc/authselect/system-auth && \
      cp /usr/lib/pam.d/yubiOS-system-auth /etc/authselect/password-auth; \
    fi && \
    ln -sf /dev/null /etc/systemd/system/authselect-apply-changes.service && \
    ln -sf /dev/null /usr/lib/systemd/system/authselect-apply-changes.service

# ── Apply systemd presets ─────────────────────────────────────────────────
# systemctl preset-all inside a container build invokes systemd-machine-id-setup,
# which writes a random /etc/machine-id and /var/lib/systemd/random-seed with
# fresh random content on every build. Those two files break reproducibility
# (run 30197303995: two isolated builds produced different layer[77] digests
# because machine-id and random-seed content differed). bootc generates both
# on first boot anyway, so removing them here is the same pattern as the dnf
# cache cleanup above -- strip nondeterministic build-time state.
# Install + enable first-boot services (ADR-024 + OMN-150).
# yubiOS-chipsec-firstboot.service is the documented precedent (ADR-024). The new
# yubios-uki-install.service follows the same pattern (ConditionFirstBoot=yes,
# ConditionPathExists=...) for OMN-150 Phase 2: it fires install-uki.sh at first boot
# when the signed UKI is present at /usr/lib/yubiOS/uki/yubios.efi. The unit is a
# no-op when the UKI is absent (bootc OCI image built without the yubios-uki
# Bake target), so this lands safely before the UKI-into-image wiring ships.
COPY usr/lib/systemd/system/yubios-uki-install.service /etc/systemd/system/yubios-uki-install.service
COPY usr/lib/systemd/system/yubios-uki-install.service /usr/lib/systemd/system/yubios-uki-install.service

RUN systemctl preset-all && \
    systemctl preset yubios-uki-install.service && \
    systemctl enable yubiOS-lvm-usr-overlay.service && \
    mkdir -p /usr/lib/systemd/system/local-fs.target.wants /usr/lib/systemd/system/multi-user.target.wants && \
    ln -sf ../yubiOS-lvm-usr-overlay.service /usr/lib/systemd/system/local-fs.target.wants/yubiOS-lvm-usr-overlay.service && \
    ln -sf ../yubiOS-lvm-usr-overlay.service /usr/lib/systemd/system/multi-user.target.wants/yubiOS-lvm-usr-overlay.service && \
    ln -sf ../yubiOS-uki-resign.path /usr/lib/systemd/system/multi-user.target.wants/yubiOS-uki-resign.path && \
    ln -sf ../yubiOS-ostree-composefs-sync.service /usr/lib/systemd/system/multi-user.target.wants/yubiOS-ostree-composefs-sync.service && \
    ln -sf /dev/null /etc/systemd/system/boot.automount && \
    ln -sf /dev/null /usr/lib/systemd/system/boot.automount && \
    for u in sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target systemd-suspend.service systemd-hibernate.service systemd-hybrid-sleep.service systemd-suspend-then-hibernate.service; do \
      ln -sf /dev/null "/etc/systemd/system/$u"; \
      ln -sf /dev/null "/usr/lib/systemd/system/$u"; \
    done && \
    systemctl enable gdm.service && \
    systemctl set-default graphical.target && \
    rm -f /etc/machine-id /var/lib/systemd/random-seed

# ── PAM: initialise u2f_keys file (populated by yubiOS-enroll-pam) ───────
RUN mkdir -p /etc/yubico && touch /etc/yubico/u2f_keys && chmod 600 /etc/yubico/u2f_keys

# ── Regenerate the shipped initramfs so usr/lib/dracut.conf.d/* actually applies ──
# COPY usr/ above lands dracut.conf.d fragments (fido2, composefs, and the
# ADR-031 VFIO omission in 52-yubiOS-no-vfio.conf) AFTER the base image's own
# kernel-install already produced /usr/lib/modules/<kver>/initramfs.img. bcvk
# DirectBoot (tests/vm/test-vgpu-virtio-ci.sh, ephemeral run) boots that file
# verbatim -- without regenerating it here, the shipped initramfs reflects
# dracut config from before any yubiOS customization existed, so
# omit_drivers+=" vfio ..." (ADR-031 rule 1) never took effect and a default
# guest still exposed /dev/vfio. --no-hostonly matches the generic/portable
# image this container ships (never probe the container-build host's own
# hardware); --force overwrites the stale baked-in initramfs.img in place.
# No pipes here on purpose (hadolint DL4006/SC2012, run 30188695768): a glob
# via `set --` picks the first /usr/lib/modules/*/ match without `ls`, and
# lsinitrd's listing is written to a file before grep instead of piped.
RUN set -- /usr/lib/modules/*/ && \
    kver="$(basename "$1")" && \
    if [ "$(uname -m)" != "aarch64" ]; then \
      sed -i 's/optee tpm_ftpm_tee tee_stmm_efi dw_mmc dw_mmc-pltfm dw_mmc-rockchip sdhci-of-dwcmshc //' /usr/lib/dracut.conf.d/53-yubiOS-optee-ftpm.conf; \
      sed -i 's/xhci_plat_hcd ehci_platform ohci_platform dwc3 dwc3_of_simple phy_rockchip_inno_usb2 phy_rockchip_naneng_combphy phy_rockchip_usbdp rockchipdrm dw_hdmi_qp phy_rockchip_samsung_hdptx analogix_dp //' /usr/lib/dracut.conf.d/50-yubiOS-fido2.conf; \
    fi && \
    dracut --no-hostonly --force --kver "$kver" "/usr/lib/modules/$kver/initramfs.img" && \
    lsinitrd "/usr/lib/modules/$kver/initramfs.img" > /tmp/yubiOS-initramfs-listing.txt && \
    { ! grep -q "/vfio\.ko" /tmp/yubiOS-initramfs-listing.txt; } && \
    if [ "$(uname -m)" = "aarch64" ]; then \
      grep -q "optee\.ko" /tmp/yubiOS-initramfs-listing.txt && \
      grep -q "tpm_ftpm_tee\.ko" /tmp/yubiOS-initramfs-listing.txt; \
    fi && \
    grep -q "usr/lib/modules-load.d/yubiOS-optee-ftpm.conf" /tmp/yubiOS-initramfs-listing.txt && \
    rm -f /tmp/yubiOS-initramfs-listing.txt

# Build leftovers: /run and /tmp must be empty in a bootc image (lint nonempty-run-tmp), and the
# regenerable journal catalog cache under /var is not image state (lint var-tmpfiles). Clean them
# here, in the rootfs stage, so the UKI stage and the final stage hash the same tree.
# /run/systemd/resolve/stub-resolv.conf is bind-mounted by the build runtime; it is kept
# (the bootc lint ignores it too). Everything else under /run and /tmp is removed.
RUN rm -f /var/lib/systemd/catalog/database \
          /usr/share/rpm/rpmdb.sqlite-shm /usr/share/rpm/rpmdb.sqlite-wal \
          /var/lib/rpm/rpmdb.sqlite-shm /var/lib/rpm/rpmdb.sqlite-wal && \
    rm -rf /var/cache/fontconfig /var/cache/gdm /var/cache/libX11 /var/lib/dnf /var/lib/rpm-state /var/log/gdm && \
    find /var -xdev -mindepth 1 -type f ! -path '/var/log/chipsec*' -delete && \
    find /var -xdev -mindepth 1 -type l -delete && \
    python3 -c 'import os, stat; lines = ["# SPDX-License-Identifier: LGPL-2.1-or-later", "d /var/lib/yubiOS 0755 root root - -", "d /var/lib/yubiOS/oci 0755 root root - -", "d /var/opt 0755 root root - -", "L+ /var/opt/antimony - - - - /usr/lib/opt/antimony"];     [lines.append(f"d {r} {stat.S_IMODE(os.lstat(r).st_mode):04o} root root - -") for r, _, _ in os.walk("/var") if r != "/var"];     open("/usr/lib/tmpfiles.d/yubiOS-state.conf", "w").write("\n".join(sorted(set(lines))) + "\n")' && \
    find /tmp -mindepth 1 -delete && \
    find /run -mindepth 1 -maxdepth 1 ! -name systemd -exec rm -rf {} + && \
    find /run/systemd -mindepth 1 -maxdepth 1 ! -name resolve -exec rm -rf {} +

# Remove the identity files as the last rootfs step. The early removal after preset-all
# did not hold: run 39247824761 still shipped etc/machine-id and var/lib/systemd/random-seed
# with per-build random content (isolated OCI layouts differ). The assert fails this step
# if either file reappears.
RUN rm -f /etc/machine-id /var/lib/systemd/random-seed && \
    ! test -e /etc/machine-id && \
    ! test -e /var/lib/systemd/random-seed

# The final stage creates the EFI directories with mkdir, and the composefs digest covers
# directory entries. Create them here too, so the UKI (built from this stage) and the shipped
# image carry the same directory set before the mtime normalisation below.
RUN mkdir -p /boot/EFI/Linux /boot/EFI/BOOT /boot/EFI/systemd

# Reproducibility: bootc embeds the composefs digest of this rootfs in the UKI cmdline, and that
# digest covers file mtimes. Normalise mtimes to SOURCE_DATE_EPOCH (pseudo-filesystems excluded)
# so two clean builds of the same sources embed the same digest.
RUN find / -xdev -mindepth 1 \( -path /proc -o -path /sys -o -path /dev -o -path /etc/hosts -o -path /etc/resolv.conf -o -path /etc/hostname -o -path /run/systemd/resolve \) -prune -o -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} + && \
    touch -h -d "@${SOURCE_DATE_EPOCH}" /

# ── Sealed UKI boot path (bootc UKI install, ADR-032) ───────────────────────
# efitools, pkcs11-provider, sbsigntools: owner signing tools for enroll-sb.sh
# (PIV slot 9a db key, signing only). systemd-boot-unsigned: loader and linux
# stub. systemd-ukify: the backend for `bootc container ukify`.
# bootc install picks a UKI under /boot/EFI/Linux over the raw kernel
# (crates/lib/src/kernel.rs find_kernel), so the board gets a UKI entry instead
# of a BLS kernel entry. bootc container ukify refuses the active root
# ("Cannot operate on active root filesystem"), so the UKI is built from a
# read-only bind mount of the rootfs stage, as in bootc's sealed-image recipe.
# The composefs digest is taken before the UKI and the bootloader files are
# written. The UKI is unsigned here: the owner signs the loader and the UKI with
# the PIV slot 9a db key on the board (enroll-sb.sh resign). sd-stub measures the
# UKI into PCR 11 and sets StubPcrKernelImage, which ConditionSecurity=measured-os
# checks. Secure Boot is not part of that check.
FROM rootfs AS uki
RUN --mount=type=bind,from=rootfs,target=/target set -- /target/usr/lib/modules/*/ && \
    kver="$(basename "$1")" && \
    mkdir -p /out && \
    bootc container ukify --rootfs /target -- --splash /target/usr/share/yubiOS/splash/yubios-owner-orbit.bmp --output "/out/${kver}.efi"

# Reproducibility diagnostic (remove once the UKI is proven deterministic): print the composefs
# digest bootc embeds in the UKI and the UKI's sha256, to compare across isolated builds.
RUN --mount=type=bind,from=rootfs,target=/target echo "UKIDIAG composefs=$(bootc container compute-composefs-digest /target)" ; echo "UKIDIAG uki_sha256=$(sha256sum /out/*.efi)" ; true

FROM rootfs AS prefinal
COPY --from=uki /out/ /boot/EFI/Linux/
RUN case "$(uname -m)" in \
      aarch64) efi_arch=aa64; efi_upper=AA64 ;; \
      x86_64)  efi_arch=x64; efi_upper=X64 ;; \
      *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;; \
    esac && \
    mkdir -p /boot/EFI/BOOT /boot/EFI/systemd && \
    cp "/usr/lib/systemd/boot/efi/systemd-boot${efi_arch}.efi" "/boot/EFI/systemd/systemd-boot${efi_arch}.efi" && \
    cp "/usr/lib/systemd/boot/efi/systemd-boot${efi_arch}.efi" "/boot/EFI/BOOT/BOOT${efi_upper}.EFI"

# Shipped-image assert: machine-id and random-seed must be absent (see the rootfs stage).
RUN ! test -e /etc/machine-id && ! test -e /var/lib/systemd/random-seed

# Final-stage mtime pin (composefs digest). The rootfs stage normalizes mtimes to
# SOURCE_DATE_EPOCH, but the writes in this stage leave build-time mtimes on /, /run and
# /boot. bootc hashes those into the composefs digest, so the digest the installer computes
# for the final image differs from the digest embedded in the UKI (computed on the rootfs
# stage). Re-pin them as the last step so the two digests agree.
ARG SOURCE_DATE_EPOCH
RUN touch -h -d "@${SOURCE_DATE_EPOCH}" / /run /boot /boot/EFI /boot/EFI/Linux /boot/EFI/systemd /boot/EFI/BOOT /boot/EFI/yubiOS /boot/EFI/yubiOS/secureboot /boot/EFI/yubiOS/keys

# Single-layer shipped image. The composefs digest the installer checks is computed from the
# image layers, while the UKI embeds the merged-filesystem digest. One layer makes the two agree
# (rehearsal on the diagnostic single-layer image returned INSTALL_RC=0). Base labels and the
# command are restored here because a scratch stage starts with no config.
FROM scratch
# hadolint ignore=DL3067
COPY --from=prefinal / /
LABEL containers.bootc="1" ostree.bootable="true"
CMD ["/sbin/init"]
