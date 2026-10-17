#!/usr/bin/env bash

# Shared reproducible-build environment for GitHub Actions and the Ubuntu local
# CI-parity entrypoint. SOURCE_DATE_EPOCH is always the selected source commit's
# author-independent committer timestamp; callers may supply the same value but
# cannot silently choose a different epoch for the same revision.

# Consumed by scripts that source this library.
# shellcheck disable=SC2034
readonly YUBIOS_BUILDKIT_IMAGE='docker.io/moby/buildkit:v0.34.0@sha256:b059f8d7226d0b326bc871af489a5dddf65e36af4d20d14251b072974d9ee87c'

reproducible_build_error() {
    printf 'reproducible-build: %s\n' "$*" >&2
    return 1
}

reproducible_git() {
    local repository=${1:-}
    local canonical_repository

    if (($# < 2)); then
        reproducible_build_error 'repository and Git arguments are required'
        return 2
    fi
    shift
    canonical_repository=$(cd -- "$repository" && pwd -P) || {
        reproducible_build_error "repository directory does not exist: ${repository}"
        return 1
    }

    # Actions and the local DHI runner mount a checkout owned by the host into
    # a rootful container. Trust only the canonical repository supplied by the
    # caller, and only for this Git invocation.
    command git -c "safe.directory=${canonical_repository}" \
        -C "$canonical_repository" "$@"
}

configure_reproducible_build() {
    local repository=${1:-.}
    local revision=${2:-HEAD}
    local architecture=${3:-${ARCH:-$(uname -m)}}
    local canonical_epoch canonical_repository requested_epoch seed_hex timestamp

    canonical_repository=$(cd -- "$repository" && pwd -P) || {
        reproducible_build_error "repository directory does not exist: ${repository}"
        return 1
    }
    repository=$canonical_repository
    canonical_epoch=$(reproducible_git "$repository" \
        show -s --format=%ct "${revision}^{commit}") || {
        reproducible_build_error "cannot resolve commit timestamp for ${revision}"
        return 1
    }
    case "$canonical_epoch" in
        ''|*[!0-9]*)
            reproducible_build_error "commit ${revision} has an invalid timestamp: ${canonical_epoch}"
            return 1
            ;;
    esac

    requested_epoch=${SOURCE_DATE_EPOCH:-}
    if [[ -n "$requested_epoch" && "$requested_epoch" != "$canonical_epoch" ]]; then
        reproducible_build_error \
            "SOURCE_DATE_EPOCH=${requested_epoch} does not match ${revision} (${canonical_epoch})"
        return 1
    fi

    GIT_SHA=$(reproducible_git "$repository" \
        rev-parse "${revision}^{commit}") || return 1
    SOURCE_DATE_EPOCH=$canonical_epoch
    SOURCE_DATE_ISO8601=$(date -u --date="@${SOURCE_DATE_EPOCH}" '+%Y-%m-%dT%H:%M:%SZ')
    timestamp=$(date -u --date="@${SOURCE_DATE_EPOCH}" '+%Y-%m-%d %H:%M:%S UTC')

    # mkosi Seed= needs a UUID. Deriving it from the revision, architecture and
    # profile keeps filesystem/partition identities stable without reusing them
    # across distinct outputs.
    seed_hex=$(printf 'yubiOS\0%s\0%s\0minimal\0' "$GIT_SHA" "$architecture" |
        sha256sum | cut -c1-32)
    YUBIOS_MKOSI_SEED="${seed_hex:0:8}-${seed_hex:8:4}-5${seed_hex:13:3}-a${seed_hex:17:3}-${seed_hex:20:12}"

    TZ=UTC
    LC_ALL=C
    LANG=C
    PYTHONHASHSEED=0
    ZERO_AR_DATE=1
    KBUILD_BUILD_TIMESTAMP=$timestamp
    KBUILD_BUILD_USER=yubios
    KBUILD_BUILD_HOST=reproducible
    KBUILD_BUILD_VERSION=1
    TF_A_BUILD_TIMESTAMP=$timestamp
    TF_A_BUILD_STRING="yubiOS-${GIT_SHA}"

    export GIT_SHA SOURCE_DATE_EPOCH SOURCE_DATE_ISO8601 YUBIOS_MKOSI_SEED
    export TZ LC_ALL LANG PYTHONHASHSEED ZERO_AR_DATE
    export KBUILD_BUILD_TIMESTAMP KBUILD_BUILD_USER KBUILD_BUILD_HOST
    export KBUILD_BUILD_VERSION TF_A_BUILD_TIMESTAMP TF_A_BUILD_STRING
    umask 022
}

write_reproducible_github_env() {
    local destination=${1:-${GITHUB_ENV:-}}
    local name
    local -a names=(
        GIT_SHA SOURCE_DATE_EPOCH SOURCE_DATE_ISO8601 YUBIOS_MKOSI_SEED
        TZ LC_ALL LANG PYTHONHASHSEED ZERO_AR_DATE KBUILD_BUILD_TIMESTAMP
        KBUILD_BUILD_USER KBUILD_BUILD_HOST KBUILD_BUILD_VERSION
        TF_A_BUILD_TIMESTAMP TF_A_BUILD_STRING
    )

    [[ -n "$destination" ]] || {
        reproducible_build_error 'no GitHub environment file was supplied'
        return 1
    }
    for name in "${names[@]}"; do
        printf '%s=%s\n' "$name" "${!name}" >> "$destination"
    done
}

write_reproducible_edk2_stack_cookies() {
    local build_directory=${1:-}
    local identity=${2:-}

    [[ -n "$build_directory" ]] || {
        reproducible_build_error 'EDK2 build directory is required'
        return 2
    }
    [[ -n "${GIT_SHA:-}" && -n "${SOURCE_DATE_EPOCH:-}" ]] || {
        reproducible_build_error 'configure_reproducible_build must run before seeding EDK2 stack cookies'
        return 1
    }

    mkdir -p "$build_directory"
    python3 - "$build_directory" "$GIT_SHA" "$identity" "$SOURCE_DATE_EPOCH" <<'PY'
import hashlib
import json
import os
import pathlib
import sys

destination = pathlib.Path(sys.argv[1])
source = sys.argv[2]
identity = sys.argv[3]
epoch = int(sys.argv[4])

for bits in (32, 64):
    values = []
    for index in range(100):
        material = (
            f"yubiOS-edk2-stack-cookie-v1\0{source}\0{identity}\0{bits}\0{index}"
        ).encode()
        value = int.from_bytes(
            hashlib.sha256(material).digest()[: bits // 8], "big"
        )
        if value == 0:
            value = 1
        values.append(value)

    output = destination / f"StackCookieValues{bits}.json"
    output.write_text(json.dumps(values, separators=(",", ":")) + "\n")
    os.utime(output, (epoch, epoch))
PY
}

normalize_reproducible_tree() {
    local root=$1

    [[ -d "$root" ]] || {
        reproducible_build_error "payload directory does not exist: ${root}"
        return 1
    }
    find "$root" -type d -exec chmod 0755 {} +
    find "$root" -type f -exec chmod 0644 {} +
    find "$root" -exec touch -h --date="@${SOURCE_DATE_EPOCH}" {} +
}

write_reproducible_checksums() {
    local root=$1

    [[ -d "$root" ]] || {
        reproducible_build_error "payload directory does not exist: ${root}"
        return 1
    }
    (
        cd "$root" || exit
        find . -type f ! -name SHA256SUMS -print0 |
            LC_ALL=C sort -z |
            xargs -0r sha256sum
    ) > "$root/SHA256SUMS"
    touch --date="@${SOURCE_DATE_EPOCH}" "$root/SHA256SUMS"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    if (($# < 3 || $# > 4)); then
        printf 'Usage: %s REPOSITORY REVISION ARCHITECTURE [GITHUB_ENV]\n' "$0" >&2
        exit 2
    fi
    configure_reproducible_build "$1" "$2" "$3" || exit 1
    if (($# == 4)); then
        write_reproducible_github_env "$4" || exit 1
    fi
    printf 'source=%s\nepoch=%s\ncreated=%s\nmkosi_seed=%s\n' \
        "$GIT_SHA" "$SOURCE_DATE_EPOCH" "$SOURCE_DATE_ISO8601" "$YUBIOS_MKOSI_SEED"
fi
