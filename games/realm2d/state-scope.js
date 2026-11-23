/* ══════════════════════════════════════════════════════════════════
   SHADDAI — PER-ACCOUNT STATE SCOPING  (state-scope.js)
   Namespaced localStorage per signed-in user so sessions never overlap:
   two accounts on the same browser each keep their OWN player, house,
   decor, region, economy, bounty progress and chat archive.

   How it works
   ─────────────
   While a real signed-in uid exists (localStorage shd_userid, not a
   guest-* id), every localStorage get/set/remove on a "shaddai.*" key is
   transparently redirected to "shaddai.<uid>.<the rest>". Legacy keys
   (the old shared copies) are served as a one-time fallback and frozen
   under this uid on first read, so a player's existing data survives the
   upgrade instead of being lost or shared with the next account.

   NOT namespaced:
   - shd_* keys            (auth/session/global flags — shared by design)
   - shaddai_* keys        (app-wide gates like shaddai_founding)
   - shaddai.rooms.*       (already hand-scoped per uid by the app: roomsKey())

   Include EARLY in <head> on the game-flow pages:
   index.html, game.html, region-select.html, pixel-forge.html.
   Self-contained, null-safe, and harmless on pages that never read shaddai.*
   (no uid present in a session where none was ever assigned → no-op).
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__stateScopeV1) return; window.__stateScopeV1 = true;

  var uid = '';
  try { uid = String(localStorage.getItem('shd_userid') || '').trim(); } catch (e) {}

  var P = 'shaddai.';
  function scoped(k) { return P + uid + '.' + k.slice(P.length); }
  function isScopable(k) { return typeof k === 'string' && k.indexOf(P) === 0 && k.indexOf(P + 'rooms.') !== 0; }

  var _s = Storage.prototype.setItem, _g = Storage.prototype.getItem, _r = Storage.prototype.removeItem;

  // Merge the account-scoped state of another uid into this one WITHOUT
  // overwriting anything we already hold. Called by index.html's auth
  // handler whenever the signed-in uid changes (e.g. email vs Google, or a
  // second account on the same browser) so both accounts land on ONE
  // identity instead of one silently replacing the other.
  // Defined even when no session exists yet — the auth handler calls it
  // AFTER a provider sign-in completes, on whichever page that happens on.
  window.__shdMergeIdentity = function (fromUid, toUid) {
    try {
      if (!fromUid || !toUid || fromUid === toUid) return;
      var pre = P + fromUid + '.', dstPre = P + toUid + '.';
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(pre) !== 0) continue;
        var rest = k.slice(pre.length);              // e.g. "econ", "player", "decor"
        if (rest.indexOf('rooms.') === 0) continue;   // rooms are already hand-scoped by roomsKey()
        var dst = dstPre + rest;                      // same key under the new identity's namespace
        if (_g.call(localStorage, dst) !== null) continue; // keep what the new identity already owns — never overwrite
        try { _s.call(localStorage, dst, _g.call(localStorage, k)); } catch (e2) {}
      }
    } catch (e) {}
  };

  if (!uid || uid.indexOf('guest') === 0 || uid === 'local') return; // guests/local stay device-scoped

  Storage.prototype.setItem = function (k, v) {
    if (this === window.localStorage && isScopable(k)) return _s.call(this, scoped(k), v);
    return _s.call(this, k, v);
  };
  Storage.prototype.getItem = function (k) {
    if (this === window.localStorage && isScopable(k)) {
      var mine = _g.call(this, scoped(k));
      if (mine !== null) return mine;
      var legacy = _g.call(this, k);
      if (legacy !== null) { try { _s.call(this, scoped(k), legacy); } catch (e) {} return legacy; }
      return null;
    }
    return _g.call(this, k);
  };
  Storage.prototype.removeItem = function (k) {
    if (this === window.localStorage && isScopable(k)) return _r.call(this, scoped(k));
    return _r.call(this, k);
  };

  try { window.__shd_scope_uid = uid; } catch (e) {}
})();