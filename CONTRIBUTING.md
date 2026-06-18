# Contributing

Thanks for your interest in improving `solana-staking-widget`!

## Principles

- **No build step, no framework.** The widget is a single vanilla-JS file that runs as-is in the
  browser. Please keep it dependency-free (peer dep: `@solana/web3.js` v1 + a `Buffer` polyfill).
- **Non-custodial, auditable.** Keep the code readable and the surface small. No telemetry, no
  remote calls except the configured RPC endpoint.
- **Backwards compatible.** Don't break the `data-*` embed API without a major version bump.

## Dev setup

```bash
git clone https://github.com/ataridev/solana-staking-widget
cd solana-staking-widget
node --check src/staking-widget.js   # syntax check
node test/run.js                   # unit tests
node build.js                      # rebuild dist/ bundle
```

Open `examples/index.html` (via a local static server) to test in a browser with a real wallet.
Use `data-network="devnet"` and a devnet RPC to test the full stake → unstake → withdraw cycle
safely.

## Pull requests

1. Keep changes focused; one feature/fix per PR.
2. Match the existing code style (vanilla ES5-compatible, no transpilation).
3. Run `node --check src/staking-widget.js` and `node test/run.js` before pushing.
4. Describe how you tested (which wallets, mainnet/devnet).

## Good first issues

- More wallet icons / legacy fallbacks
- Internationalization (i18n)
- Liquid staking (LST) tab via spl-stake-pool
- Stake account split / merge / re-delegate
- Optional ESM build for bundler users
- Accessibility (ARIA, keyboard) improvements

By contributing you agree your work is licensed under the [MIT License](./LICENSE).
