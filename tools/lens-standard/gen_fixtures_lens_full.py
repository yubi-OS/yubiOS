#!/usr/bin/env python3
# gen_fixtures_lens_full.py — Lane H: emit the FULL cross-language parity
# fixture pack for lens-standard-v1.
#
# Imports the Python source of record (lens_standard.py) BY PATH and runs the
# powered-lens loop (correct_loop) for every (mode, registry magnitude) pair
# in ABERRATIONS on both gold renders (gasket + tri). For each case it records:
#   {id, render, mode, coef, sha_ref, sha_aberrated, sha_corrected,
#    coefficients_est (float for the mode), estimation_error,
#    d_ref, d_aberrated, d_corrected, recovered, monotone, roundtrip_recovery}
# plus the render-level anchors (ink counts) the JS port's own gold-render
# port needs, and the pinned parameter block.
#
# Usage: python3 gen_fixtures_lens_full.py [out.json]
# Default out: fixtures_lens_full.json next to this script.

import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
LENS_PATH = os.path.join(HERE, "lens_standard.py")
if not os.path.isfile(LENS_PATH):
    LENS_PATH = "/var/workspace/session/pr-stage/tools/lens-standard/lens_standard.py"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


L = _load(LENS_PATH, "lens_standard_lane_h")

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "fixtures_lens_full.json")

fixtures = []
t0 = time.time()
for rname in ("gasket", "tri"):
    ref = L.gold_render(rname)
    ink = sum(1 for row in ref for v in row if v)
    for mode, coef in L.ABERRATIONS:
        res = L.correct_loop(ref, mode, coef, render=rname)
        fx = {
            "id": "%s-%s-%g" % (rname, mode, coef),
            "render": rname,
            "mode": mode,
            "coef": coef,
            "sha_ref": res["sha_ref"],
            "sha_aberrated": res["sha_aberrated"],
            "sha_corrected": res["sha_corrected"],
            "coefficients_est": res["coefficients_est"][mode],
            "estimation_error": res["estimation_errors"][mode],
            "d_ref": res["d_ref"],
            "d_aberrated": res["d_aberrated"],
            "d_corrected": res["d_corrected"],
            "recovered": res["recovered"],
            "monotone": res["monotone"],
            "roundtrip_recovery": res["roundtrip_recovery"],
        }
        fixtures.append(fx)
        print("%-22s est=%+.9f err=%+.3e d_ref=%.9f d_ab=%.9f d_corr=%.9f %s"
              % (fx["id"], fx["coefficients_est"], fx["estimation_error"],
                 fx["d_ref"], fx["d_aberrated"], fx["d_corrected"],
                 "OK" if fx["recovered"] and fx["monotone"] else "GATE-FAIL"))

pack = {
    "meta": {
        "pipeline": L.PIPELINE,
        "source_of_record": "lens_standard.py (Lane F, Python)",
        "generated_by": "gen_fixtures_lens_full.py (Lane H, full parity pack)",
        "purpose": "full cross-language parity anchor for the powered lens "
                   "(measure->correct): every (mode, magnitude) x gold render "
                   "must reproduce mask shas exactly, estimates to 1e-9 and D "
                   "readings to 1e-9 in any port.",
        "mask_serialization": "newline-joined '1'/'0' rows (edge-standard "
                              "selftest convention); sha256 of utf-8 bytes",
        "pinned": {
            "size": L.SIZE, "center": L.CENTER,
            "gasket": {"L": L.GASKET_L, "r": L.GASKET_R, "depths": L.GASKET_DEPTHS},
            "tri": {"rows": list(L.TRI_ROWS), "a": L.TRI_A, "dy": L.TRI_DY, "r": L.TRI_R},
            "r_max": L.R_MAX, "astig_kappa": L.ASTIG_KAPPA,
            "max_astig": L.MAX_ASTIG, "max_spherical": L.MAX_SPHERICAL,
            "max_trefoil": L.MAX_TREFOIL,
            "trefoil_zoom_k": L.TREFOIL_ZOOM_K,
            "trefoil_inverse_steps": L.TREFOIL_INVERSE_STEPS,
            "aberrations": [list(a) for a in L.ABERRATIONS],
            "est_tol": L.EST_TOL, "d_band": L.D_BAND,
            "est_newton_steps": L.EST_NEWTON_STEPS,
            "est_corrector_steps": L.EST_CORRECTOR_STEPS,
            "spherical_inverse_steps": L.SPHERICAL_INVERSE_STEPS,
            "rounding_rule": "nint(v) = floor(v + 0.5); out-of-canvas "
                             "destinations dropped; row-major source order",
        },
        "render_ink": {
            "gasket": sum(1 for row in L.gold_render("gasket") for v in row if v),
            "tri": sum(1 for row in L.gold_render("tri") for v in row if v),
        },
        "fixture_count": len(fixtures),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    },
    "fixtures": fixtures,
}

with open(OUT, "w") as fh:
    json.dump(pack, fh, sort_keys=True, indent=2)
    fh.write("\n")
print("wrote %s: %d fixtures in %.1fs" % (OUT, len(fixtures), time.time() - t0))
