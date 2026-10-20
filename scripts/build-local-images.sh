#!/usr/bin/env bash

set -euo pipefail

# Keep these immutable inputs synchronized with PINNED.md and the image
# workflows dispatched by .github/workflows/ci.yml.
readonly DHI_IMAGE='dhi.io/debian-base@sha256:f5598e29999cb3f522d47e3885b63883d1f6e755a9957e4c880b35ed4561d65e'
readonly DOCKER_VERSION='29.9.1'
readonly BUILDX_VERSION='0.38.0'
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
            DOCKER_SHA512=f508d7befbb25a9993b762d6b8b5e626d7382884c63d8d6f0db0bc8d7e27b6a7bcaac4f353e79fe2eeaef8233d817e430982138cf94e86aee2ca9ebb975d9323
            ROOTLESS_SHA512=16ec64b59b207eb6d937b18fa8880dd1b345603f6a2b481d67f9f6fba9a00d19f1d09552fe5b4d75aa4b1e108854306c25519f1489a7a2972c7f94229805573c
            BUILDX_SHA512=fa2a4b38d084304e3993161a7cb5beb46c38f311ca5697dc57e97bf6e4f3505e66d9b4b089faf138e499565fca83620aa0a73a571141111cbd4d1877fe0e692b
            ;;
        aarch64|arm64)
            ARCH=arm64
            PLATFORM=linux/arm64
            DOCKER_ARCH=aarch64
            BUILDX_ARCH=linux-arm64
            DOCKER_SHA512=f1dbaee45f65122a3edbf59f8f9e7ea77212a300cfabdf54beeb5a115b18536e7d846a0a0b15adffa1e5fb56a9bc7d82fba350ef662c448935d372c98996a34e
            ROOTLESS_SHA512=20c59b7b4d680c0cd811fb17c138e5fea4cbac0528837fd9c81a8316cb151338ef8cbf5c55697228b8b32aea81f05e561693525a0cb51c8696889f011e21a07c
            BUILDX_SHA512=ce6749dafc2f662a4fc12857803250608e5b911f69c94f8fb93c55c7a334090527ecf0867476d252a22d31cd2e0af9ca2e4a478e49ea9b14c232cd3138922183
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
