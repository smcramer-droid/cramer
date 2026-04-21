// Cloudflare Pages Function: GET/PUT the shared equipment catalog.
//
// Storage: Cloudflare KV namespace bound as `CATALOG`.
// Auth:    PUT requests must send the `X-Edit-Token` header; its value
//          must match the `CATALOG_EDIT_TOKEN` env var (configured as a
//          Pages project secret).
//
// Shape: body is a JSON array matching the CATALOG shape in index.html.

const KEY = "catalog";

export async function onRequestGet({ env }) {
  if (!env.CATALOG) {
    return json({ error: "KV binding CATALOG not configured" }, 503);
  }
  const text = await env.CATALOG.get(KEY);
  // If nothing saved yet, return null so the client falls back to defaults.
  const body = text == null ? "null" : text;
  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestPut({ request, env }) {
  if (!env.CATALOG) {
    return json({ error: "KV binding CATALOG not configured" }, 503);
  }
  const expected = env.CATALOG_EDIT_TOKEN;
  if (!expected) {
    return json({ error: "CATALOG_EDIT_TOKEN not configured" }, 503);
  }
  const token = request.headers.get("X-Edit-Token");
  if (!token || token !== expected) {
    return json({ error: "forbidden" }, 403);
  }
  const text = await request.text();
  // Validate: must be a JSON array of {id, label, options[]} entries.
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

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, PUT, OPTIONS",
      "access-control-allow-headers": "content-type, x-edit-token",
      "access-control-max-age": "86400",
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
