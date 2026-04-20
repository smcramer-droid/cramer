// GET    /api/configs/:slug   — load one saved config
// DELETE /api/configs/:slug   — delete it
const PREFIX = 'cfg:';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export async function onRequestGet({ env, params }) {
  if (!env.POOL_CONFIGS) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), { status: 500, headers: JSON_HEADERS });
  }
  const slug = String(params.slug || '').toLowerCase();
  if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), { status: 400, headers: JSON_HEADERS });
  const raw = await env.POOL_CONFIGS.get(PREFIX + slug);
  if (!raw) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: JSON_HEADERS });
  return new Response(raw, { headers: JSON_HEADERS });
}

export async function onRequestDelete({ env, params }) {
  if (!env.POOL_CONFIGS) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), { status: 500, headers: JSON_HEADERS });
  }
  const slug = String(params.slug || '').toLowerCase();
  if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), { status: 400, headers: JSON_HEADERS });
  await env.POOL_CONFIGS.delete(PREFIX + slug);
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
}
