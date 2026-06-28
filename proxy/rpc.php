<?php
/**
 * rpc.php — thin Solana JSON-RPC proxy for solana-staking-widget (PHP / shared hosting).
 *
 * Point the widget at this file:  <div data-sol-staking data-rpc="/rpc.php" ...>
 * It keeps your RPC API key server-side, restricts callers to your origin (so nobody
 * leeches your RPC credits), and allowlists only the methods the widget needs.
 *
 * Configure the endpoint via the SOLANA_RPC_ENDPOINT environment variable, or edit
 * the fallback constant below. Set ALLOWED_HOSTS to your domain(s).
 */

declare(strict_types=1);

$RPC_ENDPOINT = getenv('SOLANA_RPC_ENDPOINT')
    ?: 'https://api.mainnet-beta.solana.com'; // <-- replace with your provider URL (with key)

const ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'example.com', 'www.example.com']; // <-- your domain(s)

const ALLOWED_METHODS = [
    'getLatestBlockhash', 'getBalance', 'getEpochInfo', 'getAccountInfo', 'getMultipleAccounts',
    'getProgramAccounts', 'getMinimumBalanceForRentExemption', 'getStakeMinimumDelegation',
    'getSignatureStatuses', 'getFeeForMessage', 'getRecentPrioritizationFees', 'getSlot',
    'getBlockHeight', 'sendTransaction', 'simulateTransaction', 'isBlockhashValid',
];

const MAX_BODY_BYTES = 65536;
const MAX_BATCH = 10;

// Per-IP rate limit (defence in depth against RPC-credit abuse).
const RATE_MAX = 300;   // requests...
const RATE_WINDOW = 60; // ...per this many seconds

header('Content-Type: application/json; charset=utf-8');

$origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
$host = $origin !== '' ? (parse_url($origin, PHP_URL_HOST) ?? '') : '';
// Fail closed: require a present, allowlisted Origin/Referer. A bare request with
// neither header (e.g. curl leeching your RPC credits) is rejected, not allowed.
$originOk = in_array($host, ALLOWED_HOSTS, true);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($origin !== '' && $originOk) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

// CORS preflight: a cross-origin JSON POST (e.g. an embed on another domain) sends OPTIONS first.
if ($method === 'OPTIONS') {
    if ($originOk) {
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        // Reflect requested headers; web3.js sends Content-Type AND a `solana-client` header.
        header('Access-Control-Allow-Headers: ' . ($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? 'Content-Type, solana-client'));
        header('Access-Control-Max-Age: 86400');
    }
    http_response_code(204);
    exit;
}
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}
if (!$originOk) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden origin']);
    exit;
}
if (!rate_limit('rpc_' . client_ip(), RATE_MAX, RATE_WINDOW)) {
    http_response_code(429);
    header('Retry-After: ' . RATE_WINDOW);
    echo json_encode(['error' => 'Rate limit exceeded']);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '' || strlen($raw) > MAX_BODY_BYTES) {
    http_response_code(400);
    echo json_encode(['error' => 'Bad request body']);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

$calls = isset($payload['method']) ? [$payload] : $payload;
if (!is_array($calls) || count($calls) === 0 || count($calls) > MAX_BATCH) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON-RPC payload']);
    exit;
}
foreach ($calls as $call) {
    $method = is_array($call) ? ($call['method'] ?? null) : null;
    if (!is_string($method) || !in_array($method, ALLOWED_METHODS, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Method not allowed', 'method' => $method]);
        exit;
    }
}

$ch = curl_init($RPC_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $raw,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_TIMEOUT => 20,
]);
$resp = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($resp === false || $code < 200 || $code >= 300) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream RPC unavailable']);
    exit;
}

echo $resp;


/**
 * Best-effort client IP. Behind a reverse proxy (nginx, a CDN) REMOTE_ADDR is the
 * proxy itself, so only THEN do we trust the forwarded address — X-Forwarded-For
 * is client-supplied and must never be trusted from a public REMOTE_ADDR.
 */
function client_ip(): string
{
    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    $isLocalProxy = in_array($remote, ['127.0.0.1', '::1'], true);
    if ($isLocalProxy && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $first = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
        if ($first !== '') {
            return $first;
        }
    }
    return $remote !== '' ? $remote : 'unknown';
}

/**
 * Fixed-window rate limiter keyed by an arbitrary string. Returns true if within
 * budget, false if it should be rejected. Backed by a lock-protected temp file;
 * FAILS OPEN if the store is unwritable so a disk issue can't block real traffic.
 */
function rate_limit(string $key, int $max, int $window): bool
{
    $file = sys_get_temp_dir() . '/solwidget_rl_' . hash('sha256', $key) . '.json';
    $now  = time();
    $fh   = @fopen($file, 'c+');
    if ($fh === false) {
        return true;                                  // fail open
    }
    $allowed = true;
    if (flock($fh, LOCK_EX)) {
        $data = json_decode((string) stream_get_contents($fh), true);
        if (!is_array($data) || (int) ($data['start'] ?? 0) + $window <= $now) {
            $data = ['start' => $now, 'count' => 0];  // start a fresh window
        }
        $data['count']++;
        $allowed = $data['count'] <= $max;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($data));
        fflush($fh);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
    return $allowed;
}
