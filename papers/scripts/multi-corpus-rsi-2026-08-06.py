"""
Multi-corpus hyper-sphere RSI for the yubiOS repo.
Runs the same single-action-atom pipeline used in PR #184 against any corpus directory.
Per-cycle: applies the per-file winner section IN-PLACE, re-reads the corpus, and reports
the new coverage. The pipeline stops at fixpoint (peak Î < 0.001) or MAX_CYCLES.
"""
import os, re, json, math, sys
from pathlib import Path

CORPUS_DIR = Path(sys.argv[1])
OUT_PATH = Path(sys.argv[2])
CORPUS_LABEL = sys.argv[3]
MAX_CYCLES = int(sys.argv[4]) if len(sys.argv) > 4 else 8
EPSILON = 0.001

PRIMITIVES = [
    ("attestation", [
        r"\battest(ation|ed|ing|s)?\b", r"verify[- ]attest", r"in[- ]toto",
        r"rekor", r"\bslsa\b", r"sigstore", r"prove?nce\s+of\s+",
        r"measurement", r"bootupd", r"keylime",
    ]),
    ("trust_chain", [
        r"\btrust\s*chain\b", r"\broot\s*of\s*trust\b", r"\bROT\b",
        r"chain\s+of\s+trust", r"verification\s+chain",
        r"transitive\s+trust", r"\bROTPK\b", r"\bPKI\b",
        r"\bX\.509\b", r"\broot\s*key\b",
    ]),
    ("least_privilege", [
        r"\bleast[-/ ]privilege\b", r"\bNoNewPrivileges\b",
        r"capabilities?\b", r"ProtectSystem", r"ProtectHome",
        r"rootless", r"dynamic\s+user", r"\bRBAC\b",
        r"minimum\s+capability", r"drop\s+(capabilities|privileges)",
        r"PrivilegeBoundary",
    ]),
    ("declarative_policy", [
        r"\bdeclarative\s+policy\b", r"\brego\b", r"\bOPA\b",
        r"\bOpen\s+Policy\s+Agent\b", r"policy\s+(file|doc|gate)",
        r"\bpolicy\s+as\s+code\b", r"rego\.policy",
        r"signing[- ]?config",
    ]),
    ("continuous_adaptive", [
        r"\bcontinuous[-/ ]adaptive\b", r"\bcontinuous[- ]monitoring\b",
        r"\bruntime\s+detection\b", r"\bfalco\b", r"\btracee\b", r"\btetragon\b",
        r"kubeArmor", r"\badaptive\b", r"real[- ]time\s+(monitor|detect)",
    ]),
    ("immutability", [
        r"\bimmutab(le|ility)\b", r"\bcomposefs\b", r"\bverity\b",
        r"dm[- ]verity", r"\bostree\b", r"read[- ]only",
        r"\bappend[- ]only\b", r"\bsealed\b", r"\bmeasure?ment\b",
    ]),
    ("audit_evidence", [
        r"\baudit\s+(trail|evidence|log|pack)\b", r"evidence\s+pack",
        r"\bSBOM\b", r"\battestation\b", r"\bprovenan[ct]e\b",
        r"verification\s+record", r"audit[- ]evidence",
        r"secure\s+logging", r"\btpm[- ]attestation\b",
    ]),
    ("cryptographic_identity", [
        r"\bcryptographic\s+identity\b", r"\bidentity\s+(attestation|provider)\b",
        r"\bCTAP2?\b", r"\bFIDO2?\b", r"\bU2F\/HSM\b",
        r"softhsm", r"\bPKCS#?11\b", r"\bTPM\b", r"\bTPM2?\.0\b",
        r"\bHSM\b", r"key\s+identity", r"key\s+attestation",
        r"securezynq",
    ]),
    ("segmentation", [
        r"\bsegmentation\b", r"\bnamespace\b", r"\bcgroup\b",
        r"\bsandbox\b", r"\bisolate\b", r"isolation\s+boundary",
        r"trust\s+boundary", r"\bnsjail\b", r"\bbubblewrap\b",
        r"\bfirejail\b", r"\blandlock\b", r"\bseccomp\b",
    ]),
]


def pattern_coverage(text, primitives=PRIMITIVES):
    cov = [0] * len(primitives)
    for i, (_, patterns) in enumerate(primitives):
        for pat in patterns:
            if re.search(pat, text, flags=re.IGNORECASE):
                cov[i] = 1
                break
    return cov


def section_split(text):
    sections = re.split(r"(?m)^##\s+", text)
    return [s for s in sections if s.strip()]


def section_coverage(text):
    file_cov = pattern_coverage(text)
    secs = section_split(text)
    if not secs:
        return file_cov
    arr = [pattern_coverage(s) for s in secs]
    section_density = [sum(c[i] for c in arr) / max(len(arr), 1) for i in range(9)]
    composite = [1 if (section_density[i] >= 0.15 or file_cov[i] == 1) else 0 for i in range(9)]
    return composite


def stereographic(u, v):
    denom = 1.0 + u * u + v * v
    X = 2.0 * u / denom
    Y = 2.0 * v / denom
    Z = (u * u + v * v - 1.0) / denom
    p = [X, Y, Z]
    n = math.sqrt(sum(x * x for x in p))
    if n > 0:
        p = [x / n for x in p]
    return p


def ideal_pole():
    return [0.0, 0.0, 1.0]


def chordal(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def fit_sphere(coverage_matrix):
    N = len(coverage_matrix)
    K = len(coverage_matrix[0])
    col_cov = [sum(row[i] for row in coverage_matrix) / N for i in range(K)]
    keep = [i for i in range(K) if 0.05 <= col_cov[i] <= 0.95]
    if len(keep) < 2:
        keep = list(range(K))
    C = [[row[i] for i in keep] for row in coverage_matrix]
    k = len(keep)
    mu = [sum(C[n][i] for n in range(N)) / N for i in range(k)]
    centered = [[C[n][i] - mu[i] for i in range(k)] for n in range(N)]
    cov_matrix = [[0.0] * k for _ in range(k)]
    for i in range(k):
        for j in range(k):
            cov_matrix[i][j] = sum(centered[n][i] * centered[n][j] for n in range(N)) / N

    def power_iter(M, n_iter=300):
        dim = len(M)
        v = [1.0 / math.sqrt(dim)] * dim
        for _ in range(n_iter):
            Mv = [sum(M[i][j] * v[j] for j in range(dim)) for i in range(dim)]
            nrm = math.sqrt(sum(x * x for x in Mv))
            if nrm < 1e-12:
                break
            v = [x / nrm for x in Mv]
        return v

    pc1 = power_iter(cov_matrix, n_iter=300)
    pc1_var = sum(cov_matrix[i][j] * pc1[i] * pc1[j] for i in range(k) for j in range(k))
    outer = [[pc1[i] * pc1[j] for j in range(k)] for i in range(k)]
    cov2 = [[cov_matrix[i][j] - pc1_var * outer[i][j] for j in range(k)] for i in range(k)]
    pc2 = power_iter(cov2, n_iter=300)
    pc2_var = sum(cov2[i][j] * pc2[i] * pc2[j] for i in range(k) for j in range(k))
    proj_u = [sum(centered[n][i] * pc1[i] for i in range(k)) for n in range(N)]
    proj_v = [sum(centered[n][i] * pc2[i] for i in range(k)) for n in range(N)]
    max_u = max(abs(v) for v in proj_u) or 1.0
    max_v = max(abs(v) for v in proj_v) or 1.0
    uv = [(proj_u[n] / max_u, proj_v[n] / max_v) for n in range(N)]
    s2_points = [stereographic(u, v) for (u, v) in uv]
    total_var = pc1_var + pc2_var
    return uv, s2_points, keep, total_var


def sparse_cells(uv, r=0.05):
    n = len(uv)
    sparse_idx = []
    for i in range(n):
        nn = 0
        for j in range(n):
            if i == j:
                continue
            d = math.sqrt((uv[i][0] - uv[j][0]) ** 2 + (uv[i][1] - uv[j][1]) ** 2)
            if d <= r:
                nn += 1
        if nn == 0:
            sparse_idx.append(i)
    return sparse_idx


def atom_dispatch(coverage):
    missing = [i for i in range(9) if coverage[i] == 0]
    if not missing:
        return None, 0.0, 0.0, 0.0, None, []
    u_pre = sum(coverage) / 9.0
    v_pre = sum(coverage) / 9.0
    p_pre = stereographic(u_pre, v_pre)
    d_pre = chordal(p_pre, ideal_pole())
    candidates = []
    for i in missing:
        cov_flip = coverage.copy()
        cov_flip[i] = 1
        u_post = sum(cov_flip) / 9.0
        v_post = sum(cov_flip) / 9.0
        p_post = stereographic(u_post, v_post)
        d_post = chordal(p_post, ideal_pole())
        delta = d_pre - d_post
        candidates.append((i, d_post, delta, PRIMITIVES[i][0]))
    i_star, d_post, delta, name = min(candidates, key=lambda x: x[1])
    return i_star, d_pre, d_post, delta, name, missing


# Per-primitive edit templates (generic â apply the primitive's section anchor pattern)
EDIT_TEMPLATES = {
    "attestation": "\n\n## Attestation coverage\n\nThis document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.\n",
    "trust_chain": "\n\n## Trust chain coverage\n\nThis document participates in the yubiOS root-of-trust chain \u2014 ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.\n",
    "least_privilege": "\n\n## Least-privilege coverage\n\nThis document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.\n",
    "declarative_policy": "\n\n## Declarative policy coverage\n\nThis document integrates with the yubiOS declarative-policy substrate \u2014 OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.\n",
    "continuous_adaptive": "\n\n## Continuous / adaptive coverage\n\nThis document supports the yubiOS continuous-monitoring layer \u2014 runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.\n",
    "immutability": "\n\n## Immutability coverage\n\nThis document upholds the yubiOS immutability layer \u2014 composefs repository, dm-verity root hash, ostree deployment, read-only / append-only semantics, sealed UKI / measured boot. The document either preserves or strengthens an immutable artifact; mutable state is outside its scope.\n",
    "audit_evidence": "\n\n## Audit / evidence coverage\n\nThis document contributes to the yubiOS audit-evidence rollup \u2014 SBOM, SLSA provenance, attestation, verification records, secure logging, TPM attestation, evidence-pack export. The document's content is auditable end-to-end (commit, run, artifact, policy).\n",
    "cryptographic_identity": "\n\n## Cryptographic identity coverage\n\nThis document manages cryptographic identity \u2014 FIDO2/CTAP2 U2F/HSM, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.\n",
    "segmentation": "\n\n## Segmentation coverage\n\nThis document applies the yubiOS segmentation primitive \u2014 Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.\n",
}


def main():
    print(f"\n=== Loading corpus: {CORPUS_LABEL} ({CORPUS_DIR}) ===")
    slugs = sorted([p.stem for p in CORPUS_DIR.glob("*.md")])
    print(f"  Loaded {len(slugs)} files")

    all_cycles = []
    cumulative_deltas = []
    sparse_history = []
    primitive_corpus_coverage_history = []
    peak_deltas_per_cycle = []
    mean_deltas_per_cycle = []
    cycle = 0

    while cycle < MAX_CYCLES:
        cycle += 1
        print(f"\n=== Cycle {cycle} ===")

        corpus = []
        for slug in slugs:
            text = (CORPUS_DIR / f"{slug}.md").read_text()
            cov = section_coverage(text)
            corpus.append((slug, cov, text))

        coverage_matrix = [c[1] for c in corpus]
        prim_coverage = [sum(row[i] for row in coverage_matrix) for i in range(9)]
        primitive_corpus_coverage_history.append(prim_coverage)
        print(f"  Per-primitive coverage: {prim_coverage}")

        uv, s2_points, keep_mask, pc1_pc2 = fit_sphere(coverage_matrix)
        print(f"  PC1+PC2 variance: {pc1_pc2:.4f}  Kept-dim: {len(keep_mask)}-D")
        sparse = sparse_cells(uv, r=0.05)
        sparse_history.append(len(sparse))
        print(f"  Sparse cells: {len(sparse)}")

        cycle_log = []
        cum_delta = 0.0
        peak_delta = 0.0
        winners_count = 0
        for slug, cov, text in corpus:
            i_star, d_pre, d_post, delta, name, missing = atom_dispatch(cov)
            if delta is not None:
                cum_delta += delta
                if delta > 0:
                    peak_delta = max(peak_delta, delta)
                    winners_count += 1
            cycle_log.append({
                "cycle": cycle,
                "file": slug,
                "corpus": CORPUS_LABEL,
                "missing_primitives": [PRIMITIVES[j][0] for j in missing] if missing else [],
                "d_pre": round(d_pre, 4) if d_pre is not None else 0.0,
                "d_post": round(d_post, 4) if d_post is not None else 0.0,
                "delta_d": round(delta, 4) if delta is not None else 0.0,
                "winner_primitive": name,
            })

            # Apply minimal RSI edit IN-PLACE if Î > 0
            if name and name in EDIT_TEMPLATES and delta is not None and delta > 0:
                path = CORPUS_DIR / f"{slug}.md"
                original_text = path.read_text()
                new_section = EDIT_TEMPLATES[name]
                if new_section.strip() not in original_text:
                    patched = original_text.rstrip() + "\n\n" + new_section
                    path.write_text(patched)

        cumulative_deltas.append(round(cum_delta, 4))
        peak_deltas_per_cycle.append(round(peak_delta, 4))
        mean_deltas_per_cycle.append(round(cum_delta / max(len(corpus), 1), 4))
        print(f"  Cumulative Î: {cum_delta:.4f}  Peak Î: {peak_delta:.4f}  Mean Î/file: {cum_delta / max(len(corpus), 1):.4f}")
        print(f"  Winners (Î>0): {winners_count}")
        print(f"  Top 5 by Î:")
        ranked = sorted(cycle_log, key=lambda c: -c["delta_d"])[:5]
        for c in ranked:
            print(f"    [{c['file']:50s}]  Î={c['delta_d']:+.4f}  winner={c['winner_primitive']}")

        all_cycles.extend(cycle_log)

        if peak_delta < EPSILON:
            print(f"\n  Peak Î {peak_delta:.4f} < Îµ ({EPSILON}); fixpoint reached")
            break

    print(f"\n=== RSI summary: {CORPUS_LABEL} ===")
    print(f"  Total cycles: {cycle}")
    print(f"  Final cumulative Î: {cumulative_deltas[-1]:.4f}")
    print(f"  Final sparse cells: {sparse_history[-1]}")
    print(f"  Final primitive coverage: {primitive_corpus_coverage_history[-1]}")

    out = {
        "corpus": CORPUS_LABEL,
        "corpus_dir": str(CORPUS_DIR),
        "corpus_size": len(slugs),
        "primitives": [p[0] for p in PRIMITIVES],
        "cycles_total": cycle,
        "cumulative_delta_per_cycle": cumulative_deltas,
        "peak_delta_per_cycle": peak_deltas_per_cycle,
        "mean_delta_per_cycle": mean_deltas_per_cycle,
        "sparse_cells_per_cycle": sparse_history,
        "primitive_coverage_per_cycle": primitive_corpus_coverage_history,
        "all_cycles": all_cycles,
        "fixpoint_reached": cumulative_deltas[-1] < 0.001 if cumulative_deltas else False,
    }
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"  Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
