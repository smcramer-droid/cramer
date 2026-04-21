// Cloudflare Pages Function: GET/PUT the shared equipment catalog.
//
// Storage: Cloudflare KV namespace bound as `CATALOG`.
// Auth:    PUT requests must send the `X-Edit-Token` header; its value
//          must match the `CATALOG_EDIT_TOKEN` env var.
//
// Body shape for PUT: JSON array matching the CATALOG shape in index.html.
//
// Uses a single `onRequest` handler that dispatches on request.method so
// Cloudflare's Pages routing can't silently drop a method-specific handler.

const KEY = "catalog";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "content-type, x-edit-token",
};

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, "access-control-max-age": "86400" },
    });
  }

  if (method === "GET") return handleGet(env);
  if (method === "PUT") return handlePut(request, env);

  return json({ error: "method not allowed", method }, 405, {
    allow: "GET, PUT, OPTIONS",
  });
}

async function handleGet(env) {
  if (!env.CATALOG) {
    return json({ error: "KV binding CATALOG not configured" }, 503);
  }
  const text = await env.CATALOG.get(KEY);
  const body = text == null ? "null" : text;
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS,
    },
  });
}

async function handlePut(request, env) {
  if (!env.CATALOG) {
    return json({ error: "KV binding CATALOG not configured" }, 503);
  }
  const expected = env.CATALOG_EDIT_TOKEN;
  if (!expected) {
    return json({ error: "CATALOG_EDIT_TOKEN not configured" }, 503);
  }
  const token = request.headers.get("X-Edit-Token") || request.headers.get("x-edit-token");
  if (!token || token !== expected) {
    return json({ error: "forbidden" }, 403);
  }

  const text = await request.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!Array.isArray(parsed)) {
    return json({ error: "catalog must be an array" }, 400);
  }
  for (const cat of parsed) {
    if (!cat || typeof cat !== "object") return json({ error: "invalid category entry" }, 400);
    if (!cat.id || !cat.label || !Array.isArray(cat.options)) {
      return json({ error: "category missing id/label/options" }, 400);
    }
  }

  await env.CATALOG.put(KEY, text);
  return json({ ok: true, savedAt: new Date().toISOString() });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS,
      ...extraHeaders,
    },
  });
}
