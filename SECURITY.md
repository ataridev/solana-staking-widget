# Security Policy

## Model

`solana-staking-widget` is **non-custodial**. It builds native Stake Program transactions in the
browser and the user's wallet signs them. The widget never has access to private keys or seed
phrases and cannot move funds on its own. Staked SOL stays under the user's own stake/withdraw
authority.

The security boundary for any web3 dApp is the **wallet confirmation**: users should review every
transaction before signing.

## Hardening recommendations for integrators

- **Self-host** `@solana/web3.js`, the `buffer` polyfill, and `staking-widget.js` — do not depend on a
  third-party CDN at runtime, which would be a supply-chain risk for a transaction-signing UI.
- Serve over **HTTPS** with **HSTS**.
- Apply a strict **Content-Security-Policy** (e.g. `script-src 'self'`) to block injected scripts.
  Note: the widget injects its `<style>` at runtime; under a strict `style-src 'self'` include
  `staking-widget.css` yourself (see README → Content-Security-Policy).
- Keep your RPC key off the page by using one of the [proxy recipes](./proxy); restrict it to your
  origin and the method allowlist provided.
- Pin a specific widget version and review the single source file before deploying.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories
("Report a vulnerability" on the repo's **Security** tab) rather than opening a public issue.
We aim to acknowledge reports within a few days.
