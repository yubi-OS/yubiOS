#!/usr/bin/env python3

"""Compare two clean ARM64 mkosi builds at the unsigned-subject boundary."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys


REQUIRED_UNSIGNED = {
    "initrd.cpio.zst",
    "root-filesystem.jsonl",
    "yubiOS.manifest",
}
REQUIRED_EXCLUDED = {
    "ci-secure-boot-cert.pem",
    "systemd-bootaa64.efi.signed",
    "yubiOS.efi",
    "yubiOS.esp.raw",
    "yubiOS.raw",
    "yubiOS.root-arm64.raw",
}
SIGNED_ROOT_PATH = "usr/lib/systemd/boot/efi/systemd-bootaa64.efi.signed"
EXPECTED_FILESYSTEM_HEADER = {
    "content_exclusions": [SIGNED_ROOT_PATH],
    "kind": "yubiOS-root-filesystem-manifest",
    "schema": 2,
}
SCOPE = "canonical unsigned root filesystem content, initrd, and package manifest"
SIGNATURE_BOUNDARY = (
    "random SoftHSM certificate, signed root bootloader, UKI, ESP, and full disk wrapper"
)
FILESYSTEM_BOUNDARY = (
    "Btrfs block metadata with random device, chunk-tree, and root UUIDs"
)
SIGNED_EXCLUSION_REASON = (
    "random non-production SoftHSM key and signature-bearing installer envelope"
)
BTRFS_EXCLUSION_REASON = (
    "Btrfs serialization includes per-mkfs UUIDs and root creation time; "
    "canonical filesystem contents are compared instead"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare two isolated yubiOS mkosi installer summaries."
    )
    parser.add_argument("primary", type=Path)
    parser.add_argument("rebuild", type=Path)
    parser.add_argument("report", type=Path)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_metadata(root: Path, label: str, errors: list[str]) -> dict[str, str]:
    path = root / "METADATA.txt"
    if not path.is_file():
        errors.append(f"{label} is missing METADATA.txt")
        return {}
    values: dict[str, str] = {}
    for line_number, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
        if "=" not in line:
            errors.append(f"{label} METADATA.txt:{line_number} is not key=value")
            continue
        key, value = line.split("=", 1)
        if not key or key in values:
            errors.append(f"{label} METADATA.txt has invalid or duplicate key: {key!r}")
            continue
        values[key] = value
    return values


def read_records(
    root: Path, filename: str, label: str, errors: list[str]
) -> dict[str, tuple[str, int]]:
    path = root / filename
    if not path.is_file():
        errors.append(f"{label} is missing {filename}")
        return {}
    records: dict[str, tuple[str, int]] = {}
    for line_number, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
        fields = line.split(" ", 2)
        if len(fields) != 3:
            errors.append(f"{label} {filename}:{line_number} is malformed")
            continue
        digest, size_text, subject = fields
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or not size_text.isdigit():
            errors.append(f"{label} {filename}:{line_number} has invalid digest or size")
            continue
        if not subject or subject.startswith("/") or "/" in subject or subject in records:
            errors.append(f"{label} {filename}:{line_number} has invalid subject {subject!r}")
            continue
        records[subject] = (digest, int(size_text))
    return records


def require_exact_subjects(
    records: dict[str, tuple[str, int]],
    expected: set[str],
    label: str,
    kind: str,
    errors: list[str],
) -> None:
    for subject in sorted(expected - records.keys()):
        errors.append(f"{label} is missing required {kind} subject: {subject}")
    for subject in sorted(records.keys() - expected):
        errors.append(f"{label} has unexpected {kind} subject: {subject}")


def metadata_errors(
    metadata: dict[str, str],
    label: str,
    variant: str,
    source: str,
    epoch: str,
    seed: str,
) -> list[str]:
    expected = {
        "architecture": "arm64",
        "build_variant": variant,
        "yubios_commit": source,
        "source_date_epoch": epoch,
        "mkosi_seed": seed,
        "mkosi_source": "000b5cefe2b130e928fcfe6a649b417d6f78f66d",
        "scope": SCOPE,
        "signature_boundary": SIGNATURE_BOUNDARY,
        "filesystem_boundary": FILESYSTEM_BOUNDARY,
    }
    return [
        f"{label} metadata has {key}={metadata.get(key)!r}, expected {value!r}"
        for key, value in expected.items()
        if metadata.get(key) != value
    ]


def verify_retained_copy(
    root: Path,
    label: str,
    unsigned: dict[str, tuple[str, int]],
    filename: str,
    errors: list[str],
) -> None:
    path = root / filename
    if not path.is_file():
        errors.append(f"{label} is missing the retained {filename}")
        return
    expected = unsigned.get(filename)
    if expected is None:
        return
    observed = (sha256(path), path.stat().st_size)
    if observed != expected:
        errors.append(
            f"{label} retained {filename} does not match its component record"
        )


def filesystem_manifest_records(
    path: Path,
) -> tuple[dict[str, object], dict[str, dict[str, object]]]:
    lines = path.read_text(errors="strict").splitlines()
    if not lines:
        raise ValueError(f"empty filesystem manifest: {path}")
    header = json.loads(lines[0])
    if not isinstance(header, dict):
        raise ValueError(f"filesystem manifest header is not an object: {path}")
    entries: dict[str, dict[str, object]] = {}
    for line_number, line in enumerate(lines[1:], 2):
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"entry is not an object at {path}:{line_number}")
        relative = value.get("path")
        if not isinstance(relative, str) or relative in entries:
            raise ValueError(
                f"invalid or duplicate path at {path}:{line_number}: {relative!r}"
            )
        entries[relative] = value
    return header, entries


def validate_filesystem_manifest(path: Path, label: str, errors: list[str]) -> None:
    try:
        header, entries = filesystem_manifest_records(path)
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        errors.append(f"cannot validate {label} root filesystem manifest: {error}")
        return

    if header != EXPECTED_FILESYSTEM_HEADER:
        errors.append(
            f"{label} root filesystem manifest has header {header!r}, "
            f"expected {EXPECTED_FILESYSTEM_HEADER!r}"
        )
    signed = entries.get(SIGNED_ROOT_PATH)
    if signed is None:
        errors.append(
            f"{label} root filesystem is missing signed path: {SIGNED_ROOT_PATH}"
        )
    elif (
        signed.get("type") != "file"
        or signed.get("content_compared") is not False
        or "sha256" in signed
    ):
        errors.append(
            f"{label} signed root bootloader is not an explicit content exclusion"
        )
    if "var/cache/ldconfig/aux-cache" in entries:
        errors.append(f"{label} root filesystem retains ldconfig's auxiliary cache")


def filesystem_manifest_differences(primary: Path, rebuild: Path) -> list[str]:

    try:
        primary_header, primary_records = filesystem_manifest_records(primary)
        rebuild_header, rebuild_records = filesystem_manifest_records(rebuild)
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        return [f"cannot diagnose root filesystem manifests: {error}"]

    differences: list[str] = []
    if primary_header != rebuild_header:
        differences.append(
            f"root filesystem manifest headers differ: "
            f"primary {primary_header!r}, rebuild {rebuild_header!r}"
        )
    for relative in sorted(primary_records.keys() - rebuild_records.keys()):
        differences.append(f"rebuild root filesystem is missing path: {relative}")
    for relative in sorted(rebuild_records.keys() - primary_records.keys()):
        differences.append(f"primary root filesystem is missing path: {relative}")
    for relative in sorted(primary_records.keys() & rebuild_records.keys()):
        primary_record = primary_records[relative]
        rebuild_record = rebuild_records[relative]
        if primary_record == rebuild_record:
            continue
        for field in sorted(primary_record.keys() | rebuild_record.keys()):
            if primary_record.get(field) != rebuild_record.get(field):
                differences.append(
                    f"root filesystem differs at {relative}: {field} "
                    f"(primary {primary_record.get(field)!r}, "
                    f"rebuild {rebuild_record.get(field)!r})"
                )
                if len(differences) >= 50:
                    differences.append("root filesystem diagnostics truncated after 50 differences")
                    return differences
    return differences


def main() -> int:
    args = parse_args()
    source = os.environ.get("GIT_SHA", "")
    epoch = os.environ.get("SOURCE_DATE_EPOCH", "")
    seed = os.environ.get("YUBIOS_MKOSI_SEED", "")
    if not re.fullmatch(r"[0-9a-f]{40}", source):
        raise SystemExit("GIT_SHA must be a full lowercase Git commit SHA")
    if not epoch.isdigit():
        raise SystemExit("SOURCE_DATE_EPOCH must be an integer")
    if not re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        seed,
    ):
        raise SystemExit("YUBIOS_MKOSI_SEED must be the architecture-scoped UUIDv5")

    errors: list[str] = []
    for label, root in (("primary", args.primary), ("rebuild", args.rebuild)):
        if not root.is_dir():
            errors.append(f"{label} artifact tree does not exist: {root}")

    primary_metadata = read_metadata(args.primary, "primary", errors)
    rebuild_metadata = read_metadata(args.rebuild, "rebuild", errors)
    primary_unsigned = read_records(
        args.primary, "UNSIGNED-COMPONENTS", "primary", errors
    )
    rebuild_unsigned = read_records(
        args.rebuild, "UNSIGNED-COMPONENTS", "rebuild", errors
    )
    primary_excluded = read_records(
        args.primary, "EXCLUDED-COMPONENTS", "primary", errors
    )
    rebuild_excluded = read_records(
        args.rebuild, "EXCLUDED-COMPONENTS", "rebuild", errors
    )

    require_exact_subjects(
        primary_unsigned, REQUIRED_UNSIGNED, "primary", "unsigned", errors
    )
    require_exact_subjects(
        rebuild_unsigned, REQUIRED_UNSIGNED, "rebuild", "unsigned", errors
    )
    require_exact_subjects(
        primary_excluded, REQUIRED_EXCLUDED, "primary", "excluded", errors
    )
    require_exact_subjects(
        rebuild_excluded, REQUIRED_EXCLUDED, "rebuild", "excluded", errors
    )
    errors.extend(
        metadata_errors(
            primary_metadata, "primary", "primary", source, epoch, seed
        )
    )
    errors.extend(
        metadata_errors(
            rebuild_metadata, "rebuild", "rebuild", source, epoch, seed
        )
    )
    for filename in ("root-filesystem.jsonl", "yubiOS.manifest"):
        verify_retained_copy(
            args.primary, "primary", primary_unsigned, filename, errors
        )
        verify_retained_copy(
            args.rebuild, "rebuild", rebuild_unsigned, filename, errors
        )
    validate_filesystem_manifest(
        args.primary / "root-filesystem.jsonl", "primary", errors
    )
    validate_filesystem_manifest(
        args.rebuild / "root-filesystem.jsonl", "rebuild", errors
    )

    compared = []
    for subject in sorted(REQUIRED_UNSIGNED):
        primary_record = primary_unsigned.get(subject)
        rebuild_record = rebuild_unsigned.get(subject)
        matched = primary_record is not None and primary_record == rebuild_record
        compared.append(
            {
                "path": subject,
                "sha256": primary_record[0] if primary_record else None,
                "size": primary_record[1] if primary_record else None,
                "matched": matched,
            }
        )
        if primary_record is not None and rebuild_record is not None and not matched:
            errors.append(
                f"installer subject differs: {subject} "
                f"(primary {primary_record[0]}/{primary_record[1]}, "
                f"rebuild {rebuild_record[0]}/{rebuild_record[1]})"
            )
            if subject == "root-filesystem.jsonl":
                errors.extend(
                    filesystem_manifest_differences(
                        args.primary / subject, args.rebuild / subject
                    )
                )

    excluded = []
    for subject in sorted(REQUIRED_EXCLUDED):
        primary_record = primary_excluded.get(subject)
        rebuild_record = rebuild_excluded.get(subject)
        excluded.append(
            {
                "path": subject,
                "reason": BTRFS_EXCLUSION_REASON
                if subject == "yubiOS.root-arm64.raw"
                else SIGNED_EXCLUSION_REASON,
                "primary_sha256": primary_record[0] if primary_record else None,
                "primary_size": primary_record[1] if primary_record else None,
                "rebuild_sha256": rebuild_record[0] if rebuild_record else None,
                "rebuild_size": rebuild_record[1] if rebuild_record else None,
                "matched": primary_record is not None
                and primary_record == rebuild_record,
            }
        )

    report = {
        "schema": 1,
        "source": source,
        "source_date_epoch": int(epoch),
        "architecture": "arm64",
        "isolated_builds": 2,
        "build_variants": ["primary", "rebuild"],
        "scope": SCOPE,
        "result": "match" if not errors else "mismatch",
        "compared": compared,
        "excluded": excluded,
        "errors": errors,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")

    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    print(
        "PASS: unsigned mkosi installer subjects matched across two clean ARM64 "
        f"builds ({len(compared)} compared components, "
        f"{len(excluded)} signature-envelope components recorded)"
    )
    print(f"Evidence: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
