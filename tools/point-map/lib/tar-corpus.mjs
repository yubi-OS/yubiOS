// lib/tar-corpus.mjs
// Standalone streaming TAR/gzip corpus extractor for GitHub archives.

const GH = "https://api.github.com";
const CODELOAD = "https://codeload.github.com";

export const TEXT_EXT = /\.(md|txt|rst|ts|tsx|js|jsx|py|rs|go|c|h|cpp|hpp|java|rb|sh|bash|fish|yml|yaml|toml|json|lean|tex|rego|conf|cfg|ini|sql|proto|dockerfile|containerfile|hcl|tf)$/i;
export const SPECIAL = /(^|\/)(readme|license|makefile|dockerfile|containerfile)(\.|$)/i;
export const SKIP_DIRS = /(^|\/)(node_modules|vendor|dist|build|\.git|figs?|images?|assets|fonts)\//i;

const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024; // 256 MB
const MAX_TOTAL_TEXT_CHARS = 16 * 1024 * 1024;   // 16 MB
const MAX_ENTRIES = 10000;
const PER_FILE_CAP_CHARS = 200000;
const MAX_FILE_SIZE_BYTES = 200000;              // 200 KB

function defaultHeaders(token) {
  const h = {
    "User-Agent": "sos-agent",
    Accept: "application/vnd.github+json"
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function decodeTarString(buf, offset, length) {
  let end = offset;
  const max = offset + length;
  while (end < max && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(offset, end));
}

function parseTarHeader(h) {
  if (h.every((b) => b === 0)) return null;
  const expected = parseInt(decodeTarString(h,148,8).trim(),8);
  const actual = h.reduce((sum,b,i)=>sum+(i>=148&&i<156?32:b),0);
  if(!Number.isFinite(expected)||expected!==actual) throw new Error("Corrupt TAR header checksum");
  const rawSizeStr = decodeTarString(h, 124, 12).trim();
  const size = parseInt(rawSizeStr, 8);
  if(!/^[0-7]+$/.test(rawSizeStr)||!Number.isSafeInteger(size)||size<0)throw new Error("Invalid TAR size");
  const typeFlag = String.fromCharCode(h[156]);
  const name = decodeTarString(h, 0, 100);
  const prefix = decodeTarString(h, 345, 155);
  const path = (prefix ? prefix + "/" : "") + name.replace(/\/$/, "");
  return { path, size, typeFlag };
}

function parsePax(bytes) {
  const records={};let offset=0;const dec=new TextDecoder();
  while(offset<bytes.length){let sp=offset;while(sp<bytes.length&&bytes[sp]!==32)sp++;
    const size=Number(dec.decode(bytes.subarray(offset,sp)));
    if(!Number.isSafeInteger(size)||size<=sp-offset+1||offset+size>bytes.length)throw new Error("Invalid PAX record");
    const line=dec.decode(bytes.subarray(sp+1,offset+size)).replace(/\n$/,"");const eq=line.indexOf("=");
    if(eq>0)records[line.slice(0,eq)]=line.slice(eq+1);offset+=size;
  }return records;
}

export async function parseTarStream(stream, maxFiles = Infinity) {
  const reader = stream.getReader();
  const textDec = new TextDecoder();
  let buf = new Uint8Array(1 << 16);
  let len = 0;
  let totalDecompressed = 0;
  let totalEntries = 0;
  let accumulatedTextChars = 0;

  const ensure = (extra) => {
    if (len + extra <= buf.length) return;
    let cap = buf.length;
    while (cap < len + extra) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(buf.subarray(0, len));
    buf = nb;
  };

  const shift = (n) => {
    buf.copyWithin(0, n, len);
    len -= n;
  };

  const files = [];
  let pendingGnuPath = null;
  let pendingPaxPath = null;
  let currentFile = null;

  try {
    while (true) {
      if (currentFile) {
        if (currentFile.skip) {
          const toSkip = Math.min(len, currentFile.rem);
          shift(toSkip);
          currentFile.rem -= toSkip;
          if (currentFile.rem === 0) {
            currentFile = null;
            continue;
          }
        } else {
          const take = Math.min(len, currentFile.rem);
          if (take > 0) {
            currentFile.chunks.push(buf.slice(0, take));
            currentFile.rem -= take;
            shift(take);
          }
          if (currentFile.rem === 0) {
            const totalBytes = currentFile.chunks.reduce((acc, c) => acc + c.length, 0);
            const rawBytes = new Uint8Array(totalBytes);
            let off = 0;
            for (const ch of currentFile.chunks) {
              rawBytes.set(ch, off);
              off += ch.length;
            }
            const fileBytes = rawBytes.subarray(0, currentFile.size);
            if (currentFile.isPax) {
              const pax = parsePax(fileBytes);
              if (pax.path) pendingPaxPath = pax.path.replace(/\/$/, "");
            } else if (currentFile.isGnu) {
              const full = textDec.decode(fileBytes).replace(/\0.*$/, "").replace(/\/$/, "");
              pendingGnuPath = full;
            } else {
              const fullDecoded = textDec.decode(fileBytes);
              const text = fullDecoded.slice(0, PER_FILE_CAP_CHARS);
              const truncated = fullDecoded.length > PER_FILE_CAP_CHARS;
              accumulatedTextChars += text.length;
              files.push({
                path: currentFile.path,
                text,
                sizeBytes: currentFile.size,
                truncated
              });
              if (accumulatedTextChars >= MAX_TOTAL_TEXT_CHARS) throw new Error("TAR text budget exceeded");
            }
            currentFile = null;
            continue;
          }
        }
        // Need more data from reader to satisfy currentFile
        const r = await reader.read();
        if (r.done) { if(currentFile||len)throw new Error("Truncated TAR archive"); break; }
        totalDecompressed += r.value.length;
        if (totalDecompressed > MAX_DECOMPRESSED_BYTES) throw new Error("TAR decompressed budget exceeded");
        ensure(r.value.length);
        buf.set(r.value, len);
        len += r.value.length;
        continue;
      }

      if (len >= 512) {
        const headerBlock = buf.subarray(0, 512);
        const header = parseTarHeader(headerBlock);
        if (!header) break; // 512 nulls = end of archive
        shift(512);

        totalEntries++;
        if (totalEntries > MAX_ENTRIES) throw new Error("TAR entry budget exceeded");

        const { size, typeFlag } = header;
        const entryPath = pendingGnuPath || pendingPaxPath || header.path;
        pendingGnuPath = null;
        pendingPaxPath = null;

        const paddedSize = Math.ceil(size / 512) * 512;
        const isGnu = typeFlag === "L";
        const isPax = typeFlag === "x" || typeFlag === "X";
        const isRegular = typeFlag === "0" || typeFlag === "\0";

        if ((isGnu || isPax) && size > MAX_FILE_SIZE_BYTES) throw new Error("Oversize TAR extended header");
        if (isGnu) {
          currentFile = { isGnu: true, size, rem: paddedSize, chunks: [] };
          continue;
        }
        if (isPax) {
          currentFile = { isPax: true, size, rem: paddedSize, chunks: [] };
          continue;
        }

        const isDir = typeFlag === "5" || entryPath.endsWith("/");
        const isTextCandidate =
          isRegular &&
          !isDir &&
          !SKIP_DIRS.test(entryPath) &&
          !entryPath.includes("/.git/") &&
          (TEXT_EXT.test(entryPath) || SPECIAL.test(entryPath));

        if (isTextCandidate) {
          if (size > MAX_FILE_SIZE_BYTES) {
            // Explicitly record oversized candidates (>200k) as truncated items rather than silent omission
            files.push({
              path: entryPath,
              text: "",
              sizeBytes: size,
              truncated: true
            });
            if (paddedSize > 0) {
              currentFile = { skip: true, rem: paddedSize };
            }
          } else if (size > 0) {
            currentFile = { path: entryPath, size, rem: paddedSize, chunks: [] };
          } else {
            // size == 0 text file
            files.push({ path: entryPath, text: "", sizeBytes: 0, truncated: false });
          }
        } else {
          if (paddedSize > 0) {
            currentFile = { skip: true, rem: paddedSize };
          }
        }
        continue;
      }

      // len < 512, need more data
      const r = await reader.read();
      if (r.done) { if(currentFile||len)throw new Error("Truncated TAR archive"); break; }
      totalDecompressed += r.value.length;
      if (totalDecompressed > MAX_DECOMPRESSED_BYTES) throw new Error("TAR decompressed budget exceeded");
      ensure(r.value.length);
      buf.set(r.value, len);
      len += r.value.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }

  // Deterministic sort: SPECIAL priority, then path depth, then lexical
  files.sort((a, b) => {
    const da = a.path.split("/").length;
    const db = b.path.split("/").length;
    const ra = SPECIAL.test(a.path) ? 0 : 1;
    const rb = SPECIAL.test(b.path) ? 0 : 1;
    return ra - rb || da - db || (a.path < b.path ? -1 : 1);
  });

  const sliced = Number.isFinite(maxFiles) ? files.slice(0, maxFiles) : files;
  return {
    files: sliced,
    truncated: files.length > sliced.length
  };
}

export async function fetchCorpus(owner, repo, maxFiles = Infinity, token, refOverride) {
  let meta = { description: null, stars: null, language: null };
  let ref = null;
  const is40Hex = typeof refOverride === "string" && /^[0-9a-fA-F]{40}$/.test(refOverride);

  // Cheap metadata fetch (optional, fail-safe)
  try {
    const metaRes = await fetch(`${GH}/repos/${owner}/${repo}`, {
      headers: defaultHeaders(token)
    });
    if (metaRes.ok) {
      const m = await metaRes.json();
      meta = { description: m.description, stars: m.stargazers_count, language: m.language };
      ref = m.default_branch || "main";
    }
  } catch {
    // metadata is optional
  }

  const requestedRef = refOverride || ref || "main";
  const tarUrl = `${CODELOAD}/${owner}/${repo}/tar.gz/${encodeURIComponent(requestedRef)}`;
  let res = await fetch(tarUrl, {
    headers: defaultHeaders(token),
    redirect: "follow"
  });

  if (!res.ok && !refOverride && requestedRef !== "main") {
    // Safe main fallback if default branch failed
    const fallbackUrl = `${CODELOAD}/${owner}/${repo}/tar.gz/main`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: defaultHeaders(token),
      redirect: "follow"
    });
    if (fallbackRes.ok) {
      res = fallbackRes;
      ref = "main";
    }
  }

  if (!res.ok || !res.body) {
    throw new Error(`repo tarball failed: HTTP ${res.status} for ${owner}/${repo}@${requestedRef}`);
  }

  const effectiveRef = refOverride ? (is40Hex ? refOverride : refOverride) : (ref || "main");
  const decompressedStream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const parsed = await parseTarStream(decompressedStream, maxFiles);

  return {
    ref: effectiveRef,
    meta,
    files: parsed.files,
    truncated: parsed.truncated
  };
}
