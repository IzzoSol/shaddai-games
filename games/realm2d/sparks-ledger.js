/* SHADDAI SPARKS LEDGER — one balance for the 2D realm, the 3D realm, the arcade and the dashboard.
 *
 * READ-THROUGH CACHE (2026-09-28). The truth for a signed-in player is char.currency.sparks on the MMO/economy server
 * (server/sparksRoutes.js, /sparks/*), identified by the same x-user-id header world-gate.js attaches (cloudUid rule: never guest-*, never 'local').
 * localStorage is only a cache of that number now, so `localStorage.setItem('shaddai.sparks','999999999')` no longer mints anything for a signed-in
 * player: the next sync overwrites it and every spend/earn is validated server-side. Guests, or a page with no reachable server, stay in LOCAL mode
 * (the old behaviour) — fine for a demo, and the API below is unchanged, so existing callers keep working.
 *
 *   canonical key : shaddai.sparks   mirror key : shd_sparks   legacy key : shd.sparks3d (folded in once)
 * API: ShdSparks.get() / .add(n, kind, note) / .spend(n, kind, note) -> bool      (synchronous, optimistic; server confirms or rolls back)
 *      ShdSparks.mode() -> 'server' | 'local'     ShdSparks.sync() -> Promise      ShdSparks.buy(vendorId, itemId) -> Promise<{ok, price, balance, item, name, error}>
 *      window event 'shd-sparks' {detail:{balance, mode}} on every change.
 * Server base URL: window.SHD_MMO_API, else http://localhost:3001 on localhost, else
 * same-origin ('' — the production server mounts /sparks as an adapter over
 * the single economy-service ledger, backend/sparks-adapter-routes.js).
 * Balances are Sparks with up to 2 decimals (100 ledger units = 1 Spark);
 * the cache keeps cents, never rounds to whole Sparks.
 */
(function () {
  if (window.ShdSparks) return;
  var KEY = 'shaddai.sparks', MIRROR = 'shd_sparks', LEGACY = 'shd.sparks3d', LOG = 'shaddai.sparklog';
  var API = (typeof window.SHD_MMO_API === 'string') ? window.SHD_MMO_API : (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:3001' : '');
  var srv = { mode: 'local', nextTry: 0, syncing: null, inflight: 0 };

  function num(k) { try { var n = parseFloat(localStorage.getItem(k)); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; } catch (e) { return 0; } }
  function emit() { try { window.dispatchEvent(new CustomEvent('shd-sparks', { detail: { balance: num(KEY), mode: srv.mode } })); } catch (e) {} }
  function set(n) {
    n = Math.max(0, Math.round((n || 0) * 100) / 100);
    try {
      localStorage.setItem(KEY, String(n));
      localStorage.setItem(MIRROR, String(n));
      localStorage.setItem('shd_max_sparks', String(Math.max(num('shd_max_sparks'), n)));
    } catch (e) {}
    return n;
  }
  function log(kind, amt, note) {
    try {
      var a = JSON.parse(localStorage.getItem(LOG) || '[]');
      a.push({ t: Date.now(), k: kind || 'sparks', a: Math.round((amt || 0) * 100) / 100, n: note || '' });
      if (a.length > 200) a = a.slice(-200);
      localStorage.setItem(LOG, JSON.stringify(a));
    } catch (e) {}
  }
  function migrate() {
    var old = num(LEGACY);
    try { if (localStorage.getItem(LEGACY) === null) return; localStorage.removeItem(LEGACY); } catch (e) { return; }
    if (old > 0) { set(num(KEY) + old); log('merge', old, 'folded legacy 3D/arcade sparks into the shared wallet'); }
  }
  migrate();

  /* same rule as cloudUid() (game.html:2258, shd-tier.js:46) */
  function uid() {
    try { if (window.SHD_AUTH && window.SHD_AUTH.user && window.SHD_AUTH.user.uid) return window.SHD_AUTH.user.uid; } catch (e) {}
    try { var u = localStorage.getItem('shd_userid'); if (u && u.indexOf('guest') !== 0 && u !== 'local') return u; } catch (e) {}
    return null;
  }
  function toast(m) { try { if (window.__toast) window.__toast(m); } catch (e) {} }

  function call(method, path, body) {
    var id = uid();
    if (!id) return Promise.reject(new Error('local'));
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 5000) : 0;
    var h = { 'x-user-id': id }; if (body) h['Content-Type'] = 'application/json';
    return fetch(API + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); },
            function (e) { clearTimeout(t); throw e; });
  }
  function goLocal() { srv.mode = 'local'; srv.nextTry = Date.now() + 60000; emit(); }
  function applyServer(j) { if (j && typeof j.balance === 'number') { set(j.balance); srv.mode = 'server'; emit(); } }

  function sync() {
    if (srv.syncing) return srv.syncing;
    if (!uid() || Date.now() < srv.nextTry) return Promise.resolve(srv.mode);
    srv.syncing = call('GET', '/sparks/balance').then(function (j) { if (j && j.success) applyServer(j); else goLocal(); return srv.mode; }, function () { goLocal(); return srv.mode; })
      .then(function (m) { srv.syncing = null; return m; });
    return srv.syncing;
  }
  /* run a mutation on the server; on refusal roll the cache back to the server's number and tell the player */
  function remote(path, body, undo, why) {
    srv.inflight++;
    return call('POST', path, body).then(function (j) {
      srv.inflight--;
      if (j && j.success) { applyServer(j); return j; }
      if (j && typeof j.balance === 'number') applyServer(j); else undo();
      emit(); toast('Sparks: ' + ((j && j.error) || why || 'refused by the server')); return j;
    }, function () { srv.inflight--; goLocal(); return { success: false, error: 'offline', __offline: true }; });   // network error: keep the optimistic local value (local mode)
  }

  window.ShdSparks = {
    get: function () { return num(KEY); },
    mode: function () { return srv.mode; },
    sync: sync,
    add: function (n, kind, note) {
      n = Math.round((n || 0) * 100) / 100; if (!n) return num(KEY);
      var before = num(KEY), v = set(before + n); log(kind, n, note);
      if (srv.mode === 'server' && n > 0) remote('/sparks/earn', { amount: n, kind: kind || 'misc', note: note || '' }, function () { set(before); }, 'that reward was not accepted');
      return v;
    },
    spend: function (n, kind, note) {
      n = Math.round((n || 0) * 100) / 100; if (n <= 0) return true; var before = num(KEY); if (before < n) return false;
      set(before - n); log(kind, -n, note);
      if (srv.mode === 'server') remote('/sparks/spend', { amount: n, kind: kind || 'misc', note: note || '' }, function () { set(before); }, 'purchase refused');
      return true;
    },
    /* concession purchase: server mode = server catalog + server price (the client cannot name a price); local mode = local catalog debit */
    buy: function (vendorId, itemId, localItem) {
      if (srv.mode === 'server') return call('POST', '/sparks/vendor/buy', { vendorId: vendorId, itemId: itemId }).then(function (j) {
        if (j && j.success) { applyServer(j); log('vendor', -j.price, itemId); return { ok: true, price: j.price, balance: j.balance, item: j.item, name: j.name }; }
        if (j && typeof j.balance === 'number') applyServer(j); return { ok: false, error: (j && j.error) || 'refused', balance: num(KEY) };
      }, function () { goLocal(); return window.ShdSparks.buy(vendorId, itemId, localItem); });
      var it = localItem; if (!it) return Promise.resolve({ ok: false, error: 'Unknown item' });
      if (!window.ShdSparks.spend(it.price, 'vendor', itemId)) return Promise.resolve({ ok: false, error: 'Not enough Sparks', balance: num(KEY) });
      return Promise.resolve({ ok: true, price: it.price, balance: num(KEY), item: it.item, name: it.name });
    },
  };
  // first read-through as soon as we know who the player is; again when the tab regains focus (another tab/device may have spent)
  setTimeout(sync, 0);
  try { window.addEventListener('focus', function () { sync(); }); } catch (e) {}
  try { setInterval(function () { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') sync(); }, 30000); } catch (e) {}   // auth resolves late on some pages; also keeps the cache honest
  try { window.addEventListener('storage', function (e) { if (e.key === KEY) emit(); }); } catch (e) {}
})();
