---
name: chromium-overlay-ship
description: "Ship a change from the HIGH-MEM box Chromium tree into the yubi-OS/chromium-provenance overlay patch series (OMN-165 / Antimony): box commit, cumulative or per-member patch generation, chunked base64 transfer over the ubuntu shell bridge, Git Data API push with a SERIES.md row, CI dispatch + workflow-scoped verification, and a numbered Linear status comment. Use for any 'commit + push + CI' cycle on the provenance-gate tree, including fixups, new series members, and release-related patches."
requiredApps: []
---

# Chromium overlay ship pipeline (yubi-OS/chromium-provenance)

Proven across patches 0001–0019 and 12+ fixups (2026-09-27 → 2026-10-01, 10 ship cycles in the Oct-1 session alone). Every default below encodes a failure that already cost a cycle once.

## Environment facts (ubuntu HIGH-MEM box)

- Bridge: POST `{"command":["bash","-c","..."]}` to `https://ubuntu.tail3a04f5.ts.net/run` with connection `conn_ai5iXWquRX0s` (proxy injects auth). The bridge is SINGLE-THREADED and runs as root — long commands (builds, chrome launches) wedge it: run detached (`nohup ... > /tmp/<log>.log 2>&1 &`) and poll the log. Launch calls timing out with curl 28 usually still executed; check state before retrying.
- Tree: `/home/ubuntu/chromium-build/src`, branch `provenance-gate`. Overlay: `yubi-OS/chromium-provenance` (patches/NNNN-*.patch + patches/SERIES.md). CI: `arm64-chromium-build.yml` (content_shell, HIGH-MEM self-hosted runner). Series base commit: `507c6ee3e2`.
- Root git needs `git -c safe.directory=/home/ubuntu/chromium-build/src` PER COMMAND (dubious ownership; the HOME-less bridge breaks `git config --global`). Commits need explicit identity: `-c user.name=OMNI-AGENT -c user.email=foil-copy-overrate@duck.com`.
- Working gn: `/home/ubuntu/chromium-build/gn-cipd/gn` (the depot_tools wrapper needs a python3 bootstrap this checkout never ran, and `ninja ... gn` is not a target — "did you mean 'gin'?". The build.ninja regen rule and the CI workflow both use gn-cipd).
- Build classes: C++/vector-icon/binary-asset changes → chrome relink; grd-only changes → locale-pak repack only, chrome restart suffices; webui image/SVG changes → webui resources_grit + resources.pak repack, restart suffices.
- Release-grade builds go in a SEPARATE out dir (e.g. `out/arm64-release` with `is_component_build = false`) — the dev out dir (`out/arm64-qual`) stays component-build for fast iteration.

## Ship sequence

1. **Box commit**: `git -c safe.directory=... add <explicit paths>` — never `git add .`; tooling strays (typescript.py, build_rust.py, untracked rust logs) live in the tree and must stay out. Commit with the explicit identity above.
2. **Generate the patch**:
   - Fixup to the HEAD series member: cumulative `git diff <prev-box-commit>..HEAD --binary > /tmp/patch` (use `--binary` whenever PNG/ico/SVG assets are involved).
   - New series member touching files no earlier member touched: verify with `git log 507c6ee3e2..HEAD -- <file>` (empty = clean), then `git diff 507c6ee3e2..HEAD -- <files>`.
3. **Fetch over the bridge in chunks**: `base64 -w0 <patch> | cut -c<START>-<END>` in ~130,000-char chunks (loop START = 1, 130001, 260001, ...), then reassemble locally: strip everything except `[A-Za-z0-9+/=]`, `base64.b64decode`. ALWAYS validate: byte count equals the box `wc -c`, first line starts `diff --git`, count `diff --git` and `GIT binary patch` sections. (Long b64 written via the write tool truncates; long heredocs break — chunked fetch is the reliable path.)
4. **Push to overlay via Git Data API** (connection `conn_3h7rj41VF6hs`; a `User-Agent: sauna-agent` header is REQUIRED or GitHub 403s):
   - GET `git/refs/heads/main` → commit sha → tree sha; POST `git/blobs` (patch, encoding base64) + blob (new SERIES.md); POST `git/trees` with `base_tree`; POST `git/commits` (parents=[main sha]); PATCH `git/refs/heads/main` with force=false.
   - SERIES.md: insert a new `| NNNN | \`patches/NNNN-name.patch\` ✅ AUTHORED (...) | paths | one-line effect |` row after the previous member's row (assert count==1 of the anchor row), or REPLACE the member's row in place when regenerating an existing patch. Row text is the durable changelog — keep it detailed, append each fixup's story before the trailing columns.
5. **CI dispatch + verification**: POST `/actions/workflows/arm64-chromium-build.yml/dispatches` `{"ref":"main"}` (no dispatch inputs), then poll `GET .../runs?per_page=3` until a run exists at the NEW head sha, then until `completed`. A 204 is not proof of a run. Runs are usually green within minutes when the change is patch-only.
6. **Linear comment** (connection `conn_pd_apn_Jjhzk0j`): resolve the issue id via `issues(filter:{number:{eq:165}, team:{key:{eq:"OMN"}}})`, then `commentCreate(input:{issueId, body})`. Number the comments sequentially (29, 30, …) — the count is the session changelog. Em dashes allowed (Linear carve-out).
7. **Memory**: append the entry (box commit, overlay sha, CI run id, the lesson) to COMPANY.md's OMN-165 bullet in the same turn.

## Failure modes already paid for

- Bridge JSON payloads: `\|` (or any invalid `\x`) inside a grep pattern 400s the whole call — use `grep -E 'a|b'` (no backslashes) inside bridge payloads.
- `pgrep -f "ninja -C out"` self-matches the bridge's own bash wrapper — use the bracket trick (`ninj[a]`) or confirm with `ps`.
- mtime staleness: assets restored from a zip/tar carry mtimes OLDER than the pak output, so ninja silently skips the repack and the build ships old assets. Touch the assets AND delete the stale grit intermediate (e.g. `gen/chrome/app/theme/theme_resources_grit.d.stamp` + `theme_resources_*_percent.pak`) before rebuilding.
- The same `.icon` filename exists in MULTIPLE build targets with different generated namespaces (chrome/app/vector_icons → chrome::, components/omnibox/browser/vector_icons → omnibox::, components/vector_icons/<brand>/ → vector_icons::, ui/message_center → message_center). Resolve the CONSTANT to its generating target and grep the `gen/` output for the new geometry before declaring an icon replaced.
- A generator that validates through a different rendering path than the artifact it emits proves nothing — render/inspect the actual emitted artifact (the .icon coordinates, not the helper's SVG).
- Verify brand-text edits against the rendered UI with a shadow-DOM-walking puppeteer script against CDP 9229 (`document.title`, anchor hrefs, `div.secondary` texts), not against source greps.

## Examples

Ship a rebrand fixup: box commit → cumulative --binary patch → chunked fetch → Git Data API push with SERIES row → CI dispatch + workflow-filtered verification → numbered Linear comment.

## Guidelines

1. Never `git add .` on the box tree; tooling strays must stay out of patches.
2. Validate every chunked patch fetch (byte count, first line, section counts) before pushing.
3. CI verification is workflow-filtered, never head_sha-only.
4. Append the ship record to COMPANY.md in the same turn — the SERIES row and COMPANY bullet are the durable changelog.
