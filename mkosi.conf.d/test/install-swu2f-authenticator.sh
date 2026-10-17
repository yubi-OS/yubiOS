#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
#
# Build & install the `passless` software CTAP2 FIDO2 authenticator into the
# yubiOS TEST image (swu2f Layer 2 — see bcvk docs/swu2f.md). TEST-ONLY: the
# production trust anchor stays the YubiKey FIDO2 device (ADR-003). passless is
# never installed into a production profile.
#
# Why passless:
#   - github.com/pando85/passless (Rust, GPL-3.0). Emulates a hardware FIDO2 key
#     as a virtual /dev/uhid device — exactly the in-guest CTAP2 path bcvk's
#     --swu2f targets (host QEMU u2f-emulated is CTAP1-only and cannot drive
#     systemd-cryptenroll --fido2).
#   - Backend github.com/pando85/soft-fido2 FULLY implements the CTAP2
#     `hmac-secret` extension (soft-fido2-ctap/src/extensions.rs: "fully
#     implemented") — the hard requirement for systemd-cryptenroll --fido2 and
#     systemd-homed --fido2-device.
#
# DEBUG build on purpose: the env switch PASSLESS_E2E_AUTO_ACCEPT_UV (gated on
# cfg(debug_assertions) in cmd/passless/src/authenticator.rs) lets headless CI
# auto-approve user-verification with no desktop-notification daemon. A --release
# build strips that path and would block non-interactive enrollment.
#
# NOTE: passless DEVELOPMENT.md carries a stale `arunanshub/passless` clone URL;
# the live, maintained repo is `pando85/passless` (same author as the
# pando85/soft-fido2 backend). The tag is retained as provenance, while the
# fetched source is pinned to the tag's immutable commit (see PINNED.md).
set -euo pipefail

readonly PASSLESS_REPO="https://github.com/pando85/passless.git"
readonly PASSLESS_TAG="v0.20.2"
readonly PASSLESS_COMMIT="55139d3e209c62e040806c66181b835d1375971e"
readonly PASSLESS_BUILD_ROOT="/tmp/yubios-passless-build"

if ! command -v dnf >/dev/null 2>&1; then
    echo "install-swu2f-authenticator: dnf not found in image build root" >&2
    exit 1
fi

# soft-fido2 needs libudev (UHID) + libtss2 (TPM backend feature) headers; the
# rest is the Rust toolchain + git. Installed transiently, removed afterwards so
# the test image stays close to the production package surface.
readonly BUILD_DEPS=(git cargo rust gcc systemd-devel tpm2-tss-devel)

clean_package_manager_state() {
    # DNF5 can emit wall-clock log/history state and repository countme data
    # even when history_record=false, and package scriptlets refresh ldconfig's
    # filesystem-order-dependent auxiliary cache. None is part of the runnable
    # image contract. The RPM database and /etc/ld.so.cache remain intact.
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
        /usr/lib/sysimage/libdnf5/transaction_history.sqlite* \
        /usr/lib/sysimage/libdnf5/*.toml
}

# Defensive: dnf5 can leave a stale package-cache lock file behind in a
# committed container layer (the PID that held it is long gone by the time a
# derived image runs this script). dnf5 checks for file existence, not a live
# flock, so a leftover lock file blocks every subsequent dnf call with
# "failed to acquire package cache lock: File exists (os error 17)" even
# though nothing is actually running. Clear it before the first real dnf call.
# Retry loop: dnf5's package-cache lock has been observed to be transiently
# held mid-transaction in this build context (not just stale at start), so a
# one-shot pre-cleanup isn't sufficient. Clear any lock file and retry a few
# times with backoff rather than failing the whole image build on flakiness.
install_ok=0
for attempt in 1 2 3 4 5; do
  rm -f /var/cache/dnf/*.lock /var/cache/dnf/*.pid /run/dnf5.lock /run/dnf.lock 2>/dev/null || true
  if dnf -y --setopt=history_record=false --setopt=install_weak_deps=False install "${BUILD_DEPS[@]}"; then
    install_ok=1
    break
  fi
  echo "install-swu2f-authenticator: dnf install attempt ${attempt} failed (package cache lock contention), retrying..." >&2
  sleep 5
done
if [ "${install_ok}" -ne 1 ]; then
  echo "install-swu2f-authenticator: dnf install failed after 5 attempts" >&2
  exit 1
fi

src="${PASSLESS_BUILD_ROOT}/src"
cargo_home="${PASSLESS_BUILD_ROOT}/cargo-home"
rm -rf "${PASSLESS_BUILD_ROOT}"
mkdir -p "${src}" "${cargo_home}"
trap 'rm -rf "${PASSLESS_BUILD_ROOT}"' EXIT
git init "${src}"
git -C "${src}" remote add origin "${PASSLESS_REPO}"
git -C "${src}" fetch --depth 1 origin "${PASSLESS_COMMIT}"
git -C "${src}" checkout --detach FETCH_HEAD
test "$(git -C "${src}" rev-parse HEAD)" = "${PASSLESS_COMMIT}"

# passless v0.20.2 uses soft-fido2 0.17.0, whose hmac-secret makeCredential and
# getAssertion paths are complete, but passless advertises only credProtect in
# GetInfo. Enable the implemented extension in this TEST-only build so systemd-
# cryptenroll and systemd-homed can request it. Keep this exact-source assertion
# loud: an upstream layout/config change must be reviewed rather than patched
# silently at the wrong location.
authenticator_rs="${src}/cmd/passless/src/authenticator.rs"
grep -Fq '.extensions(vec!["credProtect".to_string()])' "${authenticator_rs}"
sed -i 's/\.extensions(vec!\["credProtect"\.to_string()\])/.extensions(vec!["credProtect".to_string(), "hmac-secret".to_string()])/' \
    "${authenticator_rs}"
grep -Fq '.extensions(vec!["credProtect".to_string(), "hmac-secret".to_string()])' \
    "${authenticator_rs}"
# v0.20.2 has four authenticator builder sites. Every credProtect-only GetInfo
# extension list must be patched, not just the first one the sed reached.
if grep -Fq '.extensions(vec!["credProtect".to_string()])' "${authenticator_rs}"; then
    echo "install-swu2f-authenticator: unpatched credProtect-only GetInfo site remains" >&2
    exit 1
fi

# The real failure this build hit was NOT dnf (dnf completes cleanly, 113/113):
# cargo's own cache dir ($CARGO_HOME, defaults to /root/.cargo when running as
# root) fails to be created with "File exists (os error 17)" in this container
# build context -- something about /root/.cargo already existing as a
# non-directory entry in the base image/build overlay. Sidestep it entirely by
# pointing CARGO_HOME at a throwaway directory we know is clean.
export CARGO_HOME="${cargo_home}"
export CARGO_INCREMENTAL=0
export RUSTFLAGS="--remap-path-prefix=${src}=/usr/src/passless --remap-path-prefix=${cargo_home}=/usr/src/cargo-home"

# `cargo install --debug` => debug profile (debug_assertions on) => the
# PASSLESS_E2E_AUTO_ACCEPT_UV path compiles in. --root /usr installs to /usr/bin.
( cd "${src}" && cargo install --debug --locked --path cmd/passless --root /usr )

# Ship the upstream integration bits verbatim (sysusers creates the `fido` group,
# udev grants it /dev/uhid, modules-load ensures uhid even without bcvk's karg).
install -Dm0644 "${src}/contrib/sysusers.d/passless.conf" /usr/lib/sysusers.d/passless.conf
install -Dm0644 "${src}/contrib/udev/90-passless.rules"   /usr/lib/udev/rules.d/90-passless.rules
install -Dm0644 "${src}/contrib/modules-load.d/fido.conf" /usr/lib/modules-load.d/yubiOS-swu2f-uhid.conf

dnf -y --setopt=history_record=false remove "${BUILD_DEPS[@]}" || true
dnf -y --setopt=install_weak_deps=False clean all || true
clean_package_manager_state

/usr/bin/passless --version || true
echo "install-swu2f-authenticator: passless ${PASSLESS_TAG} (${PASSLESS_COMMIT}) installed with hmac-secret (TEST-ONLY swu2f Layer 2)"
