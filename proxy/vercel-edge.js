/**
 * Vercel Edge Function — Solana JSON-RPC proxy for solana-staking-widget.
 *
 * Place at  api/rpc.js  in a Vercel project, then set the widget's data-rpc to "/api/rpc".
 * Keeps your RPC key server-side, restricts callers to your origin, and allowlists
 * only the methods the widget needs.
 *
 * Environment variables (Vercel project settings):
 *   SOLANA_RPC_ENDPOINT   your provider URL (with key)
 *   ALLOWED_ORIGINS       comma-separated, e.g. "https://example.com,https://www.example.com"
 */

export const config = { runtime: 'edge' };

const ALLOWED_METHODS = new Set([
  'getLatestBlockhash', 'getBalance', 'getEpochInfo', 'getAccountInfo', 'getMultipleAccounts',
  'getProgramAccounts', 'getMinimumBalanceForRentExemption', 'getStakeMinimumDelegation',
  'getSignatureStatuses', 'getFeeForMessage', 'getRecentPrioritizationFees', 'getSlot',
  'getBlockHeight', 'sendTransaction', 'simulateTransaction', 'isBlockhashValid',
]);

const MAX_BODY = 65536;
const MAX_BATCH = 10;

export default async function handler(request) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const originOk = !origin || !allowed.length || allowed.includes(origin);

  // CORS headers for allowed cross-origin callers (e.g. an embed on another domain).
  const cors = (origin && originOk) ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};

  // Preflight: a cross-origin JSON POST sends an OPTIONS request first.
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: originOk
        ? Object.assign({}, cors, {
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            // Reflect requested headers; web3.js sends Content-Type AND a `solana-client` header.
            'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type, solana-client',
            'Access-Control-Max-Age': '86400'
          })
        : {}
    });
  }

  if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
  if (!originOk) return json({ error: 'Forbidden origin' }, 403, cors);

  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY) return json({ error: 'Bad request body' }, 400, cors);

  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }

  const calls = Array.isArray(payload) ? payload : [payload];
  if (!calls.length || calls.length > MAX_BATCH) return json({ error: 'Invalid JSON-RPC payload' }, 400, cors);
  for (const c of calls) {
    if (!c || typeof c.method !== 'string' || !ALLOWED_METHODS.has(c.method)) {
      return json({ error: 'Method not allowed', method: c && c.method }, 403, cors);
    }
  }

  const upstream = await fetch(process.env.SOLANA_RPC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
  if (!upstream.ok) return json({ error: 'Upstream RPC unavailable' }, 502, cors);

  return new Response(await upstream.text(), { headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
}

function json(obj, status = 200, extra) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
}
