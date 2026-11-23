/* ══════════════════════════════════════════════════════════════════
   SHADDAI — WORLD ACCESS GATE  (world-gate.js)
   Entering the 2D world requires SIGN-IN or a BETA CODE (beta-friendly).
   Signed-in users (a real shd_userid / SHD_AUTH) pass straight through.
   Everyone else enters a beta code once — remembered on this device.
   Include this EARLY on the world entry pages (game.html, _LAUNCH.html).
   Self-contained, null-safe.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__worldGateV1) return; window.__worldGateV1 = true;

  // Tag every same-origin /api call with the caller's id (Player Code / signed-in uid)
  // so the world's office/gallery/etc. scope to THIS player, never a shared 'local'.
  (function () {
    if (window.__shdFetchScoped || !window.fetch) return; window.__shdFetchScoped = true;
    var _f = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (/^\/api\//.test(url) || url.indexOf(location.origin + '/api/') === 0) {
          init = init || {};
          var h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
          if (!h.has('x-user-id')) { var id = ''; try { id = localStorage.getItem('shd_userid') || ''; } catch (e) {} if (id) h.set('x-user-id', id); }
          init.headers = h;
        }
      } catch (e) {}
      return _f.call(this, input, init);
    };
  })();

  function hasAccess() {
    try {
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true; // dev bypass — gate still enforces in production
      if (localStorage.getItem('shd_world_pass')) return true;               // redeemed a beta code
      var uid = localStorage.getItem('shd_userid') || '';
      if (uid && uid.indexOf('guest') !== 0) return true;                    // a real signed-in uid
      if (window.SHD_AUTH && window.SHD_AUTH.user) return true;              // firebase session
    } catch (e) {}
    return false;
  }

  function css() {
    var s = document.createElement('style'); s.id = 'shd-worldgate-css';
    s.textContent =
      '#shdWorldGate{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:radial-gradient(90% 70% at 50% -10%,rgba(168,85,247,.16),transparent 60%),#06060f;color:#efe9ff;font-family:"Chakra Petch",system-ui,sans-serif}' +
      '#shdWorldGate .box{width:min(92vw,420px);text-align:center;padding:30px 26px;border:1px solid rgba(168,85,247,.28);border-radius:18px;background:rgba(12,10,26,.72);box-shadow:0 20px 60px rgba(0,0,0,.55);backdrop-filter:blur(8px)}' +
      '#shdWorldGate .sig{font-size:30px;color:#a855f7;text-shadow:0 0 22px rgba(168,85,247,.6)}' +
      '#shdWorldGate h2{font-family:"Space Grotesk",sans-serif;font-weight:700;letter-spacing:.06em;font-size:20px;margin:8px 0 4px}' +
      '#shdWorldGate p{color:#9a86c8;font-size:13px;line-height:1.6;margin:0 0 18px}' +
      '#shdWorldGate button{font-family:"Space Grotesk",sans-serif;font-weight:700;cursor:pointer}' +
      '#shdWorldGate .signin{width:100%;padding:13px;border:none;border-radius:11px;background:linear-gradient(100deg,#a855f7,#22d3ee);color:#0b0416;font-size:14px}' +
      '#shdWorldGate .or{display:flex;align-items:center;gap:10px;color:#6f5aa8;font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.2em;margin:16px 0}' +
      '#shdWorldGate .or::before,#shdWorldGate .or::after{content:"";flex:1;height:1px;background:rgba(168,85,247,.2)}' +
      '#shdWorldGate .row{display:flex;gap:8px}' +
      '#shdWorldGate input{flex:1;background:rgba(8,4,18,.8);border:1px solid rgba(168,85,247,.32);border-radius:10px;color:#efe9ff;padding:12px 13px;font-family:"IBM Plex Mono",monospace;font-size:14px;letter-spacing:.1em;text-transform:uppercase}' +
      '#shdWorldGate .go{padding:0 18px;border:1px solid rgba(34,211,238,.5);border-radius:10px;background:rgba(34,211,238,.12);color:#22d3ee}' +
      '#shdWorldGate .msg{min-height:16px;margin-top:11px;font-size:12px;color:#ff8fa3}' +
      '#shdWorldGate .foot{margin-top:16px;font-family:"IBM Plex Mono",monospace;font-size:9px;color:#6f5aa8;letter-spacing:.14em;text-transform:uppercase}';
    document.head.appendChild(s);
  }

  function mount(force) {
    if ((!force && hasAccess()) || document.getElementById('shdWorldGate')) return;
    css();
    var g = document.createElement('div'); g.id = 'shdWorldGate';
    g.innerHTML =
      '<div class="box">' + (force ? '<button id="shdWgClose" style="position:absolute;top:10px;right:12px;background:none;border:0;color:#9a86c8;font-size:18px;cursor:pointer">✕</button>' : '') +
      '<div class="sig">◈</div><h2>Enter beta code or sign in</h2>' +
      '<p>The 2D world is in private beta. Sign in (works across the whole dashboard) or enter a beta code — your character, house and sessions are saved to your account.</p>' +
      '<button class="signin" id="shdWgSignin">Sign in →</button>' +
      '<div class="or">OR</div>' +
      '<div class="row"><input id="shdWgCode" placeholder="BETA CODE" maxlength="32" autocomplete="off"><button class="go" id="shdWgGo">Enter →</button></div>' +
      '<div class="msg" id="shdWgMsg"></div>' +
      '<div class="foot">SHADDAI · private beta</div></div>';
    document.body.appendChild(g);
    document.documentElement.style.overflow = 'hidden';
    if (force) { var cl = document.getElementById('shdWgClose'); if (cl) cl.onclick = function () { document.documentElement.style.overflow = ''; g.remove(); try { document.dispatchEvent(new CustomEvent('shd:worldgate-close')); } catch (e) {} }; }

    document.getElementById('shdWgSignin').onclick = function () {
      // Sign-in lives on the dashboard; send them there and return here after.
      try { localStorage.setItem('shd_world_return', location.pathname + location.search); } catch (e) {}
      location.href = '../../index.html';
    };
    var input = document.getElementById('shdWgCode'), msg = document.getElementById('shdWgMsg');
    function redeem() {
      var code = (input.value || '').trim();
      if (!code) { input.focus(); return; }
      msg.style.color = '#9a86c8'; msg.textContent = 'Checking…';
      fetch('/api/world/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            try {
              localStorage.setItem('shd_world_pass', d.pass || code.toUpperCase());
              // A Player Code IS your identity → restore it across the whole dashboard.
              if (d.userId) localStorage.setItem('shd_userid', d.userId);
            } catch (e) {}
            msg.style.color = '#00e5a0'; msg.textContent = d.userId ? 'Welcome back — save restored.' : 'Welcome in.';
            document.documentElement.style.overflow = '';
            var el = document.getElementById('shdWorldGate'); if (el) el.remove();
            try { document.dispatchEvent(new CustomEvent('shd:worldgate-grant', { detail: { userId: d.userId || null } })); } catch (e) {}
          } else { msg.style.color = '#ff8fa3'; msg.textContent = (d && d.error === 'invalid code') ? 'That code isn\'t valid.' : (d && d.error) || 'Try again.'; }
        })
        .catch(function () { msg.style.color = '#ff8fa3'; msg.textContent = 'Network error — try again.'; });
    }
    document.getElementById('shdWgGo').onclick = redeem;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') redeem(); });
    input.focus();
  }

  // Manual open (dismissable) — used by "Sign in / Code" buttons even when access exists.
  window.openWorldGate = function () { mount(true); };
  window.worldHasAccess = hasAccess;
  // Pages that want to gate only on a specific action (e.g. region-select gates on
  // Enter, not on load) set window.SHD_WORLDGATE_MANUAL = true before including this.
  if (!window.SHD_WORLDGATE_MANUAL) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(false); }); else mount(false);
  }
})();
