# Mitigation coverage check: MITIGATE.md rows vs. ADR anchors (2026-09-18)

_Moved from docs/ to refs/ 2026-09-19 per Jenny directive: docs/ holds ALL-CAPS normative docs only; wayfinding receipts and drift records live in refs/._
Date: 2026-09-18. Family: integrity record. Origin: wayfinder round 11 rung `add:s5:100000100`,
exemplars `docs/MITIGATE.md`, `docs/THREAT_MODEL.md`, `docs/ADR.md`.

Every mitigation in `docs/MITIGATE.md` should anchor to a decision or accepted control in
`docs/ADR.md` or name its gap honestly ("Path Forward"). Checked this round:

| MITIGATE surface | Anchor state |
|---|---|
| Gap table rows (OEM ROM, hardware radio, kernel CVEs, qcom.dload, UEFI supply chain) | each names its Path Forward (chipsec first-boot #24, hardware selection, ADR-015 digest automation, ADR-017 board matrix) — anchored |
| Attack Flow (mermaid) | descriptive, no anchor needed |
| Boundary bullets (5 "cannot fully prevent") | consistent with THREAT_MODEL.md's assumptions section |
| Coverage stubs (declarative-policy / continuous-monitoring / segmentation) | written prose after the round-10 merge, not template stubs |

No unanchored mitigation found. The round-10 merge preserved all content from both former
sections.

## What this record does not claim

No THREAT_MODEL.md content was re-derived; the check compares surfaces, not threat logic.
