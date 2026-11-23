/* SHADDAI · in-game dialogs — replaces the browser's blocking alert() with a non-blocking on-screen toast
   that matches the game's gold/obsidian look. (prompt()/confirm() need async call-sites; see docs handoff.) */
(function () {
  if (window.__igd) return; window.__igd = 1;
  var css = document.createElement('style');
  css.textContent = '#igd-wrap{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:min(92vw,520px)}' +
    '.igd-t{pointer-events:auto;background:rgba(8,11,18,.94);border:1px solid rgba(232,196,92,.55);color:#f2e6c0;font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.03em;padding:10px 16px;border-radius:12px;box-shadow:0 0 22px rgba(232,196,92,.18);white-space:pre-line;cursor:pointer;opacity:0;transform:translateY(-8px);transition:opacity .25s,transform .25s}' +
    '.igd-t.on{opacity:1;transform:none}';
  function wrap() { var w = document.getElementById('igd-wrap'); if (!w) { w = document.createElement('div'); w.id = 'igd-wrap'; (document.body || document.documentElement).appendChild(w); } return w; }
  window.gameToast = function (msg, ms) {
    var t = document.createElement('div'); t.className = 'igd-t'; t.textContent = String(msg == null ? '' : msg); wrap().appendChild(t);
    requestAnimationFrame(function () { t.classList.add('on'); });
    var kill = function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 300); };
    t.onclick = kill; setTimeout(kill, ms || 3800);
  };
  if (document.head) document.head.appendChild(css); else document.addEventListener('DOMContentLoaded', function () { document.head.appendChild(css); });
  window.alert = function (m) { window.gameToast(m); };
  // prompt(): never blocks. Returns the suggested default (auto-name) and says so; rename flows keep the current name.
  window.prompt = function (m, def) { window.gameToast('✎ ' + (def || 'Default') + ' (auto-named — rename it later in settings)'); return def == null ? '' : String(def); };
  // confirm(): never blocks. First call asks on-screen and returns false; the SAME question repeated within 4s returns true.
  var pend = {};
  window.confirm = function (m) {
    var k = String(m), now = Date.now();
    if (pend[k] && now - pend[k] < 4000) { delete pend[k]; return true; }
    pend[k] = now; window.gameToast('⚠ ' + k + ' — do it again within 4s to confirm', 4000); return false;
  };
})();
