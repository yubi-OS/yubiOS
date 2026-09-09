import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { parseTarStream, fetchCorpus } from "./lib/tar-corpus.mjs";

function makeTarHeader(name, size, typeFlag = "0", prefix = "") {
  const h = new Uint8Array(512);
  const enc = new TextEncoder();
  h.set(enc.encode(name.slice(0, 100)), 0);
  const sizeOctal = size.toString(8).padStart(11, "0") + " ";
  h.set(enc.encode(sizeOctal), 124);
  h[156] = typeFlag.charCodeAt(0);
  // magic ustar\0 + version 00
  h.set(enc.encode("ustar\0"), 257);
  h.set(enc.encode("00"), 263);
  if (prefix) {
    h.set(enc.encode(prefix.slice(0, 155)), 345);
  }
  // calculate checksum
  for (let i = 148; i < 156; i++) h[i] = 32; // 8 spaces
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  const sumOctal = sum.toString(8).padStart(6, "0") + "\0 ";
  h.set(enc.encode(sumOctal), 148);
  return h;
}

function makePaxHeader(records) {
  let body = "";
  for (const [k, v] of Object.entries(records)) {
    const entryWithoutLen = ` ${k}=${v}\n`;
    let entryLen = new TextEncoder().encode(entryWithoutLen).length + 3;
    let line = `${entryLen}${entryWithoutLen}`;
    while (new TextEncoder().encode(line).length !== entryLen) {
      entryLen = new TextEncoder().encode(line).length;
      line = `${entryLen}${entryWithoutLen}`;
    }
    body += line;
  }
  const bodyBytes = new TextEncoder().encode(body);
  const header = makeTarHeader("PaxHeaders/pax", bodyBytes.length, "x");
  const padLen = (512 - (bodyBytes.length % 512)) % 512;
  const chunk = new Uint8Array(512 + bodyBytes.length + padLen);
  chunk.set(header, 0);
  chunk.set(bodyBytes, 512);
  return chunk;
}

function makeGnuLongname(longPath) {
  const enc = new TextEncoder();
  const bodyBytes = enc.encode(longPath + "\0");
  const header = makeTarHeader("././@LongLink", bodyBytes.length, "L");
  const padLen = (512 - (bodyBytes.length % 512)) % 512;
  const chunk = new Uint8Array(512 + bodyBytes.length + padLen);
  chunk.set(header, 0);
  chunk.set(bodyBytes, 512);
  return chunk;
}

function makeTarEntry(path, content, typeFlag = "0") {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const header = makeTarHeader(path, bytes.length, typeFlag);
  const padLen = (512 - (bytes.length % 512)) % 512;
  const entry = new Uint8Array(512 + bytes.length + padLen);
  entry.set(header, 0);
  entry.set(bytes, 512);
  return entry;
}

function makeTarArchive(entries) {
  const end = new Uint8Array(1024); // two 512 zero blocks
  const total = entries.reduce((acc, e) => acc + e.length, 0) + end.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const e of entries) {
    out.set(e, off);
    off += e.length;
  }
  out.set(end, off);
  return out;
}

function createReadable(uint8Array, chunkSize = 128) {
  let off = 0;
  return new ReadableStream({
    pull(controller) {
      if (off >= uint8Array.length) {
        controller.close();
        return;
      }
      const next = Math.min(uint8Array.length, off + chunkSize);
      controller.enqueue(uint8Array.subarray(off, next));
      off = next;
    }
  });
}

test("parseTarStream skips binary files and parses text without null padding", async () => {
  const binaryContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
  const textContent = "Hello world! No null padding should exist.";
  const tar = makeTarArchive([
    makeTarEntry("repo-main/image.png", binaryContent),
    makeTarEntry("repo-main/README.md", textContent)
  ]);
  const res = await parseTarStream(createReadable(tar));
  assert.equal(res.files.length, 1);
  assert.equal(res.files[0].path, "repo-main/README.md");
  assert.equal(res.files[0].text, textContent);
  assert.equal(res.files[0].sizeBytes, textContent.length);
  assert.equal(res.files[0].truncated, false);
});

test("parseTarStream correctly resolves PAX extended headers and Unicode paths", async () => {
  const unicodePath = "repo-main/docs/🚀-unicode-測試.md";
  const content = "# Unicode Test\nContent with emojis: 🦄";
  const pax = makePaxHeader({ path: unicodePath });
  const entry = makeTarEntry("repo-main/dummy.md", content);
  const tar = makeTarArchive([pax, entry]);
  const res = await parseTarStream(createReadable(tar));
  assert.equal(res.files.length, 1);
  assert.equal(res.files[0].path, unicodePath);
  assert.equal(res.files[0].text, content);
});

test("parseTarStream correctly resolves GNU LongLink headers", async () => {
  const longPath = "repo-main/" + "very/nested/sub/path/".repeat(5) + "long-named-file.ts";
  const content = "export const x = 42;";
  const gnu = makeGnuLongname(longPath);
  const entry = makeTarEntry("repo-main/short.ts", content);
  const tar = makeTarArchive([gnu, entry]);
  const res = await parseTarStream(createReadable(tar));
  assert.equal(res.files.length, 1);
  assert.equal(res.files[0].path, longPath);
  assert.equal(res.files[0].text, content);
});

test("parseTarStream handles directories and skipDirs", async () => {
  const tar = makeTarArchive([
    makeTarEntry("repo-main/node_modules/bad.js", "ignored"),
    makeTarEntry("repo-main/.git/config", "ignored"),
    makeTarEntry("repo-main/src/", new Uint8Array(0), "5"),
    makeTarEntry("repo-main/src/index.ts", "console.log(1);")
  ]);
  const res = await parseTarStream(createReadable(tar));
  assert.equal(res.files.length, 1);
  assert.equal(res.files[0].path, "repo-main/src/index.ts");
});

test("parseTarStream preserves 65k-character files and flags oversized files (>200k)", async () => {
  const text65k = "A".repeat(65000);
  const text250k = "B".repeat(250000);
  const tar = makeTarArchive([
    makeTarEntry("repo-main/big.md", text65k),
    makeTarEntry("repo-main/huge.md", text250k)
  ]);
  const res = await parseTarStream(createReadable(tar));
  assert.equal(res.files.length, 2);

  const big = res.files.find((f) => f.path === "repo-main/big.md");
  assert.ok(big);
  assert.equal(big.text.length, 65000);
  assert.equal(big.sizeBytes, 65000);
  assert.equal(big.truncated, false);

  const huge = res.files.find((f) => f.path === "repo-main/huge.md");
  assert.ok(huge);
  assert.equal(huge.text, "");
  assert.equal(huge.sizeBytes, 250000);
  assert.equal(huge.truncated, true);
});

test("parseTarStream honors maxFiles deterministically after sorting", async () => {
  const tar = makeTarArchive([
    makeTarEntry("repo-main/src/nested/deep/file.ts", "content"),
    makeTarEntry("repo-main/README.md", "special readme"),
    makeTarEntry("repo-main/src/a.ts", "content a")
  ]);
  const res = await parseTarStream(createReadable(tar), 1);
  assert.equal(res.files.length, 1);
  // SPECIAL files like README.md sort first
  assert.equal(res.files[0].path, "repo-main/README.md");
  assert.equal(res.truncated, true);
});

test("parseTarStream handles invalid/empty archive gracefully", async () => {
  const zeroBuf = new Uint8Array(1024);
  const res = await parseTarStream(createReadable(zeroBuf));
  assert.equal(res.files.length, 0);
  assert.equal(res.truncated, false);
});

test("fetchCorpus with mocked gzip network fetch handles 40-hex commit SHA and branch", async () => {
  const tarContent = makeTarArchive([
    makeTarEntry("repo-commit/index.js", "console.log('hi');")
  ]);
  const gzipped = zlib.gzipSync(tarContent);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes("api.github.com/repos/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          description: "mocked repo",
          stargazers_count: 10,
          language: "JavaScript",
          default_branch: "dev"
        })
      };
    }
    if (url.includes("codeload.github.com/")) {
      return {
        ok: true,
        status: 200,
        body: createReadable(gzipped)
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    const commitSha = "0123456789abcdef0123456789abcdef01234567";
    const result = await fetchCorpus("owner", "repo", 10, undefined, commitSha);
    assert.equal(result.ref, commitSha);
    assert.equal(result.meta.language, "JavaScript");
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, "repo-commit/index.js");

    const branchResult = await fetchCorpus("owner", "repo", 10, undefined, "my-feature-branch");
    assert.equal(branchResult.ref, "my-feature-branch");

    const defaultResult = await fetchCorpus("owner", "repo", 10, undefined, undefined);
    assert.equal(defaultResult.ref, "dev");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("rejects corrupt checksum",async()=>{const tar=makeTarArchive([makeTarEntry("repo/a.md","hello")]);tar[0]^=1;await assert.rejects(()=>parseTarStream(createReadable(tar)),/checksum/);});
test("rejects truncated payload",async()=>{const tar=makeTarArchive([makeTarEntry("repo/a.md","hello".repeat(1000))]);await assert.rejects(()=>parseTarStream(createReadable(tar.subarray(0,550))),/Truncated/);});
