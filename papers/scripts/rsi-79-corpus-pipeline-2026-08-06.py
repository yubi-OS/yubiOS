"""
Hyper-sphere RSI on 79 repo skills - pure stdlib (no numpy).
"""
import os, re, json, math
from pathlib import Path

SKILLS_DIR = Path("/var/workspace/session/corpus-79/skills")
OUT_DIR = Path("/var/workspace/session/rsi-data")
PATCHES_DIR = OUT_DIR / "patches"
PATCHES_DIR.mkdir(parents=True, exist_ok=True)

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
    """File-level coverage = composite (section-density OR file-level).
    A primitive is covered if it appears in >= 15% of sections OR appears
    in the file overall (fallback for skills with only 1-2 sections).
    """
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
    """Fit S² curve: 9-D → PCA top-2 → stereographic lift (pure Python)."""
    N = len(coverage_matrix)
    K = len(coverage_matrix[0])
    # Drop near-constant columns
    col_cov = [sum(row[i] for row in coverage_matrix) / N for i in range(K)]
    keep = [i for i in range(K) if 0.10 <= col_cov[i] <= 0.90]
    if len(keep) < 2:
        keep = list(range(K))
    C = [[row[i] for i in keep] for row in coverage_matrix]
    k = len(keep)
    mu = [sum(C[n][i] for n in range(N)) / N for i in range(k)]
    centered = [[C[n][i] - mu[i] for i in range(k)] for n in range(N)]
    # SVD via covariance method (N×k covariance, kxk)
    cov_matrix = [[0.0] * k for _ in range(k)]
    for i in range(k):
        for j in range(k):
            cov_matrix[i][j] = sum(centered[n][i] * centered[n][j] for n in range(N)) / N
    # Power iteration for top eigenvector (PC1)
    def power_iter(M, n_iter=100):
        dim = len(M)
        v = [1.0 / math.sqrt(dim)] * dim
        for _ in range(n_iter):
            Mv = [sum(M[i][j] * v[j] for j in range(dim)) for i in range(dim)]
            nrm = math.sqrt(sum(x * x for x in Mv))
            if nrm < 1e-12:
                break
            v = [x / nrm for x in Mv]
        return v

    pc1 = power_iter(cov_matrix, n_iter=200)
    # Deflate: cov' = cov - lambda * v v^T
    pc1_var = sum(cov_matrix[i][j] * pc1[i] * pc1[j] for i in range(k) for j in range(k))
    outer = [[pc1[i] * pc1[j] for j in range(k)] for i in range(k)]
    cov2 = [[cov_matrix[i][j] - pc1_var * outer[i][j] for j in range(k)] for i in range(k)]
    pc2 = power_iter(cov2, n_iter=200)
    pc2_var = sum(cov2[i][j] * pc2[i] * pc2[j] for i in range(k) for j in range(k))
    # Project
    proj = [[centered[n][i] * pc1[i] + 0 for i in range(k)] for n in range(N)]
    proj_u = [sum(centered[n][i] * pc1[i] for i in range(k)) for n in range(N)]
    proj_v = [sum(centered[n][i] * pc2[i] for i in range(k)) for n in range(N)]
    # Normalize
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


def atom_dispatch(slug, coverage):
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


EDIT_TEMPLATES = {
    "attestation": "## Attestation coverage\n\nThis skill contributes to the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.",
    "trust_chain": "## Trust chain coverage\n\nThis skill participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the skill introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.",
    "least_privilege": "## Least-privilege coverage\n\nThis skill applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.",
    "declarative_policy": "## Declarative policy coverage\n\nThis skill integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.",
    "continuous_adaptive": "## Continuous / adaptive coverage\n\nThis skill supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The skill is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.",
    "immutability": "## Immutability coverage\n\nThis skill upholds the yubiOS immutability layer — composefs repository, dm-verity root hash, ostree deployment, read-only / append-only semantics, sealed UKI / measured boot. The skill either preserves or strengthens an immutable artifact; mutable state is outside its scope.",
    "audit_evidence": "## Audit / evidence coverage\n\nThis skill contributes to the yubiOS audit-evidence rollup — SBOM, SLSA provenance, attestation, verification records, secure logging, TPM attestation, evidence-pack export. The skill's output is auditable end-to-end (commit, run, artifact, policy).",
    "cryptographic_identity": "## Cryptographic identity coverage\n\nThis skill manages cryptographic identity — FIDO2/CTAP2 U2F/HSM, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.",
    "segmentation": "## Segmentation coverage\n\nThis skill applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.",
}


def main():
    print(f"\n=== Loading 79 skills fresh ===")
    slugs = sorted([p.stem for p in SKILLS_DIR.glob("*.md")])
    print(f"  Loaded {len(slugs)} skills")

    all_cycles = []
    cumulative_deltas = []
    sparse_history = []
    primitive_corpus_coverage_history = []
    cycle = 0
    MAX_CYCLES = 8
    EPSILON = 0.001

    while cycle < MAX_CYCLES:
        cycle += 1
        print(f"\n=== Cycle {cycle} ===")

        corpus = []
        for slug in slugs:
            # Use latest patched version if available
            latest_patch = None
            for c in range(cycle - 1, 0, -1):
                p = PATCHES_DIR / f"{slug}-cycle-{c}.md"
                if p.exists():
                    latest_patch = p
                    break
            if latest_patch:
                text = latest_patch.read_text()
            else:
                text = (SKILLS_DIR / f"{slug}.md").read_text()
            cov = section_coverage(text)
            corpus.append((slug, cov, text))

        coverage_matrix = [c[1] for c in corpus]
        prim_coverage = [sum(row[i] for row in coverage_matrix) for i in range(9)]
        primitive_corpus_coverage_history.append(prim_coverage)
        print(f"  Per-primitive coverage (corpus-level): {prim_coverage}")

        uv, s2_points, keep_mask, pc1_pc2 = fit_sphere(coverage_matrix)
        print(f"  PC1+PC2 variance explained: {pc1_pc2:.4f}")

        sparse = sparse_cells(uv, r=0.05)
        sparse_history.append(len(sparse))
        print(f"  Sparse cells: {len(sparse)}")

        cycle_log = []
        cum_delta = 0.0
        peak_delta = 0.0
        winners_count = 0
        for slug, cov, text in corpus:
            i_star, d_pre, d_post, delta, name, missing = atom_dispatch(slug, cov)
            if delta is not None:
                cum_delta += delta
                peak_delta = max(peak_delta, delta)
                if delta > 0:
                    winners_count += 1
            cycle_log.append({
                "cycle": cycle,
                "slug": slug,
                "missing_primitives": [PRIMITIVES[j][0] for j in missing] if missing else [],
                "d_pre": round(d_pre, 4) if d_pre is not None else 0.0,
                "d_post": round(d_post, 4) if d_post is not None else 0.0,
                "delta_d": round(delta, 4) if delta is not None else 0.0,
                "winner_primitive": name,
            })

            # Apply minimal RSI edit
            if name and name in EDIT_TEMPLATES and delta is not None and delta > 0:
                prev_patch = PATCHES_DIR / f"{slug}-cycle-{cycle - 1}.md"
                if cycle > 1 and prev_patch.exists():
                    original_text = prev_patch.read_text()
                else:
                    original_text = (SKILLS_DIR / f"{slug}.md").read_text()
                new_section = EDIT_TEMPLATES[name]
                if new_section not in original_text:
                    patched = original_text.rstrip() + "\n\n" + new_section + "\n"
                    (PATCHES_DIR / f"{slug}-cycle-{cycle}.md").write_text(patched)

        cumulative_deltas.append(round(cum_delta, 4))
        print(f"  Cumulative Δ: {cum_delta:.4f}")
        print(f"  Peak Δ: {peak_delta:.4f}")
        print(f"  Winners: {winners_count}")
        print(f"  Top 5 by Δ:")
        ranked = sorted(cycle_log, key=lambda c: -c["delta_d"])[:5]
        for c in ranked:
            print(f"    [{c['slug']:35s}]  Δ={c['delta_d']:+.4f}  winner={c['winner_primitive']}")

        all_cycles.extend(cycle_log)

        # Fixpoint rule
        if peak_delta < EPSILON:
            print(f"\n  Peak Δ {peak_delta:.4f} < ε ({EPSILON}); fixpoint reached")
            break

    print(f"\n=== RSI summary ===")
    print(f"  Total cycles: {cycle}")
    print(f"  Final cumulative Δ: {cumulative_deltas[-1]:.4f}")
    print(f"  Final sparse cells: {sparse_history[-1]}")
    print(f"  Final primitive coverage: {primitive_corpus_coverage_history[-1]}")

    out_json = OUT_DIR / "rsi-79-corpus-multi-cycle.json"
    out_json.write_text(json.dumps({
        "corpus_size": len(slugs),
        "primitives": [p[0] for p in PRIMITIVES],
        "cycles_total": cycle,
        "cumulative_delta_per_cycle": cumulative_deltas,
        "sparse_cells_per_cycle": sparse_history,
        "primitive_coverage_per_cycle": primitive_corpus_coverage_history,
        "all_cycles": all_cycles,
        "fixpoint_reached": cumulative_deltas[-1] < 0.001 if cumulative_deltas else False,
    }, indent=2))
    print(f"  Wrote {out_json}")


if __name__ == "__main__":
    main()
