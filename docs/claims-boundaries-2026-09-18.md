# Claims boundaries: what the campaign surfaces may say vs. what the threat model bounds (2026-09-18)

Date: 2026-09-18. Family: boundary record. Origin: wayfinder round 11 rung `add:s4:110010100`,
sitting between `docs/PR.md`, `docs/THREAT_MODEL.md`, and `docs/ARCHITECTURE.md` (its exemplars).

## The rule

`docs/PR.md`'s campaign story may claim exactly what `docs/THREAT_MODEL.md` can bound and
`docs/ARCHITECTURE.md` can point at — nothing stronger. Concretely:

| Campaign surface may say | Because (bound) | May NOT say |
|---|---|---|
| FIDO2-first immutable OS; YubiKey as identity root | ARCHITECTURE.md's trust-chain sections; the hardware-leg proof (OMN-42/89) | "unhackable", "secure by default" |
| UKI + Secure Boot signing via PIV slot 9c | the signed-UKI VM lane evidence (round-6-era PR #155 matrix) | "production Secure Boot" before real-board ROTPK/fuse (B-ARM64-PATHA) |
| Groundwork / technical preview | README's Status badge; SECURITY.md's supported-versions table | any production-support language |
| "No OEM [root of trust]" (the tagline) | true on ARM64 Path A by design; x86-64 roots remain OEM-supplied per ARCHITECTURE.md | an unqualified "no OEM" that erases the x86-64 caveat |

This record is the one-page check a future PR.md edit runs against before publishing.

## What this record does not claim

No new campaign copy is approved here; PR.md's content governs. The bounds cited are the
in-corpus docs' own statements, verified this round.
