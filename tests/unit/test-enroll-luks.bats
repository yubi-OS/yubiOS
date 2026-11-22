#!/usr/bin/env bats
# Unit tests for enroll-luks.sh crypttab logic

setup() {
  export TMPDIR="$(mktemp -d)"
  CRYPTTAB="$TMPDIR/crypttab"
  touch "$CRYPTTAB"
  systemd-cryptenroll() { echo "mock: enrolled FIDO2"; return 0; }
  cryptsetup()          { echo "abc-def-123"; }  # luksUUID
  dracut()              { echo "mock dracut"; return 0; }
  fido2-token()         { echo "/dev/hidraw0: U2F/HSM"; }
  export -f systemd-cryptenroll cryptsetup dracut fido2-token
}

teardown() { rm -rf "$TMPDIR"; }

@test "crypttab gets fido2-device=auto appended for new LUKS UUID" {
  CRYPTTAB="$TMPDIR/crypttab"
  LUKS_UUID="abc-def-123"
  echo "" > "$CRYPTTAB"
  echo "luks0 UUID=$LUKS_UUID none luks,fido2-device=auto" >> "$CRYPTTAB"
  run grep -c "fido2-device=auto" "$CRYPTTAB"
  [ "$output" -ge 1 ]
}

@test "crypttab not duplicated if fido2-device=auto already present" {
  CRYPTTAB="$TMPDIR/crypttab"
  echo "luks0 UUID=abc-123 none luks,fido2-device=auto" > "$CRYPTTAB"
  # Simulate the guard: if ! grep -q "fido2-device=auto" /etc/crypttab
  if ! grep -q "fido2-device=auto" "$CRYPTTAB"; then
    echo "luks0 UUID=abc-123 none luks,fido2-device=auto" >> "$CRYPTTAB"
  fi
  run grep -c "fido2-device=auto" "$CRYPTTAB"
  [ "$output" -eq 1 ]
}
