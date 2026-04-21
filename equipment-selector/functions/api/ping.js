// Diagnostic endpoint: returns { ok: true } when the Functions bundle is
// wired up. The deploy workflow hits this after publish and fails loudly
// if it gets HTML back (meaning Functions didn't bundle).
export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
