// lib/repo-items.mjs
// Rewritten /api/repo-items logic. Kept separate from worker-base.js so it
// can be unit/integration-tested with a fake fetchCorpus (no live GitHub
// calls needed).
//
// Fixes vs the original handler:
//  - full file contents returned (no `.slice(0, 2000)`); a `truncated` flag
//    is surfaced per item when fetchCorpus's own 60000-char tar-entry cap
//    was hit, so callers can tell full content from clipped content
//  - full literal paths (no `.slice(0, 80)` label truncation)
//  - stable, deterministic sort by normalized path
//  - tar-root stripping is verified against ALL files, not just files[0],
//    so a tarball with mixed/no common root is never mis-stripped
//  - `ref` is optional (branch or commit) and passed straight through to
//    fetchCorpus; the ACTUAL resolved ref is returned as `resolved_ref` —
//    never fabricated. If the requested ref can't be resolved, this
//    surfaces as an error (502) rather than silently falling back to
//    another branch and reports that ref's SHA as if it were the request.
//  - subdir filtering happens BEFORE the 400-item cap; if more than 400
//    items remain after filtering, this throws (413) instead of silently
//    slicing.

import { ApiError } from "./http.mjs";

export const MAX_ITEMS = 400;

function parseOwnerRepo(input, parseRepoUrl) {
  const repoIn = String(input || "").trim();
  if (!repoIn) return null;
  const url = repoIn.includes("github.com") ? repoIn : `https://github.com/${repoIn.replace(/\.git$/, "")}`;
  return parseRepoUrl(url);
}

function normalizeSubdir(subdir) {
  return String(subdir || "").replace(/^\/+|\/+$/g, "");
}

/** Determine the tar's common root directory (e.g. "owner-repo-abcdef1/"),
 *  verified against every file rather than assumed from the first one. */
function detectTarRoot(files) {
  if (!files.length) return "";
  const candidate = files[0].path.split("/")[0] + "/";
  const allShare = files.every((f) => f.path.startsWith(candidate));
  return allShare ? candidate : "";
}

/**
 * @param {object} body - parsed request body: { repo, subdir?, ref? }
 * @param {object} deps - { parseRepoUrl, fetchCorpus, githubToken }
 *   fetchCorpus(owner, repo, maxFiles, token, ref) -> { ref, meta, files, truncated }
 *   each file: { path, text, sizeBytes?, truncated? }
 */
export async function repoItemsHandler(body, deps) {
  const { parseRepoUrl, fetchCorpus, githubToken } = deps;
  const parsed = parseOwnerRepo(body?.repo, parseRepoUrl);
  if (!parsed) throw new ApiError(400, "need a GitHub repo URL or owner/repo");

  const subdir = normalizeSubdir(body?.subdir);
  const ref = body?.ref ? String(body.ref).trim() : undefined;

  let corpus;
  try {
    corpus = await fetchCorpus(parsed.owner, parsed.repo, Infinity, githubToken, ref);
  } catch (e) {
    throw new ApiError(502, `corpus fetch failed: ${e?.message || e}`, { resolved_ref: null });
  }

  const files = Array.isArray(corpus?.files) ? corpus.files : [];
  const tarRoot = detectTarRoot(files);
  const norm = (p) => (tarRoot && p.startsWith(tarRoot) ? p.slice(tarRoot.length) : p);

  let filtered = files;
  if (subdir) {
    filtered = files.filter((f) => {
      const rp = norm(f.path);
      return rp === subdir || rp.startsWith(subdir + "/");
    });
  }

  if (filtered.length > MAX_ITEMS) {
    throw new ApiError(413, `${filtered.length} items exceed max ${MAX_ITEMS} after filtering; narrow subdir`, {
      n_before_cap: filtered.length,
      max: MAX_ITEMS,
    });
  }

  // Stable, deterministic ordering by normalized path.
  const sorted = filtered
    .map((f) => ({ f, label: norm(String(f.path)) }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  const items = sorted.map(({ f, label }) => ({
    text: String(f.text ?? ""),
    label,
    truncated: !!f.truncated,
  }));

  return {
    repo: `${parsed.owner}/${parsed.repo}`,
    subdir: subdir || null,
    requested_ref: ref || null,
    resolved_ref: corpus?.ref ?? null,
    n: items.length,
    tree_truncated: !!corpus?.truncated,
    items,
  };
}
