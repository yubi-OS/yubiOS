# yubiOS — FIDO2-first immutable OS image (Fedora base)
# Build: use scripts/build-local-images.sh or initialize
# scripts/lib/reproducible-build.sh before invoking Bake directly.
# Source: bootc design https://github.com/bootc-dev/bootc
# Source: particleos ethos https://github.com/systemd/particleos

FROM quay.io/fedora/fedora-bootc:45@sha256:d3a7b4a7f60d06868d5d1193204872e711f5271ff54add6a82dcec62a68268aa

# BuildKit also consumes this special argument for OCI timestamps. Declaring it
# makes the same canonical epoch visible to package/build tools in RUN steps.
ARG SOURCE_DATE_EPOCH

# ── YubiKey and FIDO2 stack ──────────────────────────────────────────────
# libfido2:       FIDO2/CTAP2 library; used by systemd-cryptenroll, OpenSSH, pam-u2f
# yubikey-manager: ykman CLI for PIV, FIDO2, OATH management
# yubico-piv-tool: PIV operations for Secure Boot signing (slot 9c)
# opensc:          PKCS#11 middleware; systemd-sbsign uses this to talk to YubiKey PIV
# pam-u2f:         PAM module for FIDO2/U2F; requires >= 1.3.1 (CVE-2025-23013)
#                  Source: https://www.yubico.com/support/security-advisories/ysa-2025-01/
# pcsc-lite:       PC/SC daemon; needed for PIV/CCID interface
# Fedora 45's DNF5 emits mutable cache, log, repository countme, and
# transaction-history state;
# package scriptlets also refresh ldconfig's regenerable auxiliary cache in
# filesystem-dependent order. RPM itself honors SOURCE_DATE_EPOCH, so remove
# those caches while retaining the installed RPM and runtime linker databases.
RUN dnf -y --setopt=history_record=false --setopt=install_weak_deps=False install \
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
      bootupd \
      cryptsetup \
      openssh-clients \
      openssh-server \
      fido2-tools \
      python3-pip \
      python3-devel \
      gcc \
      osslsigncode && \
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
      /usr/lib/sysimage/libdnf5/transaction_history.sqlite*

# ── First-boot firmware validation (ADR-024) ─────────────────────────────
# CHIPSEC is distributed from PyPI rather than Fedora repos. Pin the source
# release and hash so the first-boot firmware checker is reproducible.
RUN echo 'chipsec==1.13.16 --hash=sha256:63bed5ad4224402397817ea82b94c3a21736386a04ff778c003704bd6dfdbca3' \
      > /tmp/chipsec-requirements.txt && \
    PYTHONHASHSEED=0 python3 -m pip install --no-cache-dir --no-compile \
      --break-system-packages --require-hashes \
      -r /tmp/chipsec-requirements.txt && \
    chipsec_site="$(PYTHONDONTWRITEBYTECODE=1 python3 -c \
      'import sysconfig; print(sysconfig.get_path("platlib"))')" && \
    test -d "${chipsec_site}/chipsec" && \
    PYTHONHASHSEED=0 python3 -m compileall -f -q -j 1 \
      --invalidation-mode=checked-hash \
      "${chipsec_site}/chipsec" && \
    rm -rf /root/.cache /tmp/pip-* /tmp/chipsec-requirements.txt

# ── Overlay yubiOS config tree ───────────────────────────────────────────
COPY usr/ /usr/

# ── SSH: allow bcvk CI root key credentials only when present ─────────────
RUN mkdir -p /etc/ssh/sshd_config.d && \
    cp /usr/lib/yubiOS/sshd_config.d/10-yubiOS-bcvk-root-key.conf \
      /etc/ssh/sshd_config.d/10-yubiOS-bcvk-root-key.conf

# ── Permissions for enrollment and first-boot scripts ────────────────────
RUN chmod +x /usr/lib/yubiOS/*.sh /usr/lib/yubiOS/chipsec/*.sh

# ── /usr/bin symlinks for enrollment commands ────────────────────────────
# Wrapper scripts in /usr/lib/yubiOS/ exec the real scripts.
# Symlinks here make commands available as: yubiOS-enroll-sb, -luks, -pam, -ssh
RUN ln -sf /usr/lib/yubiOS/enroll-sb-wrapper.sh   /usr/bin/yubiOS-enroll-sb   && \
    ln -sf /usr/lib/yubiOS/enroll-luks-wrapper.sh /usr/bin/yubiOS-enroll-luks && \
    ln -sf /usr/lib/yubiOS/enroll-pam-wrapper.sh  /usr/bin/yubiOS-enroll-pam  && \
    ln -sf /usr/lib/yubiOS/enroll-ssh-wrapper.sh  /usr/bin/yubiOS-enroll-ssh  && \
    ln -sf /usr/lib/yubiOS/enroll-homed-wrapper.sh /usr/bin/yubiOS-enroll-homed

# ── Wire PAM: yubiOS-sudo config → /etc/pam.d/sudo ──────────────────────
# Replaces Fedora's stock sudo PAM with yubiOS policy:
#   auth required pam_u2f.so  (YubiKey touch ALWAYS needed, not optional)
# Recovery if locked out: boot with rd.break, remount rw, comment out pam_u2f
# Source: https://github.com/Yubico/pam-u2f
RUN cp /usr/lib/pam.d/yubiOS-sudo /etc/pam.d/sudo

# ── Wire PAM: yubiOS-system-auth → /etc/pam.d/system-auth ────────────────────
# Adds pam_systemd_home.so to the system auth stack so homed users are activated
# on login. Homed FIDO2 handles auth for homed users; pam_u2f handles classic users.
# suspend=1: forgets key material on system suspend.
# Source: https://www.man7.org/linux/man-pages/man8/pam_systemd_home.8.html
RUN cp /usr/lib/pam.d/yubiOS-system-auth /etc/pam.d/system-auth

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
    dracut --no-hostonly --force --kver "$kver" "/usr/lib/modules/$kver/initramfs.img" && \
    lsinitrd "/usr/lib/modules/$kver/initramfs.img" > /tmp/yubiOS-initramfs-listing.txt && \
    { ! grep -q "/vfio\.ko" /tmp/yubiOS-initramfs-listing.txt; } && \
    rm -f /tmp/yubiOS-initramfs-listing.txt
