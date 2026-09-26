# cc_bindings_from_rs on linux-aarch64 — prebuilt survey + native build plan

Date: 2026-09-26. Context: Chromium pin `153.0.8010.36` (`507c6ee3e2f3b2ca0e660547e5b9ea4820c67f4c`), native linux-aarch64 build on HIGH-MEM (12c/62G). The downloaded toolchain's rustc + cargo are aarch64, but `bin/cc_bindings_from_rs` (crubit, generates `rs_core.h`/`rs_alloc.h`/`rs_std.h` via `enable_cpp_api_from_rust`) is x86_64-only — build fails at `[418/41902]` with exec format error. Full attempt log in `yubi-OS/chromium-provenance/docs/arm64-linux-ci.md` @ `3cc335c3`.

## TL;DR

**AArch64 prebuilt exists: NO.** Nobody publishes `cc_bindings_from_rs` binaries for any architecture; no distro packages it; crubit ships zero releases; Chromium has no `Linux_arm64` toolchain package at the pin OR on main (2026-09-25). There is no prior art building it natively on aarch64 — but the build itself is trivially portable (pure-Rust cargo binary), and Chromium's own arch-aware `tools/rust/build_crubit.py` is the sanctioned recipe. **Route (a): build it ourselves, natively on HIGH-MEM.**

## Stream findings

### Crubit upstream (stream 1)
- Repo very active (not archived), issues >#2130, pushed daily — but CI (`rust.yml`) and nightly matrix run x86_64-Linux only, distributing nothing. No CIPD, no GCS artifacts, zero GitHub releases.
- `cc_bindings_from_rs` is pure-Rust cargo: manifest at `cargo/cc_bindings_from_rs/cc_bindings_from_rs/Cargo.toml`; `cargo build --release --locked --bin cc_bindings_from_rs`. The Bazel/LLVM/Abseil dependency weight is only for the reverse-direction `rs_bindings_from_cc`.
- Required RUSTFLAGS (Linux): `-Clink-args=-Wl,-z,origin -Clink-args=-Wl,-rpath,$ORIGIN/../lib` so the binary finds `librustc_driver-*.so` in the toolchain.
- Needs the `rustc-dev` component — our toolchain already ships it (crubit links the same rustc build).
- Zero known arm64/aarch64 host issues or PRs in the tracker (~400 issues swept).

### Prior art (stream 2)
- Distros: nothing on any arch (Nixpkgs, AUR, Gentoo, Alpine, Debian/Ubuntu, Fedora, Homebrew) — everyone builds from source.
- Load-bearing find: Chromium's own `tools/rust/build_crubit.py` auto-detects host arch (`'arm64' if platform.machine() == 'aarch64' else 'amd64'`) and downloads the matching Debian sysroot — native-arm64 ready. **Caveat:** at tag 141 its `CRUBIT_BINS = ['rs_bindings_from_cc']` only; tracking bug 351793625 shows a WIP CL building crubit "on all host platforms". Check the pin-153 revision's `CRUBIT_BINS` before trusting it to build `cc_bindings_from_rs`.
- Adjacent prior art: `jasonrandrews/build-chromium-linux-arm64` (GitHub) — complete native-arm64 Chromium pipeline tested on Graviton, with `arm64-rust-build.patch`. Stops at bindgen; never builds crubit. Good prerequisite reference, not a crubit answer.

### Upstream Chromium mechanics (stream 3)
- The toolchain CIPD package (DEPS @ pin, lines 1073-1114) ships exactly four platform variants: `Linux_x64`, `Mac`, `Mac_arm64`, `Win` — no `Linux_arm64` at the pin or on main. `cc_bindings_from_rs` ships INSIDE the toolchain tarball, packaged by `tools/rust/build_crubit.py`.
- `cpp_api_from_rust.gni:95-96` hardcodes the binary path `//third_party/rust-toolchain/bin/cc_bindings_from_rs` — no per-arch logic. Also hardcodes `buildtools/linux64-format/clang-format` (lines 104-108; TODO by lukasza to generalize) — **verify that binary runs on aarch64 too; if x86_64-only, drop an aarch64 clang-format there.**
- `enable_cpp_api_from_rust` is computed (rust.gni:424, NOT declare_args) — cannot be turned off via args.gn; forcing it false breaks the graph (`font_format_bindings` unresolved). Upstream never reaches our state because upstream never syncs a native aarch64 toolchain at all (arm64 targets are cross-compiled from x64 hosts).
- Native-aarch64-with-rust is upstream-blessed only via building Crubit for the host (`build_crubit.py`; 2026 commits: `88b365d907a7` support libs, `c8f90bb14a9a` --locked + gn files install, `b4caf3373fa5` unified includes, `7283e3038f54` non-Windows fix). No aarch64-host work landed through 2026-09-25.

## Route (a) plan — build cc_bindings_from_rs natively on HIGH-MEM

1. **Find the pinned Crubit revision**: read `CRUBIT_REVISION` (or equivalent) from `tools/rust/update_rust.py` at pin `507c6ee3`; also read `tools/rust/build_crubit.py` at the same commit and check `CRUBIT_BINS` — if `cc_bindings_from_rs` is not in the list (tag-141 behavior), the build must invoke the crubit cargo rules directly.
2. **Fetch crubit source**: `chromium.googlesource.com/external/github.com/google/crubit` at the pinned revision (into `/home/ubuntu/chromium-build/crubit-src`, NOT inside the synced tree — keep the DEPS-managed tree clean).
3. **Build** (as `ubuntu`, never root — see docs/arm64-linux-ci.md finding 3):
   ```sh
   export RUSTFLAGS="-Clink-args=-Wl,-z,origin -Clink-args=-Wl,-rpath,\$ORIGIN/../lib"
   cargo build --release --locked --bin cc_bindings_from_rs
   ```
   Use the toolchain's own aarch64 cargo/rustc (verified working; rustc-dev component present). Watch `--locked` failure risk if the vendored lockfile needs platform-specific resolution on aarch64.
4. **Install per build_crubit.py convention**:
   - `cc_bindings_from_rs` (aarch64 ELF, +x) → `third_party/rust-toolchain/bin/` (replacing the x86_64 binary; keep the old one as `cc_bindings_from_rs.x64` for the audit trail)
   - `BUILD.gn`, `crubit.gni`, `LICENSE`, `support/` → `third_party/rust-toolchain/lib/crubit/`
5. **Verify**: `file .../cc_bindings_from_rs | grep aarch64`; then rebuild the failing target (`rs_core.h` generation) and re-dispatch `arm64-chromium-build.yml` — expect the graph to clear [418] and hit the next unknown.
6. **Also check** `buildtools/linux64-format/clang-format` (x86_64-only candidate, used by the same pipeline per cpp_api_from_rust.gni:104-108); swap in an aarch64 clang-format if needed.
7. **Persist the fix** in the box state + record in `docs/arm64-linux-ci.md`; the binary is a host-tool artifact — future re-syncs of `third_party/rust-toolchain` will clobber it, so the build workflow (or a bootstrap script) should re-install it idempotently.

Risks: crubit at the pinned revision may not compile against rustc `1.99.0-nightly (4eccbe999… llvmorg-24-init-3796…)` if its rustc-dev bindings drifted (mitigate: build with the exact toolchain rustc, same dir as librustc_driver); `--locked` may need regenerating for aarch64; clang-format swap may be needed. None are structural.

## What this means

Route (c) is dead — there is no prebuilt to adopt, so we become the first aarch64 crubit host-tool builder, using Chromium's own build_crubit.py conventions. The prerequisite layer (native arm64 clang/rust) is already built and working on HIGH-MEM, which is exactly the part jasonrandrews' pipeline validates. Remaining risk is mechanical, not architectural.

## Sources

- https://github.com/google/crubit (+ .github/workflows/rust.yml, issues)
- https://chromium.googlesource.com/chromium/src/+/main/tools/rust/build_crubit.py (+ @ tag 141, base64-decoded)
- https://chromium.googlesource.com/chromium/src/+/main/tools/rust/update_rust.py
- chromium DEPS @ 507c6ee3 lines 1073-1114 (rust-toolchain CIPD platforms)
- build/config/rust.gni:424, build/rust/gni_impl/cpp_api_from_rust.gni:95-108, build/rust/std/rules/BUILD.gn (pin)
- https://github.com/jasonrandrews/build-chromium-linux-arm64
- https://issues.chromium.org/issues/351793625
- https://crubit.rs/overview/cargo_build.html
