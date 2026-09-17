# yubiOS metrics and reporting

**Status:** draft, several metrics flagged not-yet-measurable | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-75](https://linear.app/omni-agent/issue/OMN-75/metrics-and-reporting)

## Why this exists

OMN-75 asks for public project-health metrics and internal business-health
metrics, each tied to a decision rather than vanity reporting. This document
proposes that set grounded only in structures that already exist in the repo
(BLOCKERS.md, MITIGATE.md, ADR.md, CI runs, PINNED.md) and the offer catalog
drafted in [refs/offer-pricing-architecture-2026-07-25.md](offer-pricing-architecture-2026-07-25.md)
(OMN-71) â it does not invent analytics infrastructure or data sources that
don't exist yet. Where no current mechanism produces a number, that's marked
explicitly rather than assumed solved.

## 1. Public project-health metrics

These are metrics an external observer (contributor, prospective customer,
security researcher) could plausibly check today or with a small amount of new
tooling, and each maps to an existing repo artifact:

| Metric | Source | Decision it drives |
|---|---|---|
| Open BLOCKERS.md count, by ID | `BLOCKERS.md` "Active Blockers" table (currently 8 entries as of 2026-07-22 per that file) | Whether a given production claim (e.g. real-hardware YubiKey validation, ARM64 board readiness) can be made yet. A blocker closing is the trigger to promote a claim from "research/design" to "production," per roadmap-promotion-gates. |
| CI lane pass/fail per architecture (amd64, arm64) | GitHub Actions run status for `yubiOS-ci.yml` | Whether a release/publish job should run `merge-manifest` (per PROJECT_RULES.md's Docker Hub publish description) â a red lane blocks publish, it's not just a dashboard color. |
| MITIGATE.md "what we cannot fully prevent" table size/content | `MITIGATE.md` | Whether a new feature proposal needs its own mitigation entry before shipping (MISSION.md: publish gaps honestly) â growth in this table without a corresponding ADR is a signal to slow down, not hide it. |
| ADR count and cadence | `ADR.md` | Whether architecture decisions are actually being recorded at decision time (covenant Â§3 Roadmap control) vs. decided informally â a long gap between real changes and new ADRs is the trigger to audit for undocumented decisions. |
| PINNED.md digest currency (days since last bump per pin) | `PINNED.md` | Whether a stale pin needs a bump PR (per PROJECT_RULES.md's existing "Sauna tracks latest digest and commits bump PRs" workflow) â this already has an owner and action, the metric just makes staleness visible instead of implicit. |

**Not yet measurable:** "community trust" or "adoption" in any quantitative
sense â there's no telemetry (by design, per covenant Â§3) and no public
download-counter mechanism confirmed in this repo as of this draft. Docker Hub
pull counts for `docker.io/0mniteck/yubios` *may* exist as a number Docker Hub
itself reports, but this document does not claim a specific figure since none
was fetched. If pull-count reporting is wanted, that's a small follow-up
(Docker Hub API call), not assumed here.

## 2. Business-health metrics

These require the offer/pricing structure from OMN-71 to mean anything â
they're framed against that catalog, not a business model invented here.

| Metric | Definition | Decision it drives |
|---|---|---|
| Readiness-gate-to-offer ratio | Of the 7 offers in the pricing doc, how many have their stated readiness gate (section 3 of that doc) actually closed | Whether revenue priority (pricing doc Â§4) needs re-ordering â an offer whose gate closes early should move up, not wait for its originally-assigned slot |
| Paid-pilot count and outcome | Number of paid pilots run per offer, and whether each validated or invalidated its pricing hypothesis (pricing doc Â§2/Â§5) | Whether to commit a real price point for that offer or keep iterating â this is the concrete mechanism OMN-71 asked for ("assumptions that need validation in paid pilots") |
| Support/SLA response-time adherence | For O3 (support contracts), whether commitments are actually met | Whether the SLA tier needs re-pricing or the support process needs more capacity before selling more of that tier |
| Grant/pilot funding secured vs. targeted | Against OMN-86's target list (once it lands) | Whether public-security funding (O7) is a real revenue line or should be deprioritized in favor of offers with faster signal |

**Not yet measurable:** any actual revenue figure, customer count, or margin â
no offer in the pricing doc has closed a real sale as of this draft (OMN-71 is
newly drafted, not yet executed against). This section defines what to start
tracking once pilots begin, not a report of current business performance.

## 3. Reporting cadence and owner model

Kept deliberately lightweight, matching the project's actual current scale
(per COMPANY.md: single Founder/Lead Developer, no team yet):

- **Weekly, informal:** BLOCKERS.md and CI lane status â these already change
  fast enough that a weekly glance (or on-demand check before a release
  decision) is the right cadence; a formal weekly report would be overhead
  with no second reader.
- **Per-ADR, event-driven:** ADR count/cadence and MITIGATE.md table growth are
  reviewed at the time a new ADR or mitigation entry is proposed, not on a
  calendar â the decision they inform is inherently event-driven, not
  periodic.
- **Per-pilot, event-driven:** paid-pilot outcomes and SLA adherence are
  reviewed at pilot completion, not on a fixed schedule â there's no pilot
  cadence yet to schedule against.
- **Owner:** all of the above, today, is Jenny (Founder/Lead Developer) â this
  document does not invent a metrics-owner role that doesn't exist. If/when
  the team grows, this section should be revisited rather than assuming a
  reporting hierarchy that has no one to staff it.

## 4. Explicitly out of scope

- Building actual dashboards, alerting, or a metrics pipeline â this document
  defines *what* to track and why, not the instrumentation to collect it. Any
  new collection mechanism (e.g. a Docker Hub pull-count fetch, a CI-status
  aggregator) is separate follow-up work, and should go through
  `observability-and-instrumentation` skill guidance when it's built.
- Any specific target/threshold values (e.g. "ship with fewer than N open
  blockers") â thresholds require judgment this document isn't positioned to
  assert on Jenny's behalf; recording *that* a blocker count matters is
  in scope, picking the number that's "too many" is not.

## Dependencies

- Section 2 depends on **OMN-71** (offer/pricing, PR #108) and, for the
  grant/pilot row, **OMN-86** (public-security funding targets) once it lands.
- Section 1's promotion-gate framing depends on
  [refs/roadmap-promotion-gates-2026-07-17.md](roadmap-promotion-gates-2026-07-17.md).



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
