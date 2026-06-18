# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-06-17

### Added
- Initial release: drop-in native Solana staking widget (vanilla JS, no backend, no build step).
- Native staking: create stake account + delegate, deactivate (unstake), withdraw.
- Stake account list with live status (Activating / Active / Deactivating / Withdrawable).
- Wallet Standard auto-discovery (Phantom, Solflare, Backpack, Glow, OKX, …) with legacy fallback.
- Self-injected styles with a neutral monochrome `dark` / `light` theme (green/red kept for status), CSS-variable theming, and a runtime `setTheme()` switcher.
- Rewards preview, quick-amount chips, transaction confirmation via signature polling.
- `data-*` auto-mount API and `SolanaStakingWidget.mount()` programmatic API.
- RPC proxy recipes for PHP, Cloudflare Workers, and Vercel Edge.
- Self-contained `dist` bundle (vendored `@solana/web3.js` + Buffer polyfill) via `node build.js` — one file, no CDN, no Buffer setup.
- Standalone `staking-widget.css` and skippable style injection for strict `style-src` CSPs.
- `aria-live` status region and amount-input `aria-label` (accessibility).
- SSR-safe `window`/`document` guards; pure helpers exported for unit tests.
- Unit tests (`node test/run.js`) for base58, stake-status, and formatting helpers, wired into CI.
