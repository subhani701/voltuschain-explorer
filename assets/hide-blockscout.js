// Voltuswave Customization Script
// 1) Removes Blockscout branding from the footer (positive identification only — never
//    hides based on absence of "Voltuswave", so the footer can't be blanked).
// 2) Repurposes the native "Add to wallet" button IN PLACE (same styling/position):
//      - relabels it: "Add Voltuswave Network" when the VoltusWave extension is installed,
//        "Get VoltusWave Wallet" when it isn't;
//      - intercepts its click so it targets the VoltusWave extension DIRECTLY via
//        window.voltusWave (bypassing MetaMask), or opens the Chrome Web Store if absent.
//    Falls back to appending a link in the Voltuswave column if no button exists.
(function () {
  console.log('[Voltuswave] Customization script loaded');

  var KEEP = 'voltuswave';
  var BRAND_TEXT = ['blockscout', 'made with', 'powered by', 'backend:', 'frontend:'];
  var BRAND_HREF = [
    'blockscout.com', 'github.com/blockscout', 'github.com/sponsors', 'discord.gg',
    'discord.com', 'giveth.io', 'canny.io', 't.me/', 'twitter.com', 'x.com',
    'opensea.io', 'medium.com', 'youtube.com', 'linkedin.com', 'reddit.com'
  ];

  var STORE_URL = 'https://chromewebstore.google.com/search/VoltusWave%20Wallet';
  var CHAIN = {
    chainId: '0x12d687', // 1234567
    chainName: 'Voltuswave',
    nativeCurrency: { name: 'Voltus', symbol: 'VW', decimals: 18 },
    rpcUrls: ['http://YOUR_RPC_NODE_HOST'], // set to your chain's public RPC endpoint at deploy time
    blockExplorerUrls: ['http://localhost']
  };

  var observer = null;
  function lc(el) { return ((el && el.textContent) || '').toLowerCase(); }
  function hide(el) {
    if (el) { el.style.setProperty('display', 'none', 'important'); el.setAttribute('data-vw-hidden', '1'); }
  }
  function resetHidden(root) {
    root.querySelectorAll('[data-vw-hidden="1"]').forEach(function (el) {
      el.style.removeProperty('display'); el.removeAttribute('data-vw-hidden');
    });
  }
  function hideBlock(el) {
    var node = el;
    while (node && node.parentElement) {
      var parent = node.parentElement;
      if (parent.tagName === 'FOOTER' || lc(parent).indexOf(KEEP) !== -1) break;
      node = parent;
    }
    if (node && lc(node).indexOf(KEEP) === -1) hide(node); else hide(el);
  }

  function isVoltusInstalled() {
    return !!(window.voltusWave || (window.ethereum && window.ethereum.isVoltusWave));
  }
  function linkLabel() {
    return isVoltusInstalled() ? 'Add Voltuswave Network' : 'Get VoltusWave Wallet';
  }

  // Trigger the VoltusWave extension directly (NOT window.ethereum, which MetaMask owns).
  function openVoltusWave(e) {
    if (e) { e.preventDefault(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); e.stopPropagation(); }
    var vw = window.voltusWave ||
      (window.ethereum && window.ethereum.isVoltusWave ? window.ethereum : null);
    if (vw && typeof vw.request === 'function') {
      // eth_requestAccounts opens the extension popup when the wallet is locked (the
      // normal connect moment); then add/switch to VoltusChain. If already unlocked,
      // Chrome won't let a page force the popup open — both calls then run silently.
      vw.request({ method: 'eth_requestAccounts' })
        .then(function () { return vw.request({ method: 'wallet_addEthereumChain', params: [CHAIN] }); })
        .catch(function () {});
    } else {
      window.open(STORE_URL, '_blank', 'noopener');
    }
  }

  // Repurpose the native add-to-wallet button: keep its styling/place, relabel, and make
  // its click target VoltusWave instead of MetaMask.
  function repurposeWalletButton(btn) {
    if (btn.textContent.trim() !== linkLabel()) btn.textContent = linkLabel();
    if (!btn.dataset.vwBound) {
      btn.addEventListener('click', openVoltusWave, true); // capture: beat React's handler
      btn.dataset.vwBound = '1';
    }
  }

  // Fallback only (no button found): add a styled link in the Voltuswave column.
  function addFallbackLink(footer) {
    if (document.getElementById('vw-ext-fallback')) {
      document.getElementById('vw-ext-fallback').textContent = linkLabel();
      return;
    }
    var anchors = footer.querySelectorAll('a[href*="voltuswave.com"]');
    if (!anchors.length) return;
    var last = anchors[anchors.length - 1];
    var link = last.cloneNode(true);
    link.id = 'vw-ext-fallback';
    link.textContent = linkLabel();
    link.setAttribute('href', STORE_URL);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
    link.style.cursor = 'pointer';
    link.addEventListener('click', openVoltusWave);
    last.parentNode.appendChild(link);
  }

  function cleanFooter() {
    var footer = document.querySelector('footer');
    if (!footer) return;
    resetHidden(footer);

    // 1) Branding/social links (and their column).
    footer.querySelectorAll('a').forEach(function (a) {
      var h = (a.getAttribute('href') || '').toLowerCase();
      if (BRAND_HREF.some(function (b) { return h.indexOf(b) !== -1; })) hideBlock(a);
    });

    // 2) Branding text blocks (description, version line, "Made with … Blockscout").
    footer.querySelectorAll('p, span, div').forEach(function (el) {
      if (el.getAttribute('data-vw-hidden') === '1') return;
      var t = lc(el);
      if (t.indexOf(KEEP) !== -1) return;
      if (BRAND_TEXT.some(function (b) { return t.indexOf(b) !== -1; })) hide(el);
    });

    // 3) Buttons: hide Blockscout-branded ones; repurpose the (first) other button —
    //    that's the "Add to wallet" button — in place.
    var walletBtn = null;
    footer.querySelectorAll('button').forEach(function (btn) {
      var t = lc(btn);
      if (t.indexOf('blockscout') !== -1) { hide(btn); return; }
      if (!walletBtn) walletBtn = btn;
    });
    if (walletBtn) {
      var fb = document.getElementById('vw-ext-fallback'); if (fb) fb.remove();
      repurposeWalletButton(walletBtn);
    } else {
      addFallbackLink(footer);
    }
  }

  function fixNav() {
    var topBar = document.querySelector('header') || document.querySelector('nav');
    if (topBar) {
      topBar.querySelectorAll('a, button').forEach(function (item) {
        if (item.style.display === 'none' || item.style.visibility === 'hidden') {
          item.style.cssText = 'display: flex !important; visibility: visible !important;';
        }
      });
    }
  }

  function apply() {
    if (observer) observer.disconnect();
    try { cleanFooter(); fixNav(); }
    finally { if (observer && document.body) observer.observe(document.body, { childList: true, subtree: true }); }
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  [300, 800, 1500, 3000, 5000].forEach(function (ms) { setTimeout(apply, ms); });
  observer = new MutationObserver(function () { apply(); });
  (function start() {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    else setTimeout(start, 100);
  })();
})();
