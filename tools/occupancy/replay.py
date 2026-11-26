"""Rebuild paper 5 measurements from observed Cloudflare responses.

Run python tools/occupancy/replay.py --output /path/to/a/new/directory.
The output directory must be empty to keep distinct experimental runs separate.
"""

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile

import numpy as np

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parents[1]
FIXTURE = REPO / "papers/data/occupancy/cloudflare-bge-m3.zip"
SHA256 = "d41857c1e2bfcf13bf996ca3be3b5b97137ff730e3dfaf0d8f69bf4fb7aaec35"


def read(path):
    return json.loads(path.read_text())


def inputs(fixture, dest, prefix):
    vectors = []
    for name, count in [("vectors.json.gz", 72), ("confirmation-vectors.json.gz", 36)]:
        raw = fixture.read(prefix + name)
        x = np.array(json.loads(gzip.decompress(raw)))
        if x.shape != (count, 1024) or not np.isfinite(x).all():
            raise ValueError(f"Invalid observed vector matrix {name}")
        (dest / name).write_bytes(raw)
        vectors.extend(x)
    for name in ["dataset.jsonl", "confirmation.jsonl"]:
        (dest / name).write_bytes(fixture.read(name))
    return np.array(vectors)


def run_scripts(dest):
    env = dict(os.environ, OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1")
    env.pop("PYTHONOPTIMIZE", None)
    commands = [
        ["node", TOOLS / "map.mjs", REPO],
        [sys.executable, TOOLS / "analyze.py", REPO],
        [sys.executable, TOOLS / "confirmation.py"],
        [sys.executable, TOOLS / "ambient.py"],
        [sys.executable, TOOLS / "check.py"],
        [sys.executable, TOOLS / "spectral.py", REPO],
    ]
    for command in commands:
        subprocess.run(command, cwd=dest, env=env, check=True)


def verify(dest):
    load = lambda name: read(dest / name)
    result = load("results.json")
    ambient = load("ambient-results.json")
    account = load("adapter-check.json")
    spectral = load("spectral-results.json")
    maps = load("maps.json")
    fresh = load("confirmation-results.json")
    assert maps["trial"]["ladder"]["counts"] == [2, 4, 6, 9, 12, 16, 24, 29, 32]
    assert maps["trial"]["focal"]["n_star"] == 4 and maps["ref_is_probe_prefix"]
    assert [
        result["methods"][k]["correct"]
        for k in [
            "native_1nn",
            "native_centroid",
            "station_removed_gibbs",
            "focal_hamming_gibbs",
            "rms_sphere_gibbs",
        ]
    ] == [16, 24, 23, 7, 6]
    assert result["class_replication"]["normalized_max_probability_change"] < 1e-12
    assert result["class_replication"]["unnormalized_predictions_changed"] == 16
    assert [
        fresh["methods"][k]["correct"]
        for k in ["pca_6bit_gibbs", "semantic_6bit_gibbs", "native_centroid_36"]
    ] == [9, 7, 25]
    for cohort, expected in [("first", (3, 7, 21, 22)), ("fresh", (6, 11, 23, 26))]:
        obs = ambient[cohort]
        assert (
            tuple(
                [obs[k]["packed_at_reference_chord"] for k in ["native", "rms"]]
                + [account[cohort][k]["correct"] for k in ["native", "rms"]]
            )
            == expected
        )
    assert ambient["inverse_max_error"] < 1e-12
    assert spectral["pair_counts_by_distance"] == [181, 252, 161, 36, 0]
    assert min(spectral["degree_p_max"]) > 0.25 and spectral["correct"] == 7
    for window in spectral["geometry"]:
        assert 168 < window["pairs"]["null_mean"] < 172
        assert (
            window["gaps"]["central95"][0]
            < window["gaps"]["observed"]
            < window["gaps"]["central95"][1]
        )
    assert np.allclose(
        [x["dBc"] for x in result["held_out_v2"]], [9.29, 9.59], atol=0.05
    )
    b = account["fresh"]["rms"]
    assert b["total_bytes"] == 4856 and np.isclose(sum(b["byte_shares"]), 4856)
    assert np.isclose(
        b["byte_shares"][b["class_order"].index("drift")], 928.88, atol=0.02
    )
    return dict(
        focal_dimension=4,
        ambient=ambient,
        recognition=account,
        spectral=spectral,
        focal_ladder=maps["trial"]["ladder"]["counts"],
        v2=result["held_out_v2"],
        class_replication=result["class_replication"],
        cohort_a_methods={k: v["correct"] for k, v in result["methods"].items()},
        cohort_b_frame_methods={k: v["correct"] for k, v in fresh["methods"].items()},
    )


def compare_report(actual, expected, path="report"):
    """Check exact discrete endpoints and allow normal floating-point variation."""
    if isinstance(expected, dict):
        if actual.keys() != expected.keys():
            raise ValueError(f"{path}: report fields changed")
        for key, value in expected.items():
            compare_report(actual[key], value, f"{path}.{key}")
    elif isinstance(expected, list):
        if len(actual) != len(expected):
            raise ValueError(f"{path}: report length changed")
        for i, value in enumerate(expected):
            compare_report(actual[i], value, f"{path}[{i}]")
    elif isinstance(expected, float):
        if not np.isclose(actual, expected, rtol=1e-7, atol=1e-9):
            raise ValueError(f"{path}: observed {actual}, expected {expected}")
    elif actual != expected:
        raise ValueError(f"{path}: observed {actual}, expected {expected}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, default=FIXTURE)
    parser.add_argument(
        "--check-report",
        type=Path,
        help="compare all reported endpoints with a saved JSON report",
    )
    args = parser.parse_args()
    if not __debug__:
        parser.error("Replay checks require normal Python execution")
    if hashlib.sha256(args.fixture.read_bytes()).hexdigest() != SHA256:
        raise ValueError(
            "Unexpected fixture digest; published replay requires the immutable original"
        )
    args.output.mkdir(parents=True, exist_ok=True)
    if any(args.output.iterdir()):
        parser.error("output directory must be empty")
    xs = []
    reports = []
    with ZipFile(args.fixture) as fixture:
        for name, prefix in [("original", ""), ("repeat", "pooling-replay/")]:
            dest = args.output / name
            dest.mkdir()
            xs.append(inputs(fixture, dest, prefix))
            run_scripts(dest)
            reports.append(verify(dest))
    for name in [
        "predictions.csv",
        "confirmation-predictions.csv",
        "ambient-predictions.json",
    ]:
        if (args.output / "original" / name).read_bytes() != (
            args.output / "repeat" / name
        ).read_bytes():
            raise ValueError(f"Different classifications across caches: {name}")
    exact = int(np.all(xs[0] == xs[1], axis=1).sum())
    assert exact == 96
    repeat_rms = reports[1]["recognition"]["fresh"]["rms"]
    summary = dict(
        model="@cf/baai/bge-m3",
        sha256=SHA256,
        identical_rows=exact,
        observations=108,
        dimension=1024,
        min_matched_cosine=float(
            np.min(
                np.sum(xs[0] * xs[1], axis=1)
                / (np.linalg.norm(xs[0], axis=1) * np.linalg.norm(xs[1], axis=1))
            )
        ),
        repeat_drift_bytes=repeat_rms["byte_shares"][repeat_rms["class_order"].index("drift")],
        **reports[0],
    )
    (args.output / "summary.json").write_text(
        json.dumps(summary, indent=2, allow_nan=False) + "\n"
    )
    if args.check_report:
        compare_report(summary, read(args.check_report))
    print("PASS: both caches independently reproduce the paper endpoints.")


if __name__ == "__main__":
    main()
