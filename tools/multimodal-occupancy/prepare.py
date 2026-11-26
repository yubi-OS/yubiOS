"""Create a label-separated measurement manifest from the two pinned public sources."""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile

import numpy as np
from scipy.io import wavfile
from scipy.signal import stft

UCI_SHA = "0d7b054fea010270e9b3f06411c654c5e59547732ad626381980baffe0a23fb0"
FSDD_REV = "26eb9aaf76e81b692f806f9140c2d2777410d7a1"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def rank(key):
    return digest(("paper5-field-v1:" + key).encode())


def record(modality, split, label, group, source, grid, amount, unit, raw_hash):
    grid = np.asarray(grid, dtype=int).reshape(8, 8)
    if not np.all((0 <= grid) & (grid <= 16)):
        raise ValueError("grid outside measurement scale")
    text = "\n".join(" ".join(map(str, row)) for row in grid)
    return dict(modality=modality, split=split, label=str(label), group=group,
                source=source, source_sha256=raw_hash, text=text,
                input_sha256=digest(text.encode()), amount=int(amount), unit=unit)


def handwriting(path):
    if digest(path.read_bytes()) != UCI_SHA:
        raise ValueError("unexpected UCI archive")
    with ZipFile(path) as archive:
        for split, file in [("reference", "optdigits.tra"), ("test", "optdigits.tes")]:
            by_class = {str(i): [] for i in range(10)}
            for idx, raw in enumerate(archive.read(file).splitlines(), 1):
                row = next(csv.reader([raw.decode()]))
                key = f"{file}:{idx}"
                by_class[row[-1]].append((rank(key), key, row[:-1], digest(raw)))
            for label, rows in by_class.items():
                for _, key, pixels, sha in sorted(rows)[:12]:
                    grid = np.asarray(pixels, dtype=int)
                    yield record("handwriting", split, label, split, key, grid,
                                 grid.sum(), "ink_pixels", sha)


def acoustic_grid(path):
    sr, signal = wavfile.read(path)
    if sr != 8000 or signal.ndim != 1:
        raise ValueError(f"unexpected PCM format in {path}")
    # 32 ms Hann windows and 16 ms hop. Average power in eight linear
    # frequency bands and eight equal time intervals, then quantize 60 dB.
    _, _, z = stft(signal.astype(float), fs=sr, nperseg=256, noverlap=128,
                   boundary=None, padded=False)
    power = abs(z[:-1]) ** 2
    bands = power.reshape(8, 16, -1).mean(axis=1)
    if bands.shape[1] < 8:
        bands = np.pad(bands, ((0, 0), (0, 8-bands.shape[1])), mode="edge")
    bins = np.stack([a.mean(axis=1) for a in np.array_split(bands, 8, axis=1)], axis=1)
    db = 10 * np.log10(np.maximum(bins / max(bins.max(), 1e-30), 1e-6))
    return np.rint((db + 60) * 16 / 60), len(signal)


def speech(root):
    rev = subprocess.check_output(["git", "-C", root, "rev-parse", "HEAD"], text=True).strip()
    if rev != FSDD_REV or subprocess.check_output(
        ["git", "-C", root, "status", "--porcelain", "--", "recordings"]
    ):
        raise ValueError("expected unmodified recordings at the pinned FSDD revision")
    paths = sorted((root / "recordings").glob("*.wav"))
    people = sorted({p.stem.split("_")[1] for p in paths})
    if len(people) != 6:
        raise ValueError("expected six speakers")
    for i, speaker in enumerate(people):
        split, n = ("reference", 3) if i < 4 else ("test", 6)
        for label in range(10):
            pool = [p for p in paths if p.name.startswith(f"{label}_{speaker}_")]
            for p in sorted(pool, key=lambda p: rank(p.name))[:n]:
                grid, amount = acoustic_grid(p)
                yield record("speech", split, label, speaker, p.name, grid, amount,
                             "audio_samples", digest(p.read_bytes()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ["uci_zip", "fsdd_checkout", "output"]:
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    rows = list(handwriting(args.uci_zip)) + list(speech(args.fsdd_checkout))
    # Greedy packing is order-dependent. Freeze an order independent of labels.
    rows.sort(key=lambda r: (r["modality"], r["split"], rank(r["source"])))
    if len(rows) != 480 or len({r["input_sha256"] for r in rows}) != 480:
        raise ValueError("unexpected size or duplicate payload")
    args.output.write_text("".join(json.dumps(r, separators=(",", ":")) + "\n" for r in rows))


if __name__ == "__main__":
    main()
