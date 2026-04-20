// GET  /api/configs            — list all saved configs (slug + name + createdAt)
// POST /api/configs            — save a new config. Body: { name, state }.
//                                 Auto-appends v2/v3/... when the name already exists.
// Binding: env.POOL_CONFIGS (KV namespace, configured via setup-kv workflow)
const PREFIX = 'cfg:';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function slugify(s) {
  return (s || 'pool').toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'pool';
}

export async function onRequestGet({ env }) {
  if (!env.POOL_CONFIGS) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), { status: 500, headers: JSON_HEADERS });
  }
  const list = await env.POOL_CONFIGS.list({ prefix: PREFIX });
  const items = await Promise.all(list.keys.map(async (k) => {
    const raw = await env.POOL_CONFIGS.get(k.name);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return {
        slug: k.name.slice(PREFIX.length),
        name: v.name || v.versionedName || '',
        versionedName: v.versionedName || v.name || '',
        createdAt: v.createdAt || null,
      };
    } catch {
      return null;
    }
  }));
  const clean = items.filter(Boolean)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return new Response(JSON.stringify(clean), { headers: JSON_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (!env.POOL_CONFIGS) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), { status: 500, headers: JSON_HEADERS });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: JSON_HEADERS });
  }
  const name = (body && body.name ? String(body.name) : '').trim();
  if (!name) {
    return new Response(JSON.stringify({ error: 'name is required' }), { status: 400, headers: JSON_HEADERS });
  }
  const state = (body && body.state) ? body.state : {};
  // Resolve versioned slug: if "pool-a" exists, try "pool-a-v2", "pool-a-v3", ...
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let version = 1;
  let versionedName = name;
  // cap iterations defensively
  for (let i = 0; i < 200; i++) {
    const existing = await env.POOL_CONFIGS.get(PREFIX + slug);
    if (existing === null) break;
    version++;
    slug = `${baseSlug}-v${version}`;
    versionedName = `${name} v${version}`;
  }
  const record = {
    name,
    versionedName,
    slug,
    state,
    createdAt: new Date().toISOString(),
  };
  await env.POOL_CONFIGS.put(PREFIX + slug, JSON.stringify(record));
  return new Response(JSON.stringify({ ok: true, slug, versionedName, createdAt: record.createdAt }),
    { headers: JSON_HEADERS });
}
