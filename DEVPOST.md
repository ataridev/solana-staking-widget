# solana-staking-widget — Devpost submission

**Elevator pitch:** Add native Solana staking to any website with one `<div>` and one `<script>` — no backend, no build step, non-custodial.

## Inspiration
Validators want people to stake straight from their own site, but the existing embeddable widgets tend to require a backend service and a build pipeline just to render a "Stake" button. Most validator sites are plain static pages. We wanted the simplest possible drop-in: paste two lines and you're done — without running a server or trusting an opaque dependency tree with a transaction-signing UI.

## What it does
- Embeds a **non-custodial** native staking interface on any page.
- Connect wallet → enter an amount → delegate to a validator's vote account.
- Lists the user's stake accounts with live status (Activating / Active / Deactivating / Withdrawable), with **unstake** and **withdraw**.
- Auto-discovers wallets via **Wallet Standard** (Phantom, Solflare, Backpack, Glow, OKX, …) with a legacy fallback, showing each wallet's real icon.
- Builds native **Stake Program** transactions in the browser; the wallet signs them. Keys and funds never touch the widget — staked SOL stays under the user's own stake/withdraw authority.
- Theming via CSS variables (dark/light), an estimated-rewards preview, and self-injected styles.

## How we built it
- Vanilla JavaScript, essentially one file. `@solana/web3.js` (v1 UMD) for `StakeProgram` / `Connection` so it runs with no bundler.
- The Wallet Standard discovery handshake reimplemented **dependency-free** (no React, no `@wallet-standard/react`), normalizing Wallet-Standard and legacy wallets behind a single adapter.
- Transactions: `createAccount` + `delegate` / `deactivate` / `withdraw` with a priority fee; confirmation by **polling `getSignatureStatuses`** (no websocket), so an HTTP-only RPC proxy works.
- A **self-contained bundle** produced by concatenating vendored dependencies (web3.js + Buffer polyfill) with the widget — one file, no bundler, no CDN at runtime.
- RPC proxy recipes (PHP, Cloudflare Worker, Vercel Edge) to keep the provider key server-side and rate-limit callers by origin.

## Accomplishments that we're proud of
- A genuinely **zero-backend, zero-build** embed: two lines of HTML.
- **One auditable file** instead of a large dependency tree — a real security argument for a UI that signs transactions.
- Broad wallet coverage out of the box through Wallet Standard.

## What we learned
The gap between "works on my site" and a safe public package is mostly the unglamorous parts: supply-chain hygiene (self-host dependencies), CSP compatibility (injected styles), SSR guards, a base58 edge case, and accessibility.

## What's next
- Liquid staking (LST) tab via spl-stake-pool.
- ESM build for bundler users; a versioned CDN with SRI hashes.
- i18n, stake-account split/merge/re-delegate, and wider wallet testing.

## Built with
`javascript` `solana` `solana-web3.js` `wallet-standard` `html` `css` `cloudflare-workers` `php`

## Links
- GitHub: https://github.com/ataridev/solana-staking-widget
- Live demo: _(add your GitHub Pages URL)_
