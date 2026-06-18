/**
 * Cloudflare Worker — Solana JSON-RPC proxy for solana-staking-widget.
 *
 * Deploy this Worker and route it at e.g. https://yourdomain.com/rpc, then set
 * the widget's data-rpc to that path. Keeps your RPC key server-side, restricts
 * callers to your origin, and allowlists only the methods the widget needs.
 *
 * Set a secret with:  wrangler secret put SOLANA_RPC_ENDPOINT
 * Set ALLOWED_ORIGINS as a plain var (comma-separated) in your Worker settings.
 */

const ALLOWED_METHODS = new Set([
  'getLatestBlockhash', 'getBalance', 'getEpochInfo', 'getAccountInfo', 'getMultipleAccounts',
  'getProgramAccounts', 'getMinimumBalanceForRentExemption', 'getStakeMinimumDelegation',
  'getSignatureStatuses', 'getFeeForMessage', 'getRecentPrioritizationFees', 'getSlot',
  'getBlockHeight', 'sendTransaction', 'simulateTransaction', 'isBlockhashValid',
]);

const MAX_BODY = 65536;
const MAX_BATCH = 10;

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    if (origin && allowed.length && !allowed.includes(origin)) {
      return json({ error: 'Forbidden origin' }, 403);
    }

    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY) return json({ error: 'Bad request body' }, 400);

    let payload;
    try { payload = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const calls = Array.isArray(payload) ? payload : [payload];
    if (!calls.length || calls.length > MAX_BATCH) return json({ error: 'Invalid JSON-RPC payload' }, 400);
    for (const c of calls) {
      if (!c || typeof c.method !== 'string' || !ALLOWED_METHODS.has(c.method)) {
        return json({ error: 'Method not allowed', method: c && c.method }, 403);
      }
    }

    const upstream = await fetch(env.SOLANA_RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    });
    if (!upstream.ok) return json({ error: 'Upstream RPC unavailable' }, 502);

    const headers = { 'Content-Type': 'application/json' };
    if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }
    return new Response(await upstream.text(), { headers });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
