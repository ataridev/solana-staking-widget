# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-06-28

### Security
- Widget: render the wallet-supplied icon via an `img.src` property and the wallet
  name via `textContent` instead of `innerHTML` string concatenation, closing an
  attribute-breakout XSS (`data:image/png" onerror=…`) that slipped past the
  prefix-only `data:image/` check.
- Proxies: reject requests that carry no `Origin`/`Referer` (previously allowed
  through), so the proxy can no longer be used as an open relay to your RPC key.

### Added
- PHP proxy: per-IP fixed-window rate limit (`429` + `Retry-After`), with a
  reverse-proxy-aware `client_ip()` that trusts `X-Forwarded-For` only behind a
  loopback proxy. Tune via `RATE_MAX` / `RATE_WINDOW`.
- Supply-chain guard: `vendor/checksums.json` pins the SHA-256 of the vendored
  `@solana/web3.js` and Buffer blobs; `build.js` verifies them before bundling
  (and fails CI on mismatch).

### Changed
- **Breaking (misconfigured deploys):** the Cloudflare Worker and Vercel Edge
  proxies now **fail closed** — if `ALLOWED_ORIGINS` is unset they reject every
  request instead of allowing all origins. Set `ALLOWED_ORIGINS` to your domain(s)
  to restore service. Rate limiting for the edge proxies is delegated to the
  platform (Cloudflare Rate Limiting Rules / Vercel WAF), documented in each file.

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
