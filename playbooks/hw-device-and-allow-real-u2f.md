# hw_device + allow_real_u2f — the two-flag opt-in (2026-08-01)

## Context

Apply when dispatching `ci_test-vm.yml` or `ci_test-vgpu-vm.yml`, especially self-mode against the arm64 self-hosted `rock1` runner. These are the only two workflows in the fleet whose dispatch body can **physically wipe a runner disk** (`hw_device`) and the only two that can **silently mask a regression** behind a real U2F/HSM (`allow_real_u2f`).

- `hw_device` — DESTRUCTIVE. Names a spare block device for the hardware install leg. Empty ⇒ leg skipped.
- `allow_real_u2f` — safety opt-in, required when a physical Yubico device is on the host.

## Decision

**Two flags, opted into independently, never inferred.**

- Unattended/self-mode: `hw_device: ''`, `allow_real_u2f: false`.
- Destructive: explicit `hw_device: /dev/sdX` **plus Jenny's approval for that run**.
- Runner with a physical key: `allow_real_u2f: true`, or the guard refuses — and **that refusal is correct safety behavior, not a bug**.

Only these two workflows declare `allow_real_u2f`; forwarding it to any other child (`ci_test_rootless-docker.yml`, `ci_test_pq_tls_verify.yml`, `ci_test_sealed-uki-vm.yml`, `ci_test_bootc-filesystem.yml`) returns **422**.

## Mechanism

Why the guard exists: with a real key on the host, the in-guest software authenticator (`swu2f`) can lose the `/dev/hidraw*` enumeration race to the real key. The passless tests would then exercise the physical key and a passless regression would pass unnoticed. `assert_passless_only` in `tests/vm/lib/real-u2f-guard.sh` (PR #144) detects the device and refuses.

Two plumbing hops — the second is the one people miss:

1. `allow_real_u2f: true` sets `ALLOW_REAL_U2F=1` in the step env (`5200f0b`).
2. The test call must forward it **explicitly** through sudo — sudo does not inherit the parent env (`5342867`):

```bash
sudo env ALLOW_REAL_U2F="${ALLOW_REAL_U2F}" ./tests/vm/test-luks-fido2-ci.sh
```

Runner pre-flight before any destructive dispatch:

```bash
lsusb | grep -i -E 'yubico|1050:' && echo "REAL KEY PRESENT"   # ⇒ allow_real_u2f MUST be true
lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS,MODEL
findmnt -n /dev/sdX && { echo "REFUSE: mounted"; exit 1; }
uname -r; sysctl -n kernel.unprivileged_userns_clone 2>/dev/null   # rootless lane
ls /sys/kernel/iommu_groups | wc -l                               # vgpu lane
```

Dispatch shapes (`…/ci_test-vm.yml/dispatches`, `IMG=docker.io/0mniteck/yubios:dev-<short-sha>`):

```jsonc
{"ref":"main","inputs":{"image":"$IMG","hw_device":"","allow_real_u2f":"false"}}  // hosted, no real key
{"ref":"main","inputs":{"image":"$IMG","hw_device":"","allow_real_u2f":"true"}}   // rock1 w/ real key
{"ref":"main","inputs":{"image":"$IMG","hw_device":"/dev/sdX","allow_real_u2f":"true"}} // DESTRUCTIVE, Jenny-approved
```

| Symptom | Cause | Action |
|---|---|---|
| guard refuses, passless test skipped | real key attached, flag unset | re-dispatch with `allow_real_u2f: true`. Do **not** unplug the key mid-run or patch the guard |
| `422 Unprocessable Entity` | flag forwarded to a workflow that doesn't declare it | forward only declared inputs; use `--ref` for branch selection |
| destructive leg silently skipped | `hw_device` empty | intended default — name the device if you wanted it |
| passless test passes with a real key and `allow_real_u2f: false` | guard bypassed | treat the result as **void**, not green |

## Verified working (2026-08-01)

- Guard `assert_passless_only` in `tests/vm/lib/real-u2f-guard.sh`, shipped by **PR #144**; its refusal on rock1 with a real key is the recorded correct behavior.
- Commit **`5200f0b`** ("fix(ci): add allow_real_u2f dispatch input + ALLOW_REAL_U2F env to passless CI tests") added the `allow_real_u2f` boolean input (default `false`) setting `ALLOW_REAL_U2F=1`.
- Commit **`5342867`** ("fix(ci): forward ALLOW_REAL_U2F env to sudo invocations in passless CI test steps") added explicit `sudo env …` forwarding — without it the flag was set in CI and invisible to the test.
- Commit **`6dad3733`** ("fix(tests/vm): shellcheck SC2034 on ALLOW_REAL_U2F in PR #144 followups") patched the shellcheck-disable that PR #144's inline `ALLOW_REAL_U2F=1` triggered (shellcheck doesn't track cross-file consumers).
- All three on `main` as of 2026-07-30.
- vm-e2e #143 (`30523246025` at `5342867`) **green** end-to-end on rock1; the guard refusal is now opt-in by flag rather than by physically unplugging the key.

## Tradeoffs

Default `false` is fail-safe (a hosted amd64 dispatch still detects a key someone plugs in) at the cost of one re-dispatch when running deliberately on rock1. Requiring `hw_device` explicitly means an unattended dispatch can report green while never touching real hardware — read the job's skip lines before claiming hardware coverage. Still missing: the dispatch step does not itself `lsusb` and fail fast when a key is present and the flag is unset. Today that's the operator's job.

## Cross-references

- **See also:** `docs/BLOCKERS.md` → **B-REAL-FIDO2** and → Permanent CI-Evidence Patterns; `PROJECT_RULES.md` → "ALLOW_REAL_U2F workflow fix (2026-07-30)".
- PRs **#144**, **#137** (vgpu lane, ADR-031 rule 5), **#145**. Commits `5200f0b`, `5342867`, `6dad3733`. Run `30523246025`.
- Linear OMN-42 (physical-key parent), OMN-63 (12 scenarios), OMN-149.
- Tests: `tests/vm/lib/real-u2f-guard.sh`, `test-luks-fido2-ci.sh`, `test-luks-fido2.sh` (HIL), `test-fido2-enrollment.sh`.
- Playbooks: [fido2-vm-e2e-recipe](fido2-vm-e2e-recipe.md), [dispatch-chain-verification](dispatch-chain-verification.md).
