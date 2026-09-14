# Wayfinder round-3 isolate census (frozen frame `a045c8d3f4ff939b`, 2026-09-13)

**Method:** map 74 (round-3 cycle 8), 174 docs, frozen-frame placement, isolation radius 0.095.
62 isolated points, recomputed independently from the stored coordinates (matches the
instrument’s own count exactly). Isolation is a geometry reading, not a quality verdict.
Class assignment below is by reading the docs, one class per doc’s dominant content.

| Class | Count | Docs |
|---|---|---|
| dated status snapshots | 9 | `arm64-rk-board-status-2026-07-17.md`, `chromium-provenance-overlay-status-2026-09-09.md`, `cycle4-results-2026-08-06.md`, `cycle5-results-2026-08-06.md`, `days-31-60-narrow-product-2026-07-25.md`, `days-61-90-willingness-to-pay-2026-07-25.md`, `first-90-days-2026-07-25.md`, `wayfinder-loop-results-2026-09-09.md`, `arm64-path-a-omn36-lapse-2026-09-13.md` |
| canonical negatives / evidence records | 4 | `fractalrabbit-falsification-harness-2026-08-06.md`, `single-action-atom-merkle-2026-08-07.json`, `single-action-atom-merkle-2026-08-07.md`, `zernike-fit-2026-08-24.md` |
| method / bridge docs | 10 | `differential-curve-use-case-skill-land-grab-detection-2026-08-04.md`, `gap-map-hyperspherical-harmonic-curve-2026-08-05.md`, `hyperspherical-harmonic-curve-v1-fit-2026-08-05.md`, `navier-stokes-wayfinder-math-2026-09-10.md`, `negative-skill-space-2026-07-28.md`, `point-to-point-latent-map-2026-09-06.md`, `point-to-point-latent-map-solo-2026-09-06.md`, `prior-art-autonomous-ideation-skill-2026-07-28.md`, `prior-art-state-of-art-2026-07-30.md`, `wayfinder-loop-results-2026-09-09.md` |
| business-plan docs | 14 | `covenant-conflict-policy-2026-07-25.md`, `days-31-60-narrow-product-2026-07-25.md`, `days-61-90-willingness-to-pay-2026-07-25.md`, `entity-governance-legal-2026-07-25.md`, `naming-licensing-provenance-2026-07-25.md`, `offer-pricing-architecture-2026-07-25.md`, `pilot-collateral-roi-baseline-2026-07-25.md`, `pr-campaign-research-2026-07-16.md`, `pr-friend-map-2026-07-17.md`, `public-security-funding-targets-2026-07-25.md`, `readiness-gates-gtm-2026-07-25.md`, `team-budget-use-of-funds-2026-07-25.md`, `testing-production-gaps-2026-08-01.md`, `yubios-scamper-product-brief-investor-memo-2026-08-07.md` |
| infra/security references | 17 | `arm64-zstd-efi-zboot-bcvk-2026-07-23.md`, `attested-bootc-gpu-cutover-2026-07-30.md`, `bcvk-swtpm-ci-2026-07-23.md`, `bootc-composefs-sealed-flow-2026-07-22.md`, `bootc-dev-org-releases-2026-07-23.md`, `bootc-upgrade-rollback-sysext-portable-test-spec-2026-08-04.md`, `docker-bake-consolidation-2026-07-17.md`, `docker-build-policies-reference-2026-07-23.md`, `kernel-rootfs-split-2026-07-29.md`, `package-floor-verification-checklist-2026-08-04.md`, `post-quantum-tls-adoption-2026-07-23.md`, `release-gate-checklist-v2-2026-08-04.md`, `reproducible-builds-2026-07-22.md`, `sectime-rk-secure-time-2026-07-17.md`, `validate-input-shape-doctrine-2026-08-04.md`, `yubikey-hw-validation-scenarios-2026-07-25.md`, `yubios-reproducibility-equivalents-2026-07-30.md` |
| mode-series (2026-09-01) | 2 | `mode-container-isolation-2026-09-01.md`, `mode-fido2-boot-unlock-2026-09-01.md` |
| chromium/runner (round-3) | 3 | `chromium-provenance-overlay-status-2026-09-09.md`, `chromium-runner-highmem-2026-09-09.md`, `adjacent-problems-runner-privilege-2026-09-13.md` |
| other (single-topic references) | 7 | `adjacent-problems-fido2-secure-boot-2026-09-01.md`, `adr-033-misbehavior-cutoff-policy-2026-07-28.md`, `current-position-evidence-2026-07-25.md`, `decisions-deferrals-rejected-models-2026-07-25.md`, `point-map-real-cloud-2026-09-06.md`, `repo-history-skill-cycle-4-2026-08-07.md`, `three-year-revenue-cost-model-2026-07-25.md` |

## Reading for future cycles

- **Dated status snapshots** gain neighbours when refreshed; future CHANGE rungs should
target them (this round refreshed three: chromium-provenance-overlay, arm64-path-a,
release tracking).
- **Canonical negatives/evidence records** (sbsign-pkcs11-validate, phonon bridge,
zernike, merkle): isolation preserves unique evidence. Round-1 already declined deleting
one of these; merging or padding them to de-isolate is the same mistake by another name.
- **Business-plan docs** form a large isolated tail: they share few primitives with the
systems corpus by nature. Their isolation is structural, not a defect.
- The census is a target list with a do-not-touch column, not a quality score.
