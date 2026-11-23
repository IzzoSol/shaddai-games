/* ar-place.js — Shaddai Arcade cross-platform AR placement.
 *
 * One button, every phone:
 *   iPhone/iPad (Safari)  -> AR Quick Look with the cabinet USDZ. Apple's own
 *                            viewer anchors it in the real room at real scale.
 *                            Place-and-view: the cabinet screen is baked art,
 *                            live play is not possible inside Quick Look.
 *   Android (Chrome)      -> <model-viewer> AR: WebXR where available,
 *                            Scene Viewer as fallback, same cabinet GLB.
 *   Anything else         -> disabled "ROOM - SOON" marker (in-world gate:
 *                            never fake an AR view we cannot honestly offer).
 *
 * Vendored tech (see /vendor/model-viewer/LICENCES.md): <model-viewer>
 * (Apache-2.0) + three.js (MIT). Nothing here ever throws: any failure
 * degrades to the SOON marker with a reason.
 *
 * Usage:
 *   <script src="../games/ar-place.js"></script>
 *   ARPlace.mountButton(document.getElementById('ar-slot'), { game: 'contention' });
 *   var v = ARPlace.createViewer({ game: 'contention' }); // a <model-viewer> el
 */
(function (global) {
  'use strict';

  var VENDOR = '../vendor/model-viewer/';
  var DEFAULTS = {
    glb: '../assets/games/ar/cabinet.glb',
    usdz: '../assets/games/ar/cabinet.usdz',
    poster: '../assets/games/covers/contention.png',
    label: 'PLACE IN YOUR ROOM',
    soonLabel: 'ROOM — SOON'
  };

  function opts_(opts) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    if (opts) for (k in opts) o[k] = opts[k];
    if (opts && opts.game) {
      o.poster = '../assets/games/covers/' + opts.game + '.png';
    }
    return o;
  }

  /* ---------------- detection ---------------- */
  function detect() {
    try {
      var nav = global.navigator || {};
      var ua = nav.userAgent || '';
      var ios = /iPhone|iPad|iPod/i.test(ua) ||
        (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
      var android = /Android/i.test(ua);
      var platform = ios ? 'ios' : android ? 'android'
        : (/Mobi|Mobile|Tablet/i.test(ua) ? 'other' : 'desktop');
      var mode = 'none', reason = '';
      if (platform === 'ios') {
        var a = document.createElement('a');
        if (a.relList && typeof a.relList.supports === 'function' && a.relList.supports('ar')) {
          mode = 'quicklook';
        } else {
          reason = 'AR Quick Look is not exposed in this browser — open this page in Safari.';
        }
      } else if (platform === 'android') {
        mode = ('xr' in nav) ? 'webxr' : 'sceneviewer';
      } else if (platform === 'desktop') {
        reason = 'AR placement needs a phone: iPhone (Safari) or Android (Chrome).';
      } else {
        reason = 'AR placement is not available on this device/browser.';
      }
      return { platform: platform, mode: mode, reason: reason };
    } catch (e) {
      return { platform: 'other', mode: 'none', reason: 'AR detection failed on this device.' };
    }
  }

  /* ---------------- model-viewer loading ---------------- */
  var mvPromise = null;
  function ensureModelViewer() {
    if (global.customElements && global.customElements.get('model-viewer')) {
      return Promise.resolve(true);
    }
    if (mvPromise) return mvPromise;
    mvPromise = new Promise(function (resolve) {
      try {
        if (!document.querySelector('script[type="importmap"]')) {
          var im = document.createElement('script');
          im.type = 'importmap';
          im.textContent = JSON.stringify({ imports: {
            'three': VENDOR + 'three.module.js',
            '@monogrid/gainmap-js': VENDOR + 'gainmap-stub.js'
          }});
          document.head.appendChild(im);
        }
        var s = document.createElement('script');
        s.type = 'module';
        s.textContent = "import '" + VENDOR + "model-viewer-module.js';";
        s.onload = function () { resolve(true); };
        s.onerror = function () { resolve(false); };
        document.head.appendChild(s);
        // module scripts fire onload before execution settles; poll briefly
        var tries = 0;
        (function poll() {
          if (global.customElements && global.customElements.get('model-viewer')) return resolve(true);
          if (++tries > 40) return resolve(false);
          setTimeout(poll, 100);
        })();
      } catch (e) { resolve(false); }
    });
    return mvPromise;
  }

  /* ---------------- styling (injected once) ---------------- */
  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    try {
      var st = document.createElement('style');
      st.textContent =
        '.arplace-btn{display:inline-flex;align-items:center;gap:.55em;padding:.8em 1.3em;' +
        'background:linear-gradient(180deg,#0d3b2a,#07231a);color:#7dffc8;border:1px solid #1d7a52;' +
        'border-radius:12px;font:600 15px/1.1 system-ui,sans-serif;letter-spacing:.06em;' +
        'cursor:pointer;text-decoration:none;box-shadow:0 0 18px rgba(0,255,170,.18)}' +
        '.arplace-btn img{width:34px;height:45px;object-fit:cover;border-radius:5px;display:block}' +
        '.arplace-soon{display:inline-flex;align-items:center;padding:.8em 1.3em;border-radius:12px;' +
        'border:1px dashed #37524a;color:#5f7a72;background:rgba(10,25,20,.5);' +
        'font:600 15px/1.1 system-ui,sans-serif;letter-spacing:.06em;cursor:not-allowed}' +
        '.arplace-note{margin-top:.5em;color:#8fb8a9;font:400 12.5px/1.45 system-ui,sans-serif;max-width:34em}';
      document.head.appendChild(st);
    } catch (e) { /* styling is best-effort */ }
  }

  function soonMarker(el, o, reason) {
    el.innerHTML = '';
    var b = document.createElement('button');
    b.className = 'arplace-soon';
    b.disabled = true;
    b.textContent = o.soonLabel;
    el.appendChild(b);
    if (reason) {
      var n = document.createElement('div');
      n.className = 'arplace-note';
      n.textContent = reason;
      el.appendChild(n);
    }
  }

  /* ---------------- public API ---------------- */
  function mountButton(el, opts) {
    var o = opts_(opts);
    try {
      if (!el) return detect();
      injectStyle();
      var d = detect();
      el.setAttribute('data-ar-platform', d.platform);
      el.setAttribute('data-ar-mode', d.mode);

      if (d.mode === 'quicklook') {
        el.innerHTML = '';
        var a = document.createElement('a');
        a.setAttribute('rel', 'ar');
        a.setAttribute('href', o.usdz);
        a.className = 'arplace-btn';
        var img = document.createElement('img');
        img.src = o.poster;
        img.alt = '';
        a.appendChild(img);
        var span = document.createElement('span');
        span.textContent = o.label;
        a.appendChild(span);
        el.appendChild(a);
        var n = document.createElement('div');
        n.className = 'arplace-note';
        n.textContent = 'Opens AR Quick Look: the cabinet stands in your room at real size. ' +
          'Place-and-view — the screen shows cover art; live play stays in the game.';
        el.appendChild(n);
        return d;
      }

      if (d.platform === 'android') {
        el.innerHTML = '';
        var btn = document.createElement('button');
        btn.className = 'arplace-btn';
        btn.textContent = o.label;
        el.appendChild(btn);
        var note = document.createElement('div');
        note.className = 'arplace-note';
        note.textContent = d.mode === 'webxr'
          ? 'Opens WebXR AR: place the cabinet in your room at real size.'
          : 'Opens Scene Viewer AR: place the cabinet in your room at real size.';
        el.appendChild(note);
        btn.addEventListener('click', function () {
          btn.textContent = 'LOADING…';
          ensureModelViewer().then(function (ok) {
            if (!ok) { btn.textContent = o.label; note.textContent = 'AR viewer failed to load.'; return; }
            try {
              var holder = document.createElement('div');
              holder.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
              var mv = createViewer(o);
              holder.appendChild(mv);
              document.body.appendChild(holder);
              var done = function () {
                if (mv.canActivateAR) {
                  mv.activateAR().catch(function () {
                    note.textContent = 'AR could not start on this device.';
                  });
                } else {
                  note.textContent = 'AR is not available in this browser session.';
                }
                btn.textContent = o.label;
              };
              if (mv.loaded) done();
              else {
                mv.addEventListener('load', done, { once: true });
                setTimeout(done, 4000); // never leave the user hanging
              }
            } catch (e) {
              btn.textContent = o.label;
              note.textContent = 'AR could not start on this device.';
            }
          });
        });
        return d;
      }

      soonMarker(el, o, d.reason);
      return d;
    } catch (e) {
      try { soonMarker(el, o, 'AR is not available here.'); } catch (e2) { /* give up quietly */ }
      return { platform: 'other', mode: 'none', reason: 'AR setup failed.' };
    }
  }

  function createViewer(opts) {
    var o = opts_(opts);
    ensureModelViewer();
    var mv = document.createElement('model-viewer');
    mv.setAttribute('src', o.glb);
    mv.setAttribute('ios-src', o.usdz);
    mv.setAttribute('ar', '');
    mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
    mv.setAttribute('ar-scale', 'fixed');
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('poster', o.poster);
    mv.setAttribute('alt', 'Shaddai Arcade cabinet');
    return mv;
  }

  global.ARPlace = { detect: detect, mountButton: mountButton, createViewer: createViewer, version: '1.0.0' };
})(typeof window !== 'undefined' ? window : this);
