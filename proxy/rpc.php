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

header('Content-Type: application/json; charset=utf-8');

$origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
$host = $origin !== '' ? (parse_url($origin, PHP_URL_HOST) ?? '') : '';
$originOk = ($host === '' || in_array($host, ALLOWED_HOSTS, true));
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($origin !== '' && $originOk) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

// CORS preflight: a cross-origin JSON POST (e.g. an embed on another domain) sends OPTIONS first.
if ($method === 'OPTIONS') {
    if ($originOk) {
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
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
