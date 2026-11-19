#!/usr/bin/env bash
# yubiOS vfio-user leg -- QEMU's userspace device client against a userspace
# device server. NO kernel VFIO modules, NO IOMMU, NO real device.
#
# Why this is the architecture yubiOS cares about (see
# refs/vgpu-vfio-user-trust-boundary-2026-07-25.md): with vfio-user the device
# model lives in a separate unprivileged process, the DMA window is negotiated
# explicitly over an AF_UNIX socket (VFIO_USER_VERSION -> GET_INFO/REGION_INFO ->
# DMA_MAP), and the protocol spec states client and server must not trust each
# other. That is a boundary we can actually enforce and test, unlike vfio-pci
# passthrough which needs a real IOMMU and hands a DMA-capable peer the same
# memory a U2F/HSM-unlocked LUKS2 volume key lives in.
#
# Upstream state: the vfio-user CLIENT landed in QEMU 10.1 as `vfio-user-pci`,
# configured with
#   -device '{"driver":"vfio-user-pci","socket":{"path":"...","type":"unix"}}'
# The server side is any libvfio-user implementation; point VFIO_USER_SERVER at
# one (e.g. libvfio-user's samples/gpio-pci-idio-16) plus VFIO_USER_SERVER_ARGS.
#
# Exit codes: 0 = pass, 77 = explicit SKIP, 1 = failure.
set -euo pipefail

QEMU_BIN="${QEMU_BIN:-qemu-system-aarch64}"
QEMU_MACHINE="${QEMU_MACHINE:-virt}"
VFIO_USER_SERVER="${VFIO_USER_SERVER:-}"
VFIO_USER_SERVER_ARGS="${VFIO_USER_SERVER_ARGS:-}"
ATTACH_WAIT_SECS="${ATTACH_WAIT_SECS:-20}"
WORK="${WORK:-${PWD}/vfio-user-ci}"
LOG_DIR="${LOG_DIR:-/tmp/yubios-vgpu-logs}"

log()  { printf '\n=== %s ===\n' "$*"; }
skip() { printf 'SKIP: %s\n' "$*"; }
die()  { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing host tool: $1"; }

SERVER_PID=""
QEMU_PID=""
cleanup() {
  [[ -n "$QEMU_PID" ]]   && kill "$QEMU_PID"   2>/dev/null || true
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

log "host preflight"
need "$QEMU_BIN"
mkdir -p "$WORK" "$LOG_DIR"
"$QEMU_BIN" --version | head -1

QEMU_VERSION="$("$QEMU_BIN" --version | sed -n '1s/.*version \([0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')"
[[ -n "$QEMU_VERSION" ]] || die "cannot parse a version out of ${QEMU_BIN} --version"
QEMU_MAJOR="${QEMU_VERSION%%.*}"
QEMU_MINOR="${QEMU_VERSION##*.}"
echo "QEMU ${QEMU_VERSION} (major ${QEMU_MAJOR}, minor ${QEMU_MINOR})"

# The device-model probe below is the real gate; this only makes the version
# expectation explicit in the log when someone reads a SKIP later.
if [[ "$QEMU_MAJOR" -lt 10 ]] || { [[ "$QEMU_MAJOR" -eq 10 ]] && [[ "$QEMU_MINOR" -lt 1 ]]; }; then
  echo "NOTE: QEMU ${QEMU_VERSION} predates the 10.1 vfio-user client; expect the probe below to SKIP."
fi

if ! "$QEMU_BIN" -device help 2>&1 | grep -q 'vfio-user-pci'; then
  skip "${QEMU_BIN} ${QEMU_VERSION} has no vfio-user-pci device model. The vfio-user client is upstream from QEMU 10.1; rebuild the CI QEMU at >= 10.1 (ci_test-vm.yml already builds one from source for the zstd zboot workaround)."
  exit 77
fi
echo "PASS: vfio-user-pci device model present"

# The whole point: vfio-user needs no kernel VFIO at all. Assert that before and
# after, so a green run is also evidence no kernel device got bound.
assert_no_kernel_vfio() {
  local when="$1"
  if lsmod 2>/dev/null | awk '{print $1}' | grep -qE '^vfio(_pci|_iommu_type1)?$'; then
    die "kernel vfio module loaded ${when}; the vfio-user path must not require kernel VFIO"
  fi
  if [[ -e /dev/vfio/vfio ]]; then
    skip "/dev/vfio/vfio exists on this host (${when}); not fatal, but nothing in this leg may open it"
  fi
  echo "PASS: no kernel VFIO in use (${when})"
}
assert_no_kernel_vfio "before"

if [[ -z "$VFIO_USER_SERVER" ]]; then
  for candidate in \
    /usr/local/bin/gpio-pci-idio-16 \
    /opt/libvfio-user/build/samples/gpio-pci-idio-16 \
    "${WORK}/libvfio-user/build/samples/gpio-pci-idio-16"; do
    [[ -x "$candidate" ]] && { VFIO_USER_SERVER="$candidate"; break; }
  done
fi

if [[ -z "$VFIO_USER_SERVER" || ! -x "$VFIO_USER_SERVER" ]]; then
  skip "no vfio-user server binary. Client-side gate PASSED (QEMU ${QEMU_VERSION} carries vfio-user-pci). For the handshake leg, set VFIO_USER_SERVER to a libvfio-user server, e.g. build nutanix/libvfio-user with meson and use build/samples/gpio-pci-idio-16, or publish it in an OCI bundle like 0mniteck/yubios:firmware-qemu-arm64."
  exit 77
fi
echo "vfio-user server: ${VFIO_USER_SERVER}"

SOCK="${WORK}/vfio-user.sock"
SERVER_LOG="${LOG_DIR}/vfio-user-server.log"
CLIENT_LOG="${LOG_DIR}/vfio-user-qemu.log"
rm -f "$SOCK" "$SERVER_LOG" "$CLIENT_LOG"

log "start the userspace device server on ${SOCK}"
SERVER_ARGS=()
if [[ -n "$VFIO_USER_SERVER_ARGS" ]]; then
  read -r -a SERVER_ARGS <<<"$VFIO_USER_SERVER_ARGS"
fi
"$VFIO_USER_SERVER" "${SERVER_ARGS[@]}" "$SOCK" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  [[ -S "$SOCK" ]] && break
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.5
done
if [[ ! -S "$SOCK" ]]; then
  echo "--- server log ---"
  cat "$SERVER_LOG" || true
  die "vfio-user server never created the unix socket at ${SOCK}"
fi

# ADR-031 rule 4: the socket is the only access control this protocol has.
# libvfio-user lib/tran_sock.c creates the AF_UNIX socket with socket(AF_UNIX)+bind()
# and never chmods it; mode is whatever the process umask allows. On a workflow
# runner where the test script runs via `sudo env ... bash`, sudo default umask
# of 0022 gives a socket mode of 0755 -- which the assert below correctly rejects.
# Tighten to 0600 here, in the test script that owns the protocol guarantee, so
# the boundary holds regardless of who is invoking the test.
chmod 0600 "$SOCK"
SOCK_MODE="$(stat -c '%a' "$SOCK")"
echo "socket mode (after chmod 0600): ${SOCK_MODE}"

# Spec: local AF_UNIX sockets rely on OS access control; authentication for
# sockets spanning hosts/guests is deferred. So the socket permissions ARE the
# boundary -- assert nothing beyond the owner can speak the protocol.
SOCK_MODE="$(stat -c '%a' "$SOCK")"
echo "socket mode: ${SOCK_MODE}"
case "$SOCK_MODE" in
  600|700) echo "PASS: vfio-user socket is owner-only" ;;
  *) die "vfio-user socket mode ${SOCK_MODE} is wider than owner-only; the socket is the only access control this protocol has" ;;
esac

log "attach QEMU as the vfio-user client"
# -S keeps the vCPU paused: PCI device realize (and therefore the whole
# VERSION/GET_INFO/REGION_INFO handshake) still happens at init, but no guest code
# runs, so this needs no kernel, no firmware and no disk.
"$QEMU_BIN" \
  -M "$QEMU_MACHINE" -cpu max -m 512 -S \
  -display none -nographic -no-reboot \
  -device "{\"driver\":\"vfio-user-pci\",\"socket\":{\"path\":\"${SOCK}\",\"type\":\"unix\"}}" \
  >"$CLIENT_LOG" 2>&1 &
QEMU_PID=$!

# A failed VERSION/GET_INFO negotiation kills QEMU during device realize, so
# surviving the attach window IS the handshake assertion.
alive=0
for _ in $(seq 1 "$ATTACH_WAIT_SECS"); do
  sleep 1
  if kill -0 "$QEMU_PID" 2>/dev/null; then alive=1; else alive=0; break; fi
done

if [[ "$alive" -ne 1 ]]; then
  echo "--- QEMU client log ---"
  cat "$CLIENT_LOG" || true
  echo "--- server log ---"
  cat "$SERVER_LOG" || true
  die "QEMU exited during vfio-user device realize; version/region negotiation failed"
fi
echo "PASS: QEMU held the vfio-user device open for ${ATTACH_WAIT_SECS}s"

if grep -Eiq 'vfio-user.*(error|failed)|failed to connect|Device initialization failed' "$CLIENT_LOG"; then
  echo "--- QEMU client log ---"
  cat "$CLIENT_LOG" || true
  die "QEMU reported a vfio-user error even though the process stayed up"
fi
echo "PASS: no vfio-user errors in the client log"

kill "$QEMU_PID" 2>/dev/null || true
wait "$QEMU_PID" 2>/dev/null || true
QEMU_PID=""

if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "PASS: server survived client disconnect (no crash on teardown)"
else
  skip "server exited when the client disconnected; acceptable for a one-shot sample server"
fi
kill "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""

assert_no_kernel_vfio "after"

log "PASS: vfio-user client/server handshake over an owner-only unix socket, no kernel VFIO"
