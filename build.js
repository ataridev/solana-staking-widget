/**
 * build.js — produce a single self-contained bundle from vendored dependencies.
 *
 * Concatenates (in order) the Buffer polyfill, a global-Buffer shim, @solana/web3.js
 * (UMD), and the widget source into dist/solana-staking-widget.bundle.js. Each piece
 * communicates via window globals, so plain concatenation is sufficient — no bundler,
 * no network. Run with: node build.js
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const pkg = JSON.parse(read('package.json'));

const banner =
`/*!
 * solana-staking-widget ${pkg.version} — self-contained bundle
 * ${pkg.homepage || ''}
 * Released under the MIT License.
 *
 * Bundles, unmodified, their respective licenses apply:
 *   - @solana/web3.js (https://github.com/solana-labs/solana-web3.js)
 *   - buffer (https://github.com/feross/buffer)
 */
`;

const bufferShim = '\n;(function(){try{window.Buffer=window.Buffer||(window.buffer&&window.buffer.Buffer);}catch(e){}})();\n';

const parts = [
  banner,
  read('vendor/buffer.min.js'),
  bufferShim,
  read('vendor/solana-web3.iife.min.js'),
  '\n',
  read('src/staking-widget.js')
];

const out = parts.join('\n');
const outPath = path.join(root, 'dist', 'solana-staking-widget.bundle.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);

console.log('Wrote ' + path.relative(root, outPath) + ' (' + (out.length / 1024).toFixed(0) + ' KB)');
