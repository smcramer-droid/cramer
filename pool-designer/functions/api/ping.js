// Diagnostic: GET /api/ping returns { ok: true } if Pages Functions are
// running at all. Useful for distinguishing "Functions not deployed"
// (response isn't JSON / HTTP 405) from "KV not bound" on the save path.
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    ok: true,
    kv: !!env.POOL_CONFIGS,
    ts: new Date().toISOString(),
  }), { headers: JSON_HEADERS });
}

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true, method: 'POST' }), { headers: JSON_HEADERS });
}
