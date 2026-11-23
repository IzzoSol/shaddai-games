/*
 * xr-session.js — Shaddai Arcade VR Kit: WebXR session bootstrap.
 *
 * Original code written for the Shaddai Arcade project (2026-11-21).
 * Session/feature patterns follow the W3C WebXR Device API and the
 * canonical Immersive Web sample structure (immersive-web/webxr-samples,
 * MIT License, Copyright 2018 The Immersive Web Community Group — notice
 * kept here in comments only, per project policy: nothing user-visible
 * ever carries credits). API facts checked against MDN WebXR docs and
 * the three.js WebXR examples (MIT) on 2026-11-21.
 *
 * Plain script, no build step. Attaches `ShaddaiXR.session` to the
 * global object. Safe to load anywhere: with no navigator.xr present
 * every entry point resolves cleanly instead of throwing.
 */
(function (root) {
  'use strict';

  var XR = root.ShaddaiXR || (root.ShaddaiXR = {});

  function nav() {
    return typeof navigator !== 'undefined' ? navigator : null;
  }

  function hasXR() {
    var n = nav();
    return !!(n && 'xr' in n && n.xr &&
      typeof n.xr.requestSession === 'function' &&
      typeof n.xr.isSessionSupported === 'function');
  }

  function isSecure() {
    if (typeof root.isSecureContext === 'boolean') return root.isSecureContext;
    // In non-browser contexts (tests) treat as secure; browsers set the flag.
    return typeof document === 'undefined';
  }

  function guessPlatform() {
    var n = nav();
    var ua = (n && n.userAgent) || '';
    if (/Quest|OculusBrowser/i.test(ua)) return 'quest';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Macintosh/i.test(ua) && n && 'maxTouchPoints' in n && n.maxTouchPoints > 1) return 'ios'; // iPadOS masquerades as Mac
    if (/Windows|Macintosh|Linux/i.test(ua)) return 'desktop';
    return 'unknown';
  }

  /*
   * platformMessage(support) -> string
   * The platform-honesty helper: given a detect() result, returns the
   * message the page should show the player. Never throws.
   */
  function platformMessage(support) {
    support = support || {};
    if (!support.secureContext) {
      return 'WebXR needs a secure page (HTTPS). Open this page over HTTPS to use VR/AR — the flat games still work here.';
    }
    if (!support.hasXR) {
      if (support.platform === 'ios') {
        return 'Safari on iPhone/iPad does not support WebXR, so VR and AR modes are unavailable here. ' +
          'For VR/AR use the Quest Browser or Chrome on Android — or just play the flat games on this page.';
      }
      return 'This browser does not expose WebXR, so VR and AR modes are unavailable here. ' +
        'Try the Quest Browser or Chrome on Android for the room, or play the flat games on this page.';
    }
    if (support.vr && support.ar) {
      return 'This device supports both VR and AR (passthrough) room modes.';
    }
    if (support.vr) {
      return 'This device supports the VR room. AR passthrough placement is not available here.';
    }
    if (support.ar) {
      return 'This device supports the AR room: cabinets can be placed in your real room. VR mode is not available here.';
    }
    return 'WebXR is present but neither immersive-vr nor immersive-ar is supported on this device. The flat games still work here.';
  }

  /*
   * detect() -> Promise<{
   *   hasXR: boolean, secureContext: boolean,
   *   vr: boolean|null, ar: boolean|null,   // null = could not be determined
   *   platform: string, message: string
   * }>
   * Never rejects. isSessionSupported() rejections are folded into nulls.
   */
  function detect() {
    var base = {
      hasXR: hasXR(),
      secureContext: isSecure(),
      vr: null,
      ar: null,
      platform: guessPlatform(),
      message: ''
    };
    if (!base.hasXR || !base.secureContext) {
      base.message = platformMessage(base);
      return Promise.resolve(base);
    }
    var xr = nav().xr;
    function probe(mode) {
      try {
        return Promise.resolve(xr.isSessionSupported(mode)).then(
          function (ok) { return !!ok; },
          function () { return null; }
        );
      } catch (e) {
        return Promise.resolve(null);
      }
    }
    return Promise.all([probe('immersive-vr'), probe('immersive-ar')]).then(function (r) {
      base.vr = r[0];
      base.ar = r[1];
      base.message = platformMessage(base);
      return base;
    });
  }

  /*
   * Feature sets, tried in order. local-floor is what a standing room
   * wants; some runtimes grant 'local' only, so we retry down the chain
   * rather than failing the session. AR needs hit-test to place
   * cabinets in the real room; anchors/dom-overlay/light-estimation
   * are nice-to-haves and stay optional.
   */
  var FEATURE_ATTEMPTS = {
    'immersive-vr': [
      { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor'] },
      { requiredFeatures: ['local'], optionalFeatures: ['local-floor', 'bounded-floor'] }
    ],
    'immersive-ar': [
      { requiredFeatures: ['hit-test', 'local-floor'], optionalFeatures: ['anchors', 'dom-overlay', 'light-estimation', 'hand-tracking'] },
      { requiredFeatures: ['hit-test', 'local'], optionalFeatures: ['anchors', 'local-floor', 'dom-overlay', 'light-estimation', 'hand-tracking'] },
      { requiredFeatures: ['hit-test'], optionalFeatures: ['local', 'local-floor', 'anchors'] }
    ]
  };

  var REFSPACE_FALLBACK = ['local-floor', 'local', 'viewer'];

  function requestRefSpace(session, preferred) {
    var order = [];
    if (preferred) order.push(preferred);
    REFSPACE_FALLBACK.forEach(function (t) { if (order.indexOf(t) < 0) order.push(t); });
    var i = 0;
    function next() {
      if (i >= order.length) return Promise.reject(new Error('No usable reference space'));
      var type = order[i++];
      var p;
      try { p = session.requestReferenceSpace(type); } catch (e) { return next(); }
      return Promise.resolve(p).then(
        function (space) { return { space: space, type: type }; },
        function () { return next(); }
      );
    }
    return next();
  }

  /*
   * startSession(mode, opts) -> Promise<{
   *   session, refSpace, refSpaceType, mode,
   *   granted: { anchors: bool, domOverlay: bool, handTracking: bool, hitTest: bool }
   * }>
   * opts: { domOverlayRoot?: Element, extraOptionalFeatures?: string[],
   *         onEnd?: fn, onError?: fn(err) }
   * Must be called from a user gesture (button click) or the browser
   * will reject it. Rejects with the last error if every feature
   * attempt fails; opts.onError is also notified.
   */
  var active = null;

  function startSession(mode, opts) {
    opts = opts || {};
    if (!hasXR()) {
      var err = new Error('WebXR not available in this browser');
      if (opts.onError) opts.onError(err);
      return Promise.reject(err);
    }
    var attempts = (FEATURE_ATTEMPTS[mode] || []).slice();
    if (!attempts.length) {
      var bad = new Error('Unsupported session mode: ' + mode);
      if (opts.onError) opts.onError(bad);
      return Promise.reject(bad);
    }
    var xr = nav().xr;
    var idx = 0;
    var lastErr = null;

    function tryNext() {
      if (idx >= attempts.length) {
        if (opts.onError) opts.onError(lastErr);
        return Promise.reject(lastErr || new Error('Could not start ' + mode + ' session'));
      }
      var a = attempts[idx++];
      var init = {
        requiredFeatures: a.requiredFeatures.slice(),
        optionalFeatures: a.optionalFeatures.slice()
      };
      if (opts.extraOptionalFeatures) {
        opts.extraOptionalFeatures.forEach(function (f) {
          if (init.optionalFeatures.indexOf(f) < 0) init.optionalFeatures.push(f);
        });
      }
      if (opts.domOverlayRoot && init.optionalFeatures.indexOf('dom-overlay') < 0) {
        init.optionalFeatures.push('dom-overlay');
      }
      if (opts.domOverlayRoot) init.domOverlay = { root: opts.domOverlayRoot };

      var p;
      try { p = xr.requestSession(mode, init); } catch (e) { lastErr = e; return tryNext(); }
      return Promise.resolve(p).then(function (session) {
        return requestRefSpace(session, mode === 'immersive-ar' ? 'local' : 'local-floor')
          .then(function (rs) {
            var granted = {
              anchors: false, domOverlay: false, handTracking: false, hitTest: false
            };
            try {
              var enabled = session.enabledFeatures || [];
              granted.anchors = enabled.indexOf('anchors') >= 0;
              granted.domOverlay = enabled.indexOf('dom-overlay') >= 0;
              granted.handTracking = enabled.indexOf('hand-tracking') >= 0;
              granted.hitTest = enabled.indexOf('hit-test') >= 0;
            } catch (e) { /* enabledFeatures is best-effort introspection */ }

            var handle = {
              session: session,
              refSpace: rs.space,
              refSpaceType: rs.type,
              mode: mode,
              granted: granted,
              ended: false
            };
            session.addEventListener('end', function () {
              handle.ended = true;
              if (active === handle) active = null;
              if (opts.onEnd) opts.onEnd(handle);
            });
            active = handle;
            return handle;
          });
      }, function (e) { lastErr = e; return tryNext(); });
    }
    return tryNext();
  }

  function getActive() { return active; }

  function endSession() {
    if (!active) return Promise.resolve(false);
    var s = active.session;
    active = null;
    try { return Promise.resolve(s.end()).then(function () { return true; }); }
    catch (e) { return Promise.resolve(false); }
  }

  XR.session = {
    hasXR: hasXR,
    detect: detect,
    platformMessage: platformMessage,
    guessPlatform: guessPlatform,
    startSession: startSession,
    endSession: endSession,
    getActive: getActive,
    requestRefSpace: requestRefSpace,
    FEATURE_ATTEMPTS: FEATURE_ATTEMPTS,
    REFSPACE_FALLBACK: REFSPACE_FALLBACK.slice()
  };
})(typeof window !== 'undefined' ? window : globalThis);
