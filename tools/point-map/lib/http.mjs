// lib/http.mjs
// Shared HTTP helpers for the new/redesigned routes: a bounded-size JSON body
// reader (read as a byte-limited stream before JSON.parse, never
// `await req.text()` unbounded) and a consistent error-response shape with
// no stack traces leaked to the client.

export class ApiError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.extra = extra || undefined;
  }
}

export function jsonResponse(data, status = 200, extra) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

/** Consistent {error:{...}} shape for 422/413/409/502 (and anything else
 *  thrown as ApiError). Never includes a stack trace. */
export function errorResponse(err) {
  if (err instanceof ApiError) {
    return jsonResponse({ error: { status: err.status, message: err.message, ...(err.extra || {}) } }, err.status);
  }
  // Unexpected/unclassified error: surface a generic 500 without the stack.
  return jsonResponse({ error: { status: 500, message: "internal error" } }, 500);
}

/**
 * Read a Request body as JSON, enforcing a hard byte cap BEFORE JSON.parse
 * ever sees the full string. Guards against unbounded `await req.text()` /
 * `await req.json()` memory exhaustion (see workers-best-practices).
 * Throws ApiError(413) if the body exceeds maxBytes, ApiError(400) if the
 * body isn't valid JSON.
 */
export async function readJsonLimited(req, maxBytes = 8 * 1024 * 1024) {
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best-effort */ }
        throw new ApiError(413, `request body exceeds ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "failed to read request body: " + (e?.message || String(e)));
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  const text = new TextDecoder("utf-8").decode(buf);
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ApiError(400, "invalid JSON body: " + (e?.message || String(e)));
  }
}
