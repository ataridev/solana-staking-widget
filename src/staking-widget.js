/**
 * solana-staking-widget — drop-in native Solana staking for any website.
 *
 * Builds native Stake Program transactions (create + delegate / deactivate / withdraw)
 * in the browser with @solana/web3.js and signs them in the user's wallet. No backend
 * transaction builder; point it at an RPC endpoint (ideally a thin proxy that hides your
 * API key — see /proxy recipes). Non-custodial: the widget never holds keys or funds.
 *
 * Embed (auto-mount) — one self-contained bundle:
 *   <div data-sol-staking data-vote="VOTE_ACCOUNT" data-rpc="/rpc" data-theme="dark"></div>
 *   <script src="solana-staking-widget.bundle.js"></script>
 *
 * Or load the dependencies yourself, then this source (order: buffer, web3.js, widget):
 *   <script src="buffer.min.js"></script>
 *   <script>window.Buffer = window.Buffer || buffer.Buffer;</script>
 *   <script src="solana-web3.iife.min.js"></script>
 *   <script src="staking-widget.js"></script>
 *
 * Or programmatically:
 *   SolanaStakingWidget.mount(el, { vote: '...', rpc: '/rpc', theme: 'dark' });
 *
 * Options (data-* attribute / JS key):
 *   data-vote          / vote           required — validator vote account (base58)
 *   data-rpc           / rpc            RPC URL (default: https://api.mainnet-beta.solana.com)
 *   data-network       / network        'mainnet' | 'devnet' (chain hint for Wallet Standard)
 *   data-theme         / theme          'dark' (default) | 'light'
 *   data-apy           / apy            number, for the rewards preview (default 5)
 *   data-validator-name/ validatorName  label shown in the accounts list (default 'this validator')
 *   data-explorer      / explorer       'solscan' (default) | 'solanafm' | 'explorer'
 *
 * MIT License.
 */
(function () {
  'use strict';

  var web3 = (typeof window !== 'undefined') ? window.solanaWeb3 : undefined;

  var boundKeys = new WeakSet();

  var LAMPORTS = 1e9;
  var STAKE_SPACE = 200;
  var MAXU64 = '18446744073709551615';
  var FEE_BUFFER_SOL = 0.01;
  var PRIORITY_MICROLAMPORTS = 20000;
  var CONFIRM_INTERVAL_MS = 2000;
  var CONFIRM_MAX_TRIES = 45;
  var OFFSET_WITHDRAWER = 44;
  var OFFSET_VOTER = 124;

  /* ----------------------------- styles ----------------------------- */

  var STYLE_ID = 'sol-staking-widget-styles';
  var CSS = [
    '.sw-stake{',
    '  --sw-bg:#0b0b0c;--sw-surface:#141416;--sw-surface-2:#1c1c1f;',
    '  --sw-line:rgba(255,255,255,.10);--sw-line-strong:rgba(255,255,255,.22);',
    '  --sw-text:#fafafa;--sw-muted:#a0a0a8;--sw-muted-2:#6b6b73;',
    '  --sw-accent:#ffffff;--sw-on-accent:#0a0a0a;',
    '  --sw-ring:rgba(255,255,255,.18);--sw-hover:rgba(255,255,255,.06);',
    '  --sw-green:#3ecf8e;--sw-red:#ff6369;',
    '  --sw-radius:14px;--sw-radius-sm:12px;',
    '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;',
    '  font-size:15px;color:var(--sw-text);line-height:1.5;animation:sw-fade .35s ease both;}',
    '.sw-stake[data-theme="light"]{',
    '  --sw-bg:#ffffff;--sw-surface:#f7f7f8;--sw-surface-2:#efeff1;',
    '  --sw-line:rgba(0,0,0,.10);--sw-line-strong:rgba(0,0,0,.18);',
    '  --sw-text:#0b0b0c;--sw-muted:#52525b;--sw-muted-2:#8a8a93;',
    '  --sw-accent:#0a0a0a;--sw-on-accent:#ffffff;',
    '  --sw-ring:rgba(0,0,0,.16);--sw-hover:rgba(0,0,0,.05);',
    '  --sw-green:#16a34a;--sw-red:#dc2626;}',
    '@keyframes sw-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '@keyframes sw-spin{to{transform:rotate(360deg)}}',
    '.sw-stake *{box-sizing:border-box}',
    '.sw-stake .sw-btn{position:relative;cursor:pointer;font-weight:600;font-size:15px;border:none;border-radius:999px;padding:13px 22px;transition:transform .15s,opacity .2s,background .2s,border-color .2s,color .2s}',
    '.sw-stake .sw-btn:active{transform:translateY(1px)}',
    '.sw-stake .sw-btn[disabled]{opacity:.5;cursor:not-allowed;transform:none}',
    '.sw-stake .sw-btn-primary{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:4px;color:var(--sw-on-accent);background:var(--sw-accent)}',
    '.sw-stake .sw-btn-primary:hover{opacity:.9;transform:translateY(-1px)}',
    '.sw-stake .sw-btn-ghost{color:var(--sw-text);background:var(--sw-surface-2);border:1px solid var(--sw-line-strong);padding:9px 18px;font-size:14px}',
    '.sw-stake .sw-btn-ghost:hover{border-color:var(--sw-line-strong);background:var(--sw-hover)}',
    '.sw-stake .sw-connect{margin-bottom:8px}',
    '.sw-stake .sw-connect-hint{color:var(--sw-muted);margin-bottom:16px}',
    '.sw-stake .sw-wallet-row{display:flex;gap:12px;flex-wrap:wrap}',
    '.sw-stake .sw-btn-wallet{display:flex;align-items:center;justify-content:center;gap:9px;flex:1 1 0;min-width:150px;color:var(--sw-text);background:var(--sw-surface-2);border:1px solid var(--sw-line-strong)}',
    '.sw-stake .sw-btn-wallet:hover{border-color:var(--sw-line-strong);background:var(--sw-hover);transform:translateY(-2px)}',
    '.sw-stake .sw-btn-wallet svg{width:18px;height:18px;flex:none}',
    '.sw-stake .sw-btn-wallet img{width:18px;height:18px;border-radius:5px;flex:none}',
    '.sw-stake .sw-no-wallet{color:var(--sw-muted);background:var(--sw-surface-2);border:1px solid var(--sw-line);border-radius:var(--sw-radius-sm);padding:16px 18px}',
    '.sw-stake .sw-no-wallet a,.sw-stake .sw-status a{color:var(--sw-text);text-decoration:underline;text-underline-offset:3px}',
    '.sw-stake .sw-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}',
    '.sw-stake .sw-wallet-info{display:inline-flex;align-items:center;gap:9px;font-size:14px;color:var(--sw-text);background:var(--sw-surface-2);border:1px solid var(--sw-line);border-radius:999px;padding:6px 14px}',
    '.sw-stake .sw-wallet-info img{width:16px;height:16px;border-radius:4px;flex:none}',
    '.sw-stake .sw-wallet-info svg{width:15px;height:15px;flex:none;color:var(--sw-muted)}',
    '.sw-stake .sw-wi-addr{color:var(--sw-muted)}',
    '.sw-stake .sw-wi-copy{display:inline-flex;align-items:center;cursor:pointer;background:none;border:none;padding:0;margin-left:2px;color:var(--sw-muted-2)}',
    '.sw-stake .sw-wi-copy:hover{color:var(--sw-text)}',
    '.sw-stake .sw-wi-copy svg{width:14px;height:14px}',
    '.sw-stake .sw-link{cursor:pointer;background:none;border:none;color:var(--sw-muted);font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:3px}',
    '.sw-stake .sw-link:hover{color:var(--sw-text)}',
    '.sw-stake .sw-balance{position:relative;overflow:hidden;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;margin-bottom:12px;border-radius:var(--sw-radius-sm);background:var(--sw-surface-2);border:1px solid var(--sw-line);color:var(--sw-muted);font-size:13px}',
    '.sw-stake .sw-balance::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--sw-accent)}',
    '.sw-stake .sw-balance-val{font-weight:700;font-size:17px;color:var(--sw-text)}',
    '.sw-stake .sw-field{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:var(--sw-radius-sm);background:var(--sw-surface-2);border:1px solid var(--sw-line-strong);transition:border-color .2s,box-shadow .2s}',
    '.sw-stake .sw-field:focus-within{border-color:var(--sw-accent);box-shadow:0 0 0 3px var(--sw-ring)}',
    '.sw-stake .sw-amount{flex:1;min-width:0;background:none;border:none;outline:none;color:var(--sw-text);font-weight:700;font-size:26px;-moz-appearance:textfield}',
    '.sw-stake .sw-amount::placeholder{color:var(--sw-muted-2)}',
    '.sw-stake .sw-amount::-webkit-outer-spin-button,.sw-stake .sw-amount::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
    '.sw-stake .sw-unit{color:var(--sw-muted);font-weight:600;font-size:15px}',
    '.sw-stake .sw-chips{display:flex;gap:8px;margin-top:10px}',
    '.sw-stake .sw-chip{flex:1;cursor:pointer;font-weight:600;font-size:12.5px;color:var(--sw-muted);background:var(--sw-surface-2);border:1px solid var(--sw-line);border-radius:8px;padding:8px 0;transition:border-color .15s,color .15s,background .15s}',
    '.sw-stake .sw-chip:hover{color:var(--sw-text);border-color:var(--sw-line-strong);background:var(--sw-hover)}',
    '.sw-stake .sw-est{margin:12px 2px 16px;font-size:13px;color:var(--sw-muted);display:flex;align-items:center;gap:7px}',
    '.sw-stake .sw-est b{color:var(--sw-green);font-weight:600;font-variant-numeric:tabular-nums}',
    '.sw-stake .sw-status{margin-top:14px;margin-bottom:6px;padding:12px 14px;border-radius:var(--sw-radius-sm);font-size:14px;line-height:1.5;display:flex;align-items:center;gap:10px}',
    '.sw-stake .sw-pending{color:var(--sw-muted);background:var(--sw-surface-2);border:1px solid var(--sw-line)}',
    '.sw-stake .sw-pending::before{content:"";width:16px;height:16px;flex:none;border-radius:50%;border:2px solid var(--sw-line-strong);border-top-color:var(--sw-accent);animation:sw-spin .7s linear infinite}',
    '.sw-stake .sw-success{color:var(--sw-green);background:var(--sw-surface-2);border:1px solid var(--sw-line)}',
    '.sw-stake .sw-success::before{content:"\\2713";flex:none;font-weight:700}',
    '.sw-stake .sw-error{color:var(--sw-red);background:var(--sw-surface-2);border:1px solid var(--sw-line)}',
    '.sw-stake .sw-error::before{content:"!";flex:none;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid currentColor;font-weight:700;font-size:11px}',
    '.sw-stake .sw-accounts{margin-top:24px}',
    '.sw-stake .sw-accounts-title{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--sw-muted-2);margin-bottom:12px}',
    '.sw-stake .sw-acc{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:var(--sw-radius-sm);background:var(--sw-surface-2);border:1px solid var(--sw-line);margin-bottom:10px;transition:transform .2s,border-color .2s}',
    '.sw-stake .sw-acc:hover{transform:translateY(-2px);border-color:var(--sw-line-strong)}',
    '.sw-stake .sw-acc-amt{font-weight:600;font-size:16px;color:var(--sw-text)}',
    '.sw-stake .sw-acc-meta{font-size:12.5px;color:var(--sw-muted-2);margin-top:5px;display:flex;align-items:center;gap:8px}',
    '.sw-stake .sw-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:var(--sw-surface);border:1px solid var(--sw-line)}',
    '.sw-stake .sw-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}',
    '.sw-stake .sw-badge.sw-active{color:var(--sw-green)}',
    '.sw-stake .sw-badge.sw-activating{color:var(--sw-muted)}',
    '.sw-stake .sw-badge.sw-deactivating{color:var(--sw-muted-2)}',
    '.sw-stake .sw-badge.sw-inactive{color:var(--sw-text)}',
    '.sw-stake .sw-acc-wait{font-size:13px;color:var(--sw-muted-2)}',
    '@media (prefers-reduced-motion:reduce){.sw-stake,.sw-stake *{animation:none!important}}'
  ].join('\n');

  function injectStyles() {
    if (typeof document === 'undefined') return;
    // Skip if the integrator pre-included the stylesheet (e.g. <link id="sol-staking-widget-styles">
    // to satisfy a strict CSP) or opted out via window.SolanaStakingWidgetNoAutoStyle.
    if (window.SolanaStakingWidgetNoAutoStyle || document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ----------------------------- DOM helpers ----------------------------- */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function fmtSol(lamports, dp) {
    return (Number(lamports) / LAMPORTS).toLocaleString('en-US', { maximumFractionDigits: dp == null ? 4 : dp });
  }
  function shorten(addr) { return addr.slice(0, 4) + '…' + addr.slice(-4); }
  function trimAmount(v) { return v > 0 ? String(Math.floor(v * 1e4) / 1e4) : '0'; }

  var EXPLORERS = {
    solscan: 'https://solscan.io/tx/',
    solanafm: 'https://solana.fm/tx/',
    explorer: 'https://explorer.solana.com/tx/'
  };

  var WALLET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h15"/><circle cx="17.5" cy="14" r="1.3" fill="currentColor" stroke="none"/></svg>';
  var LOCK_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  var COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  var CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  /* ----------------------------- base58 ----------------------------- */

  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function base58(bytes) {
    if (!bytes || !bytes.length) return '';
    var digits = [];
    for (var i = 0; i < bytes.length; i++) {
      var carry = bytes[i];
      for (var j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
      while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    var out = '';
    for (var k = 0; k < bytes.length && bytes[k] === 0; k++) out += '1';
    for (var q = digits.length - 1; q >= 0; q--) out += B58[digits[q]];
    return out;
  }

  /* ----------------------------- wallet discovery ----------------------------- */

  var standardWallets = [];
  var standardChangeCbs = [];
  var handshakeStarted = false;

  function onStandardChange(cb) { standardChangeCbs.push(cb); }
  function notifyStandardChange() { standardChangeCbs.forEach(function (cb) { try { cb(); } catch (e) {} }); }

  function initStandard() {
    if (handshakeStarted) return;
    handshakeStarted = true;
    var api = {
      register: function () {
        var added = false;
        for (var i = 0; i < arguments.length; i++) {
          var w = arguments[i];
          if (w && standardWallets.indexOf(w) === -1) { standardWallets.push(w); added = true; }
        }
        if (added) notifyStandardChange();
        return function () {};
      }
    };
    try {
      window.addEventListener('wallet-standard:register-wallet', function (e) {
        try { if (typeof e.detail === 'function') e.detail(api); } catch (err) {}
      });
      var ping = function () { try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api })); } catch (e) {} };
      ping(); setTimeout(ping, 0); setTimeout(ping, 400); setTimeout(ping, 1200);
    } catch (e) {}
  }

  function isSolanaStandard(w) {
    if (!w || !w.features) return false;
    var hasConnect = !!w.features['standard:connect'];
    var canSign = !!(w.features['solana:signTransaction'] || w.features['solana:signAndSendTransaction']);
    var solChain = (w.chains || []).some(function (c) { return c.indexOf('solana:') === 0; });
    return hasConnect && canSign && solChain;
  }
  function pickChain(w, network) {
    var want = network === 'devnet' ? 'solana:devnet' : 'solana:mainnet';
    var chains = w.chains || [];
    if (chains.indexOf(want) !== -1) return want;
    for (var i = 0; i < chains.length; i++) if (chains[i].indexOf('solana:') === 0) return chains[i];
    return want;
  }
  function pickSolanaAccount(accs) {
    for (var i = 0; i < accs.length; i++) {
      var ch = accs[i].chains || [];
      if (ch.some(function (c) { return c.indexOf('solana:') === 0; })) return accs[i];
    }
    return accs[0];
  }

  function standardAdapter(w, network) {
    var account = null;
    var chain = pickChain(w, network);
    return {
      name: w.name,
      icon: (w.icon && /^data:image\//.test(w.icon)) ? w.icon : null,
      key: w,
      connect: function () {
        return w.features['standard:connect'].connect().then(function (res) {
          var accs = (res && res.accounts) || w.accounts || [];
          account = pickSolanaAccount(accs);
          if (!account) throw new Error('Wallet returned no account.');
          return new web3.PublicKey(account.address);
        });
      },
      signAndSend: function (tx, connection) {
        var bytes = new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
        var stf = w.features['solana:signTransaction'];
        if (stf) {
          return stf.signTransaction({ account: account, transaction: bytes, chain: chain }).then(function (out) {
            var signed = (out && out[0] && out[0].signedTransaction) || (out && out.signedTransaction);
            return connection.sendRawTransaction(signed, { skipPreflight: false });
          });
        }
        var ssf = w.features['solana:signAndSendTransaction'];
        return ssf.signAndSendTransaction({ account: account, transaction: bytes, chain: chain }).then(function (out) {
          var sig = (out && out[0] && out[0].signature) || (out && out.signature);
          return base58(sig);
        });
      },
      disconnect: function () { var d = w.features['standard:disconnect']; try { if (d) d.disconnect(); } catch (e) {} },
      onChange: function (cb) {
        var ev = w.features['standard:events'];
        if (ev && ev.on) {
          try {
            ev.on('change', function (props) {
              if (!props || !props.accounts) return;
              if (props.accounts.length === 0) { cb(); return; }
              if (account && !props.accounts.some(function (a) { return a.address === account.address; })) cb();
            });
          } catch (e) {}
        }
      }
    };
  }

  function legacyAdapter(name, provider) {
    return {
      name: name, icon: null, key: provider,
      connect: function () {
        return provider.connect().then(function (res) {
          var pk = (res && res.publicKey) || provider.publicKey;
          if (!pk) throw new Error('Wallet did not return a public key.');
          return new web3.PublicKey(pk.toString());
        });
      },
      signAndSend: function (tx, connection) {
        return provider.signTransaction(tx).then(function (signed) {
          return connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
        });
      },
      disconnect: function () { try { if (provider.disconnect) provider.disconnect(); } catch (e) {} },
      onChange: function (cb) { if (provider.on) { try { provider.on('disconnect', cb); } catch (e) {} } }
    };
  }

  function detectLegacy() {
    var found = [];
    var phantom = (window.phantom && window.phantom.solana) || (window.solana && window.solana.isPhantom ? window.solana : null);
    if (phantom) found.push({ name: 'Phantom', provider: phantom });
    if (window.solflare && window.solflare.isSolflare) found.push({ name: 'Solflare', provider: window.solflare });
    if (window.backpack) found.push({ name: 'Backpack', provider: window.backpack });
    if (window.glowSolana || window.glow) found.push({ name: 'Glow', provider: window.glowSolana || window.glow });
    if (window.okxwallet && window.okxwallet.solana) found.push({ name: 'OKX', provider: window.okxwallet.solana });
    if (window.coinbaseSolana) found.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    if (window.trustwallet && window.trustwallet.solana) found.push({ name: 'Trust', provider: window.trustwallet.solana });
    return found;
  }

  function listWallets(network) {
    initStandard();
    var adapters = [];
    var seen = {};
    standardWallets.filter(isSolanaStandard).forEach(function (w) {
      var key = w.name.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      adapters.push(standardAdapter(w, network));
    });
    detectLegacy().forEach(function (lw) {
      if (!seen[lw.name.toLowerCase()]) adapters.push(legacyAdapter(lw.name, lw.provider));
    });
    return adapters;
  }

  if (typeof window !== 'undefined') initStandard();

  /* ----------------------------- widget ----------------------------- */

  function Widget(root, opts) {
    injectStyles();
    this.root = root;
    this.vote = new web3.PublicKey(opts.vote);
    this.network = opts.network === 'devnet' ? 'devnet' : 'mainnet';
    this.rpcUrl = new URL(opts.rpc || 'https://api.mainnet-beta.solana.com', window.location.href).toString();
    this.connection = new web3.Connection(this.rpcUrl, 'confirmed');
    this.apy = Number(opts.apy) || 5;
    this.validatorName = opts.validatorName || 'this validator';
    this.theme = opts.theme === 'light' ? 'light' : 'dark';
    this.explorerBase = EXPLORERS[opts.explorer] || EXPLORERS.solscan;
    this.wallet = null;
    this.walletName = null;
    this.walletIcon = null;
    this.pubkey = null;
    this.balanceLamports = 0;
    this.epoch = null;
    this.accounts = [];
    this.busy = false;
    var self = this;
    onStandardChange(function () { if (!self.pubkey) self.render(); });
    this.render();
    this.refreshEpoch();
  }

  var P = Widget.prototype;

  P.explorerTx = function (sig) { return this.explorerBase + sig + (this.network === 'devnet' ? '?cluster=devnet' : ''); };

  // Switch theme at runtime ('dark' | 'light'); re-renders, preserving connection state.
  P.setTheme = function (theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    this.render();
  };

  P.setStatus = function (text, kind, txSig) {
    var s = this.root.querySelector('.sw-status');
    if (!s) return;
    s.className = 'sw-status' + (kind ? ' sw-' + kind : '');
    s.textContent = text || '';
    if (txSig) {
      s.appendChild(document.createTextNode(' '));
      var a = el('a'); a.href = this.explorerTx(txSig); a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'View transaction ↗'; s.appendChild(a);
    }
    s.style.display = text ? 'flex' : 'none';
  };

  P.setBusy = function (busy) {
    this.busy = busy;
    var btns = this.root.querySelectorAll('.sw-btn');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = busy;
  };

  P.refreshEpoch = function () {
    var self = this;
    this.connection.getEpochInfo().then(function (e) { self.epoch = e.epoch; self.renderAccounts(); }).catch(function () {});
  };

  P.refreshBalance = function () {
    var self = this;
    if (!this.pubkey) return;
    this.connection.getBalance(this.pubkey).then(function (lp) {
      self.balanceLamports = lp;
      var b = self.root.querySelector('.sw-balance-val');
      if (b) b.textContent = fmtSol(lp) + ' SOL';
    }).catch(function () {});
  };

  P.refreshAccounts = function () {
    var self = this;
    if (!this.pubkey) return;
    var filters = [
      { dataSize: STAKE_SPACE },
      { memcmp: { offset: OFFSET_WITHDRAWER, bytes: this.pubkey.toBase58() } },
      { memcmp: { offset: OFFSET_VOTER, bytes: this.vote.toBase58() } }
    ];
    this.connection.getParsedProgramAccounts(web3.StakeProgram.programId, { filters: filters })
      .then(function (list) {
        self.accounts = list.map(function (a) {
          var data = a.account.data;
          // Keep the raw parsed info; status is derived at render time so it stays
          // correct even if accounts loaded before the current epoch was known.
          return { pubkey: a.pubkey, lamports: a.account.lamports, info: (data && data.parsed) ? data.parsed.info : null };
        }).sort(function (x, y) { return y.lamports - x.lamports; });
        self.renderAccounts();
      })
      .catch(function () { self.renderAccounts(); });
  };

  P.connect = function (adapter) {
    var self = this;
    this.setStatus('Connecting to ' + adapter.name + '…', 'pending');
    adapter.connect().then(function (pk) {
      self.wallet = adapter; self.walletName = adapter.name; self.walletIcon = adapter.icon; self.pubkey = pk;
      if (adapter.key && !boundKeys.has(adapter.key)) {
        boundKeys.add(adapter.key);
        adapter.onChange(function () { self.resetWallet(); });
      }
      self.render(); self.refreshBalance(); self.refreshAccounts();
    }).catch(function (err) { self.setStatus(humanError(err), 'error'); });
  };

  P.resetWallet = function () {
    this.wallet = null; this.pubkey = null; this.accounts = []; this.balanceLamports = 0; this.busy = false;
    this.render();
  };

  P.disconnect = function () { if (this.wallet) this.wallet.disconnect(); this.resetWallet(); };

  P.runAction = function (build, pendingMsg, successMsg) {
    var self = this;
    if (this.busy) return;
    this.setBusy(true);
    Promise.resolve().then(build).then(function (built) {
      var tx = new web3.Transaction();
      tx.add(web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }));
      built.instructions.forEach(function (ix) { tx.add(ix); });
      return self.sendTx(tx, built.signers || [], pendingMsg);
    }).then(function (sig) { self.onSuccess(successMsg, sig); })
      .catch(function (err) { self.setBusy(false); self.setStatus(humanError(err), 'error'); });
  };

  P.stake = function (amountSol) {
    var self = this;
    var lamports = Math.round(amountSol * LAMPORTS);
    this.runAction(function () {
      return Promise.all([
        self.connection.getMinimumBalanceForRentExemption(STAKE_SPACE),
        self.connection.getStakeMinimumDelegation()
      ]).then(function (res) {
        var rent = res[0];
        var minDelegation = (res[1] && res[1].value) ? res[1].value : 1;
        var minTotal = rent + minDelegation;
        if (lamports < minTotal) throw new Error('Minimum is ' + fmtSol(minTotal, 5) + ' SOL (rent + minimum delegation).');
        if (lamports > self.balanceLamports) throw new Error('Amount exceeds your wallet balance.');
        var stakeAcc = web3.Keypair.generate();
        var create = web3.StakeProgram.createAccount({
          fromPubkey: self.pubkey, stakePubkey: stakeAcc.publicKey,
          authorized: new web3.Authorized(self.pubkey, self.pubkey),
          lockup: new web3.Lockup(0, 0, web3.PublicKey.default), lamports: lamports
        });
        var delegate = web3.StakeProgram.delegate({
          stakePubkey: stakeAcc.publicKey, authorizedPubkey: self.pubkey, votePubkey: self.vote
        });
        return { instructions: create.instructions.concat(delegate.instructions), signers: [stakeAcc] };
      });
    }, 'Staking ' + fmtSol(lamports) + ' SOL…', 'Staked successfully.');
  };

  P.unstake = function (acc) {
    var self = this;
    this.runAction(function () {
      var d = web3.StakeProgram.deactivate({ stakePubkey: acc.pubkey, authorizedPubkey: self.pubkey });
      return { instructions: d.instructions, signers: [] };
    }, 'Deactivating stake…', 'Unstake started. Funds become withdrawable after this epoch.');
  };

  P.withdraw = function (acc) {
    var self = this;
    this.runAction(function () {
      var w = web3.StakeProgram.withdraw({
        stakePubkey: acc.pubkey, authorizedPubkey: self.pubkey, toPubkey: self.pubkey, lamports: acc.lamports
      });
      return { instructions: w.instructions, signers: [] };
    }, 'Withdrawing ' + fmtSol(acc.lamports) + ' SOL…', 'Withdrawn to your wallet.');
  };

  P.sendTx = function (tx, extraSigners, pendingMsg) {
    var self = this;
    this.setStatus(pendingMsg, 'pending');
    return this.connection.getLatestBlockhash('confirmed').then(function (bh) {
      tx.feePayer = self.pubkey;
      tx.recentBlockhash = bh.blockhash;
      if (extraSigners.length) tx.partialSign.apply(tx, extraSigners);
      return self.wallet.signAndSend(tx, self.connection);
    }).then(function (sig) {
      self.setStatus('Confirming…', 'pending');
      return self.pollConfirmation(sig);
    });
  };

  P.pollConfirmation = function (sig) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        self.connection.getSignatureStatuses([sig]).then(function (res) {
          var st = res && res.value && res.value[0];
          if (st) {
            if (st.err) { clearInterval(timer); reject(new Error('Transaction failed on-chain.')); return; }
            if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') { clearInterval(timer); resolve(sig); return; }
          }
          if (tries >= CONFIRM_MAX_TRIES) { clearInterval(timer); reject(new Error('Confirmation timed out. Check the explorer.')); }
        }).catch(function () {
          if (tries >= CONFIRM_MAX_TRIES) { clearInterval(timer); reject(new Error('Confirmation timed out. Check the explorer.')); }
        });
      }, CONFIRM_INTERVAL_MS);
    });
  };

  P.onSuccess = function (msg, sig) {
    this.setBusy(false);
    this.setStatus(msg, 'success', sig);
    this.refreshBalance();
    this.refreshAccounts();
    var input = this.root.querySelector('.sw-amount');
    if (input) input.value = '';
  };

  /* ----------------------------- rendering ----------------------------- */

  P.render = function () {
    this.root.innerHTML = '';
    this.root.classList.add('sw-stake');
    this.root.setAttribute('data-theme', this.theme);
    if (this.pubkey) this.renderStakeForm();
    else this.renderConnect();
    var status = el('div', 'sw-status');
    status.setAttribute('aria-live', 'polite');
    status.style.display = 'none';
    this.root.appendChild(status);
  };

  P.renderConnect = function () {
    var self = this;
    var wrap = el('div', 'sw-connect');
    wrap.appendChild(el('p', 'sw-connect-hint', 'Connect your wallet to stake SOL.'));
    var wallets = listWallets(this.network);
    if (!wallets.length) {
      wrap.appendChild(el('div', 'sw-no-wallet',
        'Looking for a Solana wallet… If nothing appears, install ' +
        '<a href="https://phantom.app" target="_blank" rel="noopener">Phantom</a> or ' +
        '<a href="https://solflare.com" target="_blank" rel="noopener">Solflare</a> and refresh.'));
      this.waitForWallet();
    } else {
      var row = el('div', 'sw-wallet-row');
      wallets.forEach(function (w) {
        var iconHtml = w.icon ? '<img src="' + w.icon + '" alt="" />' : WALLET_ICON;
        var btn = el('button', 'sw-btn sw-btn-wallet', iconHtml + '<span>' + escapeHtml(w.name) + '</span>');
        btn.addEventListener('click', function () { self.connect(w); });
        row.appendChild(btn);
      });
      wrap.appendChild(row);
    }
    this.root.appendChild(wrap);
  };

  P.waitForWallet = function () {
    var self = this;
    if (this._walletWatch) return;
    var attempts = 0, MAX = 20;
    function cleanup() {
      if (self._walletWatch) { clearInterval(self._walletWatch); self._walletWatch = null; }
      window.removeEventListener('wallet-standard:register-wallet', onEvent);
    }
    function check() {
      if (self.pubkey) { cleanup(); return; }
      if (listWallets(self.network).length) { cleanup(); self.render(); return; }
      if (++attempts >= MAX) cleanup();
    }
    function onEvent() { check(); }
    window.addEventListener('wallet-standard:register-wallet', onEvent);
    this._walletWatch = setInterval(check, 300);
  };

  P.renderStakeForm = function () {
    var self = this;

    var head = el('div', 'sw-head');
    var info = el('div', 'sw-wallet-info');
    info.innerHTML = (this.walletIcon ? '<img src="' + this.walletIcon + '" alt="">' : WALLET_ICON) +
      '<span class="sw-wi-name">' + escapeHtml(this.walletName) + '</span>' +
      '<span class="sw-wi-addr">' + shorten(this.pubkey.toBase58()) + '</span>';
    var copy = el('button', 'sw-wi-copy', COPY_ICON);
    copy.title = 'Copy address';
    copy.setAttribute('aria-label', 'Copy wallet address');
    copy.addEventListener('click', function () {
      var addr = self.pubkey.toBase58();
      var done = function () { copy.innerHTML = CHECK_ICON; setTimeout(function () { copy.innerHTML = COPY_ICON; }, 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(addr).then(done, done);
      else done();
    });
    info.appendChild(copy);
    head.appendChild(info);
    var dc = el('button', 'sw-link', 'Disconnect');
    dc.addEventListener('click', function () { self.disconnect(); });
    head.appendChild(dc);
    this.root.appendChild(head);

    this.root.appendChild(el('div', 'sw-balance',
      '<span>Available</span><span class="sw-balance-val">' + fmtSol(this.balanceLamports) + ' SOL</span>'));

    var field = el('div', 'sw-field');
    var input = el('input', 'sw-amount');
    input.type = 'number'; input.step = 'any'; input.min = '0'; input.placeholder = '0.0';
    input.setAttribute('aria-label', 'Amount of SOL to stake');
    field.appendChild(input);
    field.appendChild(el('span', 'sw-unit', 'SOL'));
    this.root.appendChild(field);

    var est = el('div', 'sw-est');
    function updateEst() {
      var v = parseFloat(input.value);
      if (v > 0) {
        var yearly = v * self.apy / 100;
        est.innerHTML = '<span>Est. rewards</span> <b>+' + yearly.toLocaleString('en-US', { maximumFractionDigits: 3 }) + ' SOL / yr</b> · ' + self.apy + '% APY';
      } else {
        est.textContent = 'Rewards auto-compound every epoch (~2–3 days).';
      }
    }
    input.addEventListener('input', updateEst);

    var setPct = function (pct) {
      var solBal = self.balanceLamports / LAMPORTS;
      var v = pct >= 1 ? Math.max(0, solBal - FEE_BUFFER_SOL) : solBal * pct;
      input.value = trimAmount(v); updateEst();
    };
    var chips = el('div', 'sw-chips');
    [['25%', 0.25], ['50%', 0.5], ['75%', 0.75], ['Max', 1]].forEach(function (c) {
      var chip = el('button', 'sw-chip', c[0]);
      chip.addEventListener('click', function () { setPct(c[1]); });
      chips.appendChild(chip);
    });
    this.root.appendChild(chips);
    this.root.appendChild(est);
    updateEst();

    var btn = el('button', 'sw-btn sw-btn-primary', LOCK_ICON + '<span>Stake</span>');
    btn.addEventListener('click', function () {
      var v = parseFloat(input.value);
      if (!(v > 0)) { self.setStatus('Enter an amount to stake.', 'error'); return; }
      self.stake(v);
    });
    this.root.appendChild(btn);

    this.root.appendChild(el('div', 'sw-accounts'));
    this.renderAccounts();
  };

  P.renderAccounts = function () {
    var self = this;
    var wrap = this.root.querySelector('.sw-accounts');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!this.pubkey || !this.accounts.length) return;

    wrap.appendChild(el('div', 'sw-accounts-title', 'Your stake with ' + escapeHtml(this.validatorName)));
    this.accounts.forEach(function (acc) {
      var status = stakeStatus(acc.info, self.epoch);
      var row = el('div', 'sw-acc');
      row.appendChild(el('div', 'sw-acc-left',
        '<div class="sw-acc-amt">' + fmtSol(acc.lamports) + ' SOL</div>' +
        '<div class="sw-acc-meta">' + shorten(acc.pubkey.toBase58()) +
        ' <span class="sw-badge sw-' + status + '">' + statusLabel(status) + '</span></div>'));

      var action = el('div', 'sw-acc-action');
      if (status === 'active' || status === 'activating') action.appendChild(actionBtn('Unstake', function () { self.unstake(acc); }));
      else if (status === 'inactive') action.appendChild(actionBtn('Withdraw', function () { self.withdraw(acc); }));
      else action.appendChild(el('span', 'sw-acc-wait', 'Deactivating…'));
      row.appendChild(action);
      wrap.appendChild(row);
    });
  };

  function actionBtn(label, onClick) {
    var b = el('button', 'sw-btn sw-btn-ghost', label);
    b.addEventListener('click', onClick);
    return b;
  }

  /* ----------------------------- helpers ----------------------------- */

  function stakeStatus(info, epoch) {
    var stake = info && info.stake;
    if (!stake || !stake.delegation) return 'inactive';
    var d = stake.delegation;
    if (epoch == null) return 'active';
    if (String(d.deactivationEpoch) !== MAXU64) return epoch > Number(d.deactivationEpoch) ? 'inactive' : 'deactivating';
    return epoch <= Number(d.activationEpoch) ? 'activating' : 'active';
  }
  function statusLabel(s) {
    return { active: 'Active', activating: 'Activating', deactivating: 'Deactivating', inactive: 'Withdrawable' }[s] || s;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function humanError(err) {
    var m = (err && (err.message || err.toString())) || 'Something went wrong.';
    if (/user rejected|rejected the request|cancel/i.test(m)) return 'Request cancelled in wallet.';
    if (/blockhash not found|block height exceeded/i.test(m)) return 'Network was busy, please try again.';
    return m;
  }

  /* ----------------------------- public API + auto-mount ----------------------------- */

  function readOpts(elm) {
    return {
      vote: elm.getAttribute('data-vote'),
      rpc: elm.getAttribute('data-rpc') || undefined,
      network: elm.getAttribute('data-network') || undefined,
      theme: elm.getAttribute('data-theme') || undefined,
      apy: elm.getAttribute('data-apy') || undefined,
      validatorName: elm.getAttribute('data-validator-name') || undefined,
      explorer: elm.getAttribute('data-explorer') || undefined
    };
  }

  function fail(root, msg) {
    injectStyles();
    root.innerHTML = '';
    root.className = 'sw-stake';
    var s = el('div', 'sw-status sw-error', '');
    s.textContent = msg;
    s.style.display = 'flex';
    root.appendChild(s);
  }

  var SolanaStakingWidget = {
    mount: function (root, opts) {
      if (!root) return null;
      if (!window.solanaWeb3) { fail(root, 'Could not load @solana/web3.js. Please refresh.'); return null; }
      web3 = window.solanaWeb3;
      opts = opts || {};
      if (!opts.vote) { fail(root, 'Staking widget misconfigured: no vote account (data-vote).'); return null; }
      try { return new Widget(root, opts); }
      catch (e) { fail(root, humanError(e)); return null; }
    },
    mountAll: function (selector) {
      var nodes = document.querySelectorAll(selector || '[data-sol-staking]');
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute('data-sol-staking-mounted')) continue;
        nodes[i].setAttribute('data-sol-staking-mounted', '1');
        out.push(this.mount(nodes[i], readOpts(nodes[i])));
      }
      return out;
    }
  };

  if (typeof window !== 'undefined') window.SolanaStakingWidget = SolanaStakingWidget;

  // Auto-mount any [data-sol-staking] containers once the DOM is ready (browser only).
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { SolanaStakingWidget.mountAll(); });
    } else {
      SolanaStakingWidget.mountAll();
    }
  }

  // Expose pure helpers for unit tests when loaded in Node (no effect in the browser).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      base58: base58, stakeStatus: stakeStatus, trimAmount: trimAmount,
      escapeHtml: escapeHtml, statusLabel: statusLabel
    };
  }
})();
