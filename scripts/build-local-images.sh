#!/usr/bin/env bash

set -euo pipefail

# Keep these immutable inputs synchronized with PINNED.md and the image
# workflows dispatched by .github/workflows/ci.yml.
readonly DHI_IMAGE='dhi.io/debian-base@sha256:61dc022a1908439c478ed4b00e883fe8a7a03540fac23a8aed61352e28e6ae07'
readonly DOCKER_VERSION='29.6.0'
readonly BUILDX_VERSION='0.35.0'
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly SCRIPT_DIR

# shellcheck source=scripts/lib/reproducible-build.sh
source "$SCRIPT_DIR/lib/reproducible-build.sh"
# shellcheck source=scripts/lib/local-build-installer.sh
source "$SCRIPT_DIR/lib/local-build-installer.sh"
# shellcheck source=scripts/lib/local-build-firmware.sh
source "$SCRIPT_DIR/lib/local-build-firmware.sh"

usage() {
    cat <<'EOF'
Usage: scripts/build-local-images.sh [MODE]

Build native yubiOS image and artifact paths inside the pinned DHI container
using a rootless Docker-in-Docker daemon and the hardened Buildx Bake builder.

  all                          Build the complete ci.yml image set (default).
  images                       Build production and TEST-only dev images.
  production                   Build the production image and smoke test.
  dev                          Build the TEST-only swu2f image and smoke test.
  installer                    Build and package the native mkosi installer.
  firmware                     Build, verify, and package all firmware boards.
  firmware-qemu-arm64          Build only the QEMU ARM64 firmware path.
  firmware-rockpro64-rk3399    Build only the ROCKPro64/RK3399 firmware path.
  firmware-rock5b-rk3588       Build only the ROCK 5B/RK3588 firmware path.
  repro-production             Prove two clean production OCI layouts match.
  repro-dev                    Prove two clean TEST-only dev OCI layouts match.

Set LOCAL_TAG to change the local tag prefix (default: local). For example,
LOCAL_TAG=review scripts/build-local-images.sh production creates
yubios:review. Installer and firmware tags use review-installer and
review-firmware-<board>. Set ROCKCHIP_TPL to a real RK3588 DDR/TPL blob when a
bootable ROCK 5B image is required.
EOF
}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

resolve_mode() {
    case "${1:-all}" in
        all|images|production|dev|installer|firmware|firmware-qemu-arm64|firmware-rockpro64-rk3399|firmware-rock5b-rk3588|repro-production|repro-dev)
            MODE=${1:-all}
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            usage >&2
            die "unknown image path: $1"
            ;;
    esac
}

append_image_tag() {
    IMAGE_TAGS+=("$1")
}

prepare_artifact_worktree() {
    if [[ -n "${ARTIFACT_REPO:-}" ]]; then
        return
    fi
    BUILD_WORK_ROOT=$(mktemp -d /mnt/yubios-local-work.XXXXXX)
    ARTIFACT_REPO="$BUILD_WORK_ROOT/repo"
    mkdir -p "$ARTIFACT_REPO"
    cp -a --no-preserve=ownership /workspace/. "$ARTIFACT_REPO/"
}

build_local_core_images() {
    local selection=$1
    local -a bake_targets

    case "$selection" in
        images)
            bake_targets=(yubios-ci yubios-dev-ci)
            append_image_tag "yubios:${LOCAL_TAG}"
            append_image_tag "yubios:${LOCAL_TAG}-dev"
            ;;
        production)
            bake_targets=(yubios-ci)
            append_image_tag "yubios:${LOCAL_TAG}"
            ;;
        dev)
            bake_targets=(yubios-dev-ci)
            append_image_tag "yubios:${LOCAL_TAG}-dev"
            ;;
        *)
            die "unknown core image selection: $selection"
            ;;
    esac

    cd /workspace
    export PUSH=false
    docker buildx bake \
        --builder hardened \
        --file yubiOS-bake.hcl \
        "${bake_targets[@]}"
}

run_selected_builds() {
    case "$1" in
        all)
            # Match the non-ci_fork image order in ci.yml.
            build_local_firmware all
            build_local_core_images images
            build_local_installer
            ;;
        images|production|dev)
            build_local_core_images "$1"
            ;;
        installer)
            build_local_installer
            ;;
        firmware)
            build_local_firmware all
            ;;
        firmware-qemu-arm64)
            build_local_firmware qemu-arm64
            ;;
        firmware-rockpro64-rk3399)
            build_local_firmware rockpro64-rk3399
            ;;
        firmware-rock5b-rk3588)
            build_local_firmware rock5b-rk3588
            ;;
        repro-production)
            REPRO_REPORT="/output/reproducibility-production-${ARCH}.json" \
                /workspace/scripts/verify-reproducible-images.sh production
            ;;
        repro-dev)
            REPRO_REPORT="/output/reproducibility-dev-${ARCH}.json" \
                /workspace/scripts/verify-reproducible-images.sh dev
            ;;
    esac
}

host_cleanup() {
    local status=$?

    trap - EXIT
    if [[ -n "${HOST_OUTPUT_DIR:-}" && -d "$HOST_OUTPUT_DIR" ]]; then
        rm -rf -- "$HOST_OUTPUT_DIR" || true
    fi
    exit "$status"
}

configure_architecture() {
    case "$(uname -m)" in
        x86_64)
            ARCH=amd64
            PLATFORM=linux/amd64
            DOCKER_ARCH=x86_64
            BUILDX_ARCH=linux-amd64
            DOCKER_SHA512=42401384ef853dab0a1986a7990420e77d3ee2bc39e178f8817d27ba6c4403998b7aacf3c28c7172135cdeec281cd328a8f2af949b5f57db44a211a093cfd20b
            ROOTLESS_SHA512=184b583a0f325bef12feaf1ca175ff5ea4a65a168f2136eb1daf9c2ae646eecf02134ed65766c8800bd8eb03ac4d338d1e5d700248bc33632027b5b0b52de48a
            BUILDX_SHA512=710f4f48a101af939c4a4cace5ca93ab8c1a1a9ae244a4ef73b2a900f228614472b635bd202fae383c851686d383a37cdeddf45e6d54b36cae8458826c272262
            ;;
        aarch64|arm64)
            ARCH=arm64
            PLATFORM=linux/arm64
            DOCKER_ARCH=aarch64
            BUILDX_ARCH=linux-arm64
            DOCKER_SHA512=04713ac54030bed8b2c096280d034b02f5430ed73ba8bcc4a686f7bbbf4a3444eb027847e896cd9ee91c3237dbe1c25a4cfca43d1dcd922a1a10009c960ace0b
            ROOTLESS_SHA512=37649acdaacc597c115d2f19b71a4729a0119c6debbba4b4af18da2fd497ac28f5691df13137b7fc59903551ab0e08868f4b976a9a5704e2b7958b3b5b0cc0af
            BUILDX_SHA512=6dc0d4ed11a7bbd8148dab8897594d7050e7f3bc43e6d130e629aa443e50266e77beed8816737e5dc34b7d43617e7a4eef8121561042ef9a87479aea14383058
            ;;
        *)
            die "unsupported build architecture: $(uname -m)"
            ;;
    esac
    export ARCH PLATFORM DOCKER_ARCH BUILDX_ARCH
    export DOCKER_SHA512 ROOTLESS_SHA512 BUILDX_SHA512
}

inner_cleanup() {
    local status=$?

    trap - EXIT
    if [[ -n "${ROOTLESS_DOCKER_PID:-}" ]]; then
        kill "$ROOTLESS_DOCKER_PID" >/dev/null 2>&1 || true
        wait "$ROOTLESS_DOCKER_PID" >/dev/null 2>&1 || true
    fi
    if ((status != 0)) && [[ -f "${ROOTLESS_LOG:-}" ]]; then
        printf '\nRootless Docker log:\n' >&2
        cat "$ROOTLESS_LOG" >&2
    fi
    exit "$status"
}

run_inside_dhi() {
    local mode=$1
    local download_dir docker_tools_dir rootless_user rootless_runtime_dir
    local rootless_socket rootless_data_dir attempt image_tag
    local -a IMAGE_TAGS=()

    [[ "$(id -u)" -eq 0 ]] || die 'the DHI build container must start as root'
    [[ -e /workspace/.git ]] || die '/workspace is not a yubiOS checkout'
    [[ -d /output ]] || die '/output export mount is missing'

    apt-get update -qq
    apt-get install -y -qq --no-install-recommends \
        ca-certificates curl fuse-overlayfs git iproute2 iptables jq nftables \
        passwd procps python3 slirp4netns uidmap util-linux
    command -v wcurl >/dev/null 2>&1 || die 'the pinned DHI image does not provide wcurl'
    configure_reproducible_build /workspace "$GIT_SHA" "$ARCH"

    download_dir=$(mktemp -d)
    docker_tools_dir=/opt/yubios-docker-tools
    rootless_user=docker-rootless
    rootless_runtime_dir=/run/docker-rootless
    rootless_socket="${rootless_runtime_dir}/docker.sock"
    rootless_data_dir=$(mktemp -d /mnt/docker-rootless.XXXXXX)
    ROOTLESS_LOG=/tmp/dockerd-rootless.log
    ROOTLESS_DOCKER_PID=
    trap inner_cleanup EXIT

    cd "$download_dir"
    wcurl "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_VERSION}.tgz"
    wcurl "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-rootless-extras-${DOCKER_VERSION}.tgz"
    wcurl "https://github.com/docker/buildx/releases/download/v${BUILDX_VERSION}/buildx-v${BUILDX_VERSION}.${BUILDX_ARCH}"

    printf '%s  %s\n' "$DOCKER_SHA512" "docker-${DOCKER_VERSION}.tgz" | sha512sum --check --strict
    printf '%s  %s\n' "$ROOTLESS_SHA512" "docker-rootless-extras-${DOCKER_VERSION}.tgz" | sha512sum --check --strict
    printf '%s  %s\n' "$BUILDX_SHA512" "buildx-v${BUILDX_VERSION}.${BUILDX_ARCH}" | sha512sum --check --strict

    tar xzf "docker-${DOCKER_VERSION}.tgz"
    tar xzf "docker-rootless-extras-${DOCKER_VERSION}.tgz"
    mkdir -p "$docker_tools_dir/bin" "$docker_tools_dir/config/cli-plugins"
    install -m 0755 docker/* "$docker_tools_dir/bin/"
    install -m 0755 docker-rootless-extras/dockerd-rootless.sh "$docker_tools_dir/bin/"
    install -m 0755 docker-rootless-extras/rootlesskit "$docker_tools_dir/bin/"
    install -m 0755 "buildx-v${BUILDX_VERSION}.${BUILDX_ARCH}" \
        "$docker_tools_dir/config/cli-plugins/docker-buildx"

    useradd --create-home --shell /bin/sh "$rootless_user"
    printf '%s\n' "${rootless_user}:100000:65536" > /etc/subuid
    printf '%s\n' "${rootless_user}:100000:65536" > /etc/subgid
    install -d -m 0700 -o "$rootless_user" -g "$rootless_user" "$rootless_runtime_dir"
    chown "$rootless_user:$rootless_user" "$rootless_data_dir"
    chmod 0700 "$rootless_data_dir"

    export PATH="$docker_tools_dir/bin:$PATH"
    export DOCKER_CONFIG="$docker_tools_dir/config"
    export DOCKER_HOST="unix://${rootless_socket}"

    setpriv \
        --reuid="$rootless_user" \
        --regid="$rootless_user" \
        --init-groups \
        env \
            HOME="/home/${rootless_user}" \
            USER="$rootless_user" \
            LOGNAME="$rootless_user" \
            XDG_RUNTIME_DIR="$rootless_runtime_dir" \
            PATH="$docker_tools_dir/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
            DOCKERD_ROOTLESS_ROOTLESSKIT_NET=slirp4netns \
            dockerd-rootless.sh \
                --data-root="$rootless_data_dir" \
                --storage-driver=fuse-overlayfs \
                -H "unix://${rootless_socket}" \
        > "$ROOTLESS_LOG" 2>&1 &
    ROOTLESS_DOCKER_PID=$!

    for ((attempt = 1; attempt <= 60; attempt++)); do
        if docker info >/dev/null 2>&1; then
            break
        fi
        if ! kill -0 "$ROOTLESS_DOCKER_PID" 2>/dev/null; then
            die 'rootless Docker stopped during startup'
        fi
        sleep 1
    done
    docker info >/dev/null 2>&1 || die 'rootless Docker did not become ready within 60 seconds'

    docker buildx create --name hardened --driver docker-container \
        --driver-opt "image=${YUBIOS_BUILDKIT_IMAGE}" --use || true
    docker buildx inspect hardened --bootstrap

    export GIT_SHA PUSH=false
    BUILD_WORK_ROOT=
    ARTIFACT_REPO=
    run_selected_builds "$mode"

    if [[ "$mode" == repro-production || "$mode" == repro-dev ]]; then
        compgen -G '/output/reproducibility-*.json' >/dev/null || \
            die 'the reproducibility proof produced no evidence report'
        return
    fi
    ((${#IMAGE_TAGS[@]} > 0)) || die 'the selected path produced no local image tags'
    for image_tag in "${IMAGE_TAGS[@]}"; do
        docker image inspect "$image_tag" >/dev/null
    done
    docker image save --output /output/yubios-local-images.tar "${IMAGE_TAGS[@]}"
    printf '%s\n' "${IMAGE_TAGS[@]}" > /output/yubios-local-tags
}

run_on_host() {
    local mode=$1 repo_root output_dir revision image_tag
    local use_rockchip_tpl=false
    local -a docker_args

    # Ubuntu 26.04 is the supported host. The privileged outer container is
    # explicitly unconfined so the rootless daemon does not require changing
    # the host's apparmor_restrict_unprivileged_userns sysctl.
    [[ -r /etc/os-release ]] || die 'cannot identify the host operating system'
    # shellcheck disable=SC1091
    source /etc/os-release
    if [[ "${ID:-}" != ubuntu || "${VERSION_ID:-}" != 26.04 ]]; then
        die "supported host is Ubuntu 26.04 (found ${PRETTY_NAME:-unknown})"
    fi

    command -v docker >/dev/null 2>&1 || die 'docker is required; follow the Ubuntu setup in README.md'
    docker info >/dev/null 2>&1 || die 'cannot reach the host Docker daemon; sign in again after joining the docker group'

    repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
    [[ -f "$repo_root/yubiOS-bake.hcl" ]] || die 'could not locate yubiOS-bake.hcl'
    revision=$(reproducible_git "$repo_root" rev-parse HEAD)
    if [[ -n "$(reproducible_git "$repo_root" status --porcelain)" ]]; then
        printf 'warning: building a dirty checkout; OCI revision remains %s\n' "$revision" >&2
    fi

    output_dir=$(mktemp -d "${TMPDIR:-/tmp}/yubios-local-build.XXXXXX")
    HOST_OUTPUT_DIR=$output_dir
    trap host_cleanup EXIT

    case "$mode" in
        all|firmware|firmware-rock5b-rk3588) use_rockchip_tpl=true ;;
    esac
    if [[ "$use_rockchip_tpl" == true && -n "${ROCKCHIP_TPL:-}" ]]; then
        [[ -f "$ROCKCHIP_TPL" && -r "$ROCKCHIP_TPL" ]] || \
            die "ROCKCHIP_TPL is not a readable file: $ROCKCHIP_TPL"
        cp -- "$ROCKCHIP_TPL" "$output_dir/rockchip-tpl.bin"
    fi

    printf 'Building %s image path(s) for %s inside %s\n' "$mode" "$PLATFORM" "$DHI_IMAGE"
    docker_args=(run --rm --pull=always --privileged \
        --security-opt apparmor=unconfined \
        --volume /mnt \
        --mount "type=bind,src=${repo_root},dst=/workspace,readonly" \
        --mount "type=bind,src=${output_dir},dst=/output" \
        --workdir /workspace \
        --env YUBIOS_LOCAL_DHI=1 \
        --env "GIT_SHA=${revision}" \
        --env "LOCAL_TAG=${LOCAL_TAG}")
    if [[ "$use_rockchip_tpl" == true && -n "${ROCKCHIP_TPL:-}" ]]; then
        docker_args+=(--env ROCKCHIP_TPL=/output/rockchip-tpl.bin)
    fi
    docker_args+=( \
        "$DHI_IMAGE" \
        /bin/bash /workspace/scripts/build-local-images.sh "$mode")
    docker "${docker_args[@]}"

    if [[ "$mode" == repro-production || "$mode" == repro-dev ]]; then
        mkdir -p "$repo_root/repro-evidence"
        cp -- "$output_dir"/reproducibility-*.json "$repo_root/repro-evidence/"
        printf '\nReproducibility evidence:\n'
        printf '  %s\n' "$repo_root"/repro-evidence/reproducibility-*.json
        return
    fi

    docker image load --input "$output_dir/yubios-local-images.tar"
    printf '\nLoaded local image tags:\n'
    while IFS= read -r image_tag; do
        docker image inspect --format '  {{.RepoTags}} ({{.Architecture}})' "$image_tag"
    done < "$output_dir/yubios-local-tags"
}

MODE=all
resolve_mode "${1:-all}"
LOCAL_TAG=${LOCAL_TAG:-local}
[[ "$LOCAL_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,101}$ ]] || \
    die 'LOCAL_TAG must be a valid Docker tag prefix of at most 102 characters'
export LOCAL_TAG

configure_architecture
if [[ "${YUBIOS_LOCAL_DHI:-0}" == 1 ]]; then
    run_inside_dhi "$MODE"
else
    run_on_host "$MODE"
fi
