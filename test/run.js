/**
 * Minimal dependency-free unit tests for the widget's pure helpers.
 * Run with: node test/run.js  (or npm test)
 */
const assert = require('assert');
const w = require('../src/staking-widget.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + ' — ' + e.message); process.exitCode = 1; }
}

/* base58 */
test('base58 empty', () => assert.strictEqual(w.base58(new Uint8Array([])), ''));
test('base58 [0]', () => assert.strictEqual(w.base58(Uint8Array.from([0])), '1'));
test('base58 [0,0]', () => assert.strictEqual(w.base58(Uint8Array.from([0, 0])), '11'));
test('base58 [1]', () => assert.strictEqual(w.base58(Uint8Array.from([1])), '2'));
test('base58 [255]', () => assert.strictEqual(w.base58(Uint8Array.from([255])), '5Q'));
test('base58 leading zero', () => assert.strictEqual(w.base58(Uint8Array.from([0, 1])), '12'));

/* stakeStatus */
const MAX = '18446744073709551615';
test('status undelegated', () => assert.strictEqual(w.stakeStatus({}, 10), 'inactive'));
test('status null epoch', () => assert.strictEqual(w.stakeStatus({ stake: { delegation: { activationEpoch: '1', deactivationEpoch: MAX } } }, null), 'active'));
test('status active', () => assert.strictEqual(w.stakeStatus({ stake: { delegation: { activationEpoch: '10', deactivationEpoch: MAX } } }, 20), 'active'));
test('status activating', () => assert.strictEqual(w.stakeStatus({ stake: { delegation: { activationEpoch: '20', deactivationEpoch: MAX } } }, 20), 'activating'));
test('status deactivating', () => assert.strictEqual(w.stakeStatus({ stake: { delegation: { activationEpoch: '5', deactivationEpoch: '25' } } }, 20), 'deactivating'));
test('status withdrawable', () => assert.strictEqual(w.stakeStatus({ stake: { delegation: { activationEpoch: '5', deactivationEpoch: '15' } } }, 20), 'inactive'));

/* trimAmount */
test('trimAmount truncates', () => assert.strictEqual(w.trimAmount(1.23456789), '1.2345'));
test('trimAmount zero', () => assert.strictEqual(w.trimAmount(0), '0'));
test('trimAmount negative', () => assert.strictEqual(w.trimAmount(-3), '0'));

/* escapeHtml */
test('escapeHtml', () => assert.strictEqual(w.escapeHtml('<b>"x"&\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;'));

/* statusLabel */
test('statusLabel', () => assert.strictEqual(w.statusLabel('active'), 'Active'));

console.log('\n' + passed + ' passed' + (process.exitCode ? ', with failures' : ''));
