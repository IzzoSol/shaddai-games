/*
 * xr-engine.js — Shaddai Arcade XR ENGINE v1.0.0 (2026-11-21).
 *
 * The shared VR/AR layer every original Shaddai Arcade game plugs
 * into. One module, vanilla JS, no build step. It builds ON the
 * arcade vr-kit (public/vr-kit/: xr-session / xr-placement /
 * xr-cabinet / xr-input, exposed as window.ShaddaiXR) — session
 * bootstrap, hit-test placement, cabinet screens and controller
 * polling all delegate to the kit; this file adds the game-facing
 * contract on top: capability status, one-call enter(), AR stage
 * placement with contact shadow, a virtual input object shaped like
 * the handheld-shell input our games already read, and honest
 * Enter VR / Enter AR / ROOM — SOON buttons.
 *
 * Licence provenance (comments only — never user-visible):
 * three.js r128 (the vendored copy at /vendor/three.min.js) is MIT
 * License, Copyright 2010-2026 three.js authors. WebXR session /
 * hit-test patterns follow the Immersive Web samples (MIT License,
 * Copyright 2018 The Immersive Web Community Group). All code in
 * this file is original to the Shaddai Arcade project.
 *
 * ============================ SIM — READ FIRST ============================
 * No headset or AR phone is available in this environment. NOTHING
 * in this engine has run on a real device: every VR/AR surface it
 * drives is SIM until a session has actually run on hardware and
 * someone has seen a stage standing in a real room. Platform facts:
 * iOS Safari does not implement WebXR (iPhone/iPad get the flat and
 * first-person modes); immersive modes target Quest Browser and
 * Chrome on Android (ARCore). Detection below never pretends
 * otherwise — unsupported means the button says ROOM — SOON.
 * ==========================================================================
 *
 * GAME CONTRACT — what a game hands to XREngine.enter():
 *   game = {
 *     id: 'ghostline',
 *     title: 'GHOSTLINE',                 // optional, for stage marquee
 *     canvas: <2D canvas element>,        // 2D canvas games: live screen feed
 *     input: <virtual input object>,      // optional; engine creates one and
 *                                         // fills it from XR controllers —
 *                                         // same {left,right,up,down,a,b,start}
 *                                         // shape as the handheld shell
 *     onXRFrame: function (t, frame, ctx) // optional native-3D games
 *                                         // (divefall / wildspark) render
 *                                         // their own scene here
 *   }
 * And opts may supply { renderer, scene, camera, THREE, stage,
 * domOverlayRoot, onSelect, onEnd } when the page already owns a
 * three.js scene (vr-room.html does).
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var SIM = true;

  /* ------------------------------------------------------------------ */
  /* vr-kit access                                                       */
  /* ------------------------------------------------------------------ */

  var kitBase = '../vr-kit/';
  var KIT_FILES = ['xr-session.js', 'xr-placement.js', 'xr-cabinet.js', 'xr-input.js'];
  var kitPromise = null;

  function kit() {
    return (typeof root !== 'undefined' && root.ShaddaiXR) || null;
  }

  function kitReady(K) {
    return !!(K && K.session && K.placement && K.cabinet && K.input);
  }

  /*
   * ensureKit() -> Promise<ShaddaiXR|null>
   * If the page already loaded the kit scripts, resolves at once.
   * Otherwise lazy-loads them from kitBase (browser only). In
   * non-DOM contexts (tests) it resolves with whatever exists —
   * null when the kit is absent, and every engine entry point
   * degrades honestly on null.
   */
  function ensureKit() {
    var K = kit();
    if (kitReady(K)) return Promise.resolve(K);
    if (typeof document === 'undefined' || !document.createElement) {
      return Promise.resolve(K || null);
    }
    if (kitPromise) return kitPromise;
    kitPromise = new Promise(function (resolve) {
      var i = 0;
      function next() {
        if (i >= KIT_FILES.length) { resolve(kit()); return; }
        var s = document.createElement('script');
        s.src = kitBase + KIT_FILES[i++];
        s.onload = next;
        s.onerror = next; // a missing file must not wedge the engine
        (document.head || document.documentElement).appendChild(s);
      }
      next();
    });
    return kitPromise;
  }

  /* ------------------------------------------------------------------ */
  /* 1. Capability detection                                             */
  /* ------------------------------------------------------------------ */

  /*
   * detect() -> Promise<{
   *   vr: boolean, ar: boolean,          // folded: unknown => false
   *   hasXR: boolean, secureContext: boolean,
   *   platform: string,                   // quest|android|ios|desktop|unknown
   *   reason: string,                     // why a mode is unavailable ('' if both fine)
   *   message: string,                    // platform-honesty text for the page
   *   raw: object|null                    // the kit's own detect() result
   * }>
   * NEVER throws and NEVER rejects — an unsupported browser is a
   * normal answer, not an error. iOS Safari (no navigator.xr) lands
   * here with vr:false, ar:false and a reason that says so.
   */
  function detect() {
    function fallback(reason) {
      return {
        vr: false, ar: false, hasXR: false, secureContext: false,
        platform: 'unknown', reason: reason,
        message: 'WebXR is unavailable in this browser, so VR and AR modes are unavailable here. ' +
          'For VR/AR use the Quest Browser or Chrome on Android — or just play the flat games.',
        raw: null
      };
    }
    return ensureKit().then(function (K) {
      if (!K || !K.session || typeof K.session.detect !== 'function') {
        return fallback('vr-kit session module not loaded');
      }
      return K.session.detect().then(function (sup) {
        var vr = sup.vr === true;
        var ar = sup.ar === true;
        var reason = '';
        if (!sup.hasXR) {
          reason = sup.platform === 'ios'
            ? 'Safari on iPhone/iPad does not support WebXR'
            : 'This browser does not expose WebXR (navigator.xr missing)';
        } else if (!sup.secureContext) {
          reason = 'WebXR needs a secure context (HTTPS or localhost)';
        } else if (!vr && !ar) {
          reason = 'WebXR is present but neither immersive-vr nor immersive-ar is supported on this device';
        } else if (!vr) {
          reason = 'immersive-vr is not supported on this device';
        } else if (!ar) {
          reason = 'immersive-ar is not supported on this device';
        }
        return {
          vr: vr, ar: ar,
          hasXR: !!sup.hasXR, secureContext: !!sup.secureContext,
          platform: sup.platform || 'unknown',
          reason: reason, message: sup.message || '', raw: sup
        };
      }, function () {
        return fallback('capability probe failed');
      });
    }).catch(function () {
      return fallback('capability probe failed');
    });
  }

  /* ------------------------------------------------------------------ */
  /* 5. Virtual input — the handheld-shell shape, fed by XR controllers  */
  /* ------------------------------------------------------------------ */

  var DEADZONE = 0.35;

  /*
   * mapControllerStates(states) -> {left,right,up,down,a,b,start}
   * Pure mapping from kit pollControllers() output (plain data) onto
   * the shell input shape. Either controller may drive it:
   *   thumbstick  x/y past the deadzone  -> left/right/up/down
   *   trigger (0) or primary A/X (4)     -> a
   *   squeeze (1) or secondary B/Y (5)   -> b
   *   thumbstick click (3)               -> start
   *   hand pinch                         -> a
   */
  function mapControllerStates(states) {
    var out = { left: false, right: false, up: false, down: false, a: false, b: false, start: false };
    if (!states) return out;
    for (var i = 0; i < states.length; i++) {
      var st = states[i];
      if (!st) continue;
      var gp = st.gamepad;
      if (gp) {
        var ts = gp.thumbstick || { x: 0, y: 0 };
        if (ts.x < -DEADZONE) out.left = true;
        if (ts.x > DEADZONE) out.right = true;
        if (ts.y < -DEADZONE) out.up = true;
        if (ts.y > DEADZONE) out.down = true;
        if ((gp.trigger && gp.trigger.pressed) || (gp.primary && gp.primary.pressed)) out.a = true;
        if ((gp.squeeze && gp.squeeze.pressed) || (gp.secondary && gp.secondary.pressed)) out.b = true;
        if (gp.thumbstickButton && gp.thumbstickButton.pressed) out.start = true;
      }
      if (st.hand && st.hand.pinch) out.a = true;
    }
    return out;
  }

  /*
   * createVirtualInput() -> {
   *   state: {left,right,up,down,a,b,start},   // held this frame
   *   edges: {a,b,start},                       // just-pressed this update
   *   update(states),                           // feed pollControllers() output
   *   pulse(key),                               // one-frame press (session events)
   *   reset()
   * }
   * A game reads input.state exactly like its shell input object.
   */
  function createVirtualInput() {
    var state = { left: false, right: false, up: false, down: false, a: false, b: false, start: false };
    var edges = { a: false, b: false, start: false };
    var pulsed = { a: false, b: false, start: false };
    var KEYS = ['left', 'right', 'up', 'down', 'a', 'b', 'start'];
    return {
      state: state,
      edges: edges,
      update: function (states) {
        var m = mapControllerStates(states);
        KEYS.forEach(function (k) {
          var now = m[k] || pulsed[k];
          if (k === 'a' || k === 'b' || k === 'start') edges[k] = now && !state[k];
          state[k] = now;
        });
        pulsed.a = pulsed.b = pulsed.start = false;
        return state;
      },
      pulse: function (key) { if (key in pulsed) pulsed[key] = true; },
      reset: function () {
        KEYS.forEach(function (k) { state[k] = false; });
        edges.a = edges.b = edges.start = false;
        pulsed.a = pulsed.b = pulsed.start = false;
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* 3+4. Stage + cabinet rendering                                      */
  /* ------------------------------------------------------------------ */

  var SCALE_MIN = 0.35;
  var SCALE_MAX = 2.5;
  var DEFAULT_STAGE_WIDTH = 1.2; // metres

  function clampScale(s) {
    s = (typeof s === 'number' && isFinite(s)) ? s : 1;
    return Math.max(SCALE_MIN, Math.min(SCALE_MAX, s));
  }

  /*
   * makeContactShadow(THREE, width, depth) -> THREE.Mesh
   * A soft radial-gradient blob on a plane, laid at the stage's
   * base. This is what makes a placed stage read as SITTING on the
   * surface instead of floating above it. The gradient lives on a
   * small canvas texture — no image assets.
   */
  function makeContactShadow(THREE, width, depth) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.32)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.25, depth * 1.3), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.002;
    mesh.renderOrder = 1;
    mesh.name = 'xr-contact-shadow';
    return mesh;
  }

  /* Cabinet delegates — the kit's factory, with engine defaults. */
  function createCabinet(THREE, opts) {
    var K = kit();
    if (!K || !K.cabinet) throw new Error('XREngine.createCabinet: vr-kit not loaded (call XREngine.ensureKit() first)');
    return K.cabinet.createCabinet(THREE, opts || {});
  }

  function createCabinetRow(THREE, defs, opts) {
    var K = kit();
    if (!K || !K.cabinet) throw new Error('XREngine.createCabinetRow: vr-kit not loaded (call XREngine.ensureKit() first)');
    return K.cabinet.createCabinetRow(THREE, defs, opts || {});
  }

  /*
   * createStage(THREE, opts) -> stage
   * opts: { canvas, title, width (m, default 1.2), scale }
   * The AR placeable: a low emerald platform, a mini cabinet fed by
   * the game's 2D canvas standing on it, and the contact shadow
   * under both. For a native-3D game (no canvas) the platform +
   * shadow ship alone and the game anchors its own scene content.
   * stage.setScale(s) is clamped to 0.35–2.5x (the kit's placement
   * clamp) and returns the applied scale.
   */
  function createStage(THREE, opts) {
    opts = opts || {};
    var K = kit();
    if (!K || !K.cabinet || !K.placement) {
      throw new Error('XREngine.createStage: vr-kit not loaded (call XREngine.ensureKit() first)');
    }
    var width = opts.width || DEFAULT_STAGE_WIDTH;
    var depth = width * 0.72;

    var group = new THREE.Group();
    group.name = 'xr-stage:' + (opts.title || 'game');

    var platform = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.045, depth),
      new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.8, metalness: 0.2 })
    );
    platform.position.y = 0.0225;
    group.add(platform);

    var trim = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.01, 0.012, depth * 1.01),
      new THREE.MeshStandardMaterial({
        color: 0x2fe6a8, emissive: 0x2fe6a8, emissiveIntensity: 0.5, roughness: 0.4
      })
    );
    trim.position.y = 0.048;
    group.add(trim);

    group.add(makeContactShadow(THREE, width, depth));

    var cabinet = null;
    if (opts.canvas) {
      cabinet = K.cabinet.createCabinet(THREE, {
        canvas: opts.canvas,
        name: opts.title || 'game',
        width: width * 0.40,
        height: width * 0.98,
        depth: width * 0.36,
        refreshHz: opts.refreshHz || 12
      });
      cabinet.group.position.set(0, 0.05, -depth * 0.08);
      group.add(cabinet.group);
    }

    var scale = clampScale(opts.scale === undefined ? 1 : opts.scale);
    group.scale.set(scale, scale, scale);

    var api = {
      group: group,
      cabinet: cabinet,
      platform: platform,
      setScale: function (s) {
        scale = K.placement.setScale(group, clampScale(s), SCALE_MIN, SCALE_MAX);
        return scale;
      },
      nudgeScale: function (factor) {
        scale = K.placement.nudgeScale(group, factor || 1, SCALE_MIN, SCALE_MAX);
        return scale;
      },
      getScale: function () { return scale; },
      rotateY: function (rad) { return K.placement.rotateY(group, rad); },
      update: function (nowMs) { if (cabinet) return cabinet.update(nowMs); return false; },
      dispose: function () { if (cabinet) cabinet.dispose(); }
    };
    group.userData.stage = api;
    return api;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Session bootstrap                                                */
  /* ------------------------------------------------------------------ */

  var activeHandle = null;

  /*
   * enter({ mode: 'vr'|'ar', game, ... }) -> Promise<handle>
   * handle = { ok:true, mode, session, refSpace, input, stage,
   *            renderer, scene, camera, exit() }
   *       or { ok:false, mode, reason } — unsupported / declined is
   * a normal result, never a rejection.
   *
   * Requests the session through the kit (VR: local-floor; AR:
   * hit-test + local-floor, anchors optional), wires the renderer,
   * and drives the loop: XR controllers are polled into
   * game.input every frame, AR shows the hit-test reticle and the
   * first select places the stage on the real surface (squeeze
   * re-enters move mode, select confirms), and the game's
   * onXRFrame(t, frame, ctx) runs each tick before the render.
   */
  function enter(opts) {
    opts = opts || {};
    var mode = opts.mode === 'ar' ? 'ar' : 'vr';
    var game = opts.game || {};
    var sessionMode = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';

    return ensureKit().then(function (K) {
      if (!K || !K.session) return { ok: false, mode: mode, reason: 'vr-kit session module not loaded' };
      return detect().then(function (sup) {
        if (mode === 'vr' && !sup.vr) return { ok: false, mode: mode, reason: sup.reason || 'immersive-vr unsupported' };
        if (mode === 'ar' && !sup.ar) return { ok: false, mode: mode, reason: sup.reason || 'immersive-ar unsupported' };

        return K.session.startSession(sessionMode, {
          domOverlayRoot: opts.domOverlayRoot || null,
          onEnd: function () { /* wired again below via handle */ },
          onError: function () {}
        }).then(function (sh) {
          var THREE = opts.THREE || root.THREE || null;
          var renderer = opts.renderer || null;
          var scene = opts.scene || null;
          var camera = opts.camera || null;
          var ownsScene = false;

          if (!renderer && THREE) {
            renderer = new THREE.WebGLRenderer({
              canvas: opts.canvas || undefined,
              alpha: mode === 'ar', antialias: true
            });
            if (renderer.outputEncoding !== undefined && THREE.sRGBEncoding !== undefined) {
              renderer.outputEncoding = THREE.sRGBEncoding;
            }
          }
          if (renderer && renderer.xr) {
            renderer.xr.enabled = true;
            if (typeof renderer.xr.setReferenceSpaceType === 'function') {
              renderer.xr.setReferenceSpaceType(sh.refSpaceType);
            }
            if (typeof renderer.xr.setSession === 'function') {
              renderer.xr.setSession(sh.session);
            }
          }
          if (!scene && THREE) {
            ownsScene = true;
            scene = new THREE.Scene();
            scene.add(new THREE.AmbientLight(0x8899aa, 0.7));
            var key = new THREE.DirectionalLight(0xffffff, 0.9);
            key.position.set(1.5, 3, 2);
            scene.add(key);
            if (mode === 'vr') {
              var floor = new THREE.Mesh(
                new THREE.CircleGeometry(4, 40),
                new THREE.MeshStandardMaterial({ color: 0x0a1410, roughness: 1 })
              );
              floor.rotation.x = -Math.PI / 2;
              scene.add(floor);
            }
          }
          if (!camera && THREE) {
            camera = new THREE.PerspectiveCamera(65, 1.4, 0.05, 100);
            camera.position.set(0, 1.5, 0.1);
          }

          var input = game.input || createVirtualInput();
          game.input = input;

          var stage = opts.stage || null;
          if (!stage && scene && THREE && game.canvas) {
            stage = createStage(THREE, {
              canvas: game.canvas, title: game.title || game.id || 'game',
              width: opts.stageWidth || DEFAULT_STAGE_WIDTH
            });
            if (mode === 'vr') stage.group.position.set(0, 0, -1.7);
            scene.add(stage.group);
          } else if (stage && scene && !stage.group.parent) {
            if (mode === 'vr' && opts.stageWidth) stage.setScale(opts.stageWidth / DEFAULT_STAGE_WIDTH);
            scene.add(stage.group);
          }

          var handle = {
            ok: true, mode: mode, SIM: SIM,
            session: sh.session, refSpace: sh.refSpace, refSpaceType: sh.refSpaceType,
            granted: sh.granted, input: input, stage: stage,
            renderer: renderer, scene: scene, camera: camera,
            active: true,
            exit: function () { return exit(); }
          };

          /* --- AR placement: reticle + select-to-place --- */
          var placer = null;
          var reticle = null;
          var placed = false;
          if (mode === 'ar' && stage && THREE && sh.session && typeof sh.session.requestHitTestSource === 'function') {
            try {
              placer = K.placement.createPlacer({
                session: sh.session, refSpace: sh.refSpace, anchorsGranted: sh.granted.anchors
              });
              reticle = K.placement.makeReticle(THREE);
              if (scene) scene.add(reticle);
              placer.init().catch(function () { /* hit-test unavailable: stage stays at origin */ });
            } catch (e) { placer = null; reticle = null; }
          }

          var unsubscribe = null;
          if (K.input && typeof K.input.onSessionInput === 'function') {
            unsubscribe = K.input.onSessionInput(sh.session, {
              onSelect: function (ev) {
                input.pulse('a');
                if (placer && stage) {
                  if (!placed) {
                    placer.place(stage.group).then(function () { placed = true; });
                  } else if (placer.isMoving()) {
                    placer.confirmMove();
                  }
                }
                if (typeof opts.onSelect === 'function') opts.onSelect(ev, handle);
                if (typeof game.onXRSelect === 'function') game.onXRSelect(ev, handle);
              },
              onSqueeze: function () {
                input.pulse('b');
                if (placer && stage && placed) placer.beginMove(stage.group);
              }
            });
          }

          function cleanup() {
            handle.active = false;
            if (renderer && typeof renderer.setAnimationLoop === 'function') renderer.setAnimationLoop(null);
            if (placer) placer.dispose();
            if (unsubscribe) unsubscribe();
            if (activeHandle === handle) activeHandle = null;
            if (typeof opts.onEnd === 'function') opts.onEnd(handle);
          }
          sh.session.addEventListener('end', cleanup);
          handle._cleanup = cleanup;

          if (renderer && typeof renderer.setAnimationLoop === 'function') {
            renderer.setAnimationLoop(function (t, frame) {
              if (frame && K.input) {
                var states = K.input.pollControllers(sh.session, frame, sh.refSpace);
                input.update(states);
                handle.lastStates = states;
              }
              if (placer && frame) {
                var hit = placer.update(frame);
                if (reticle) K.placement.driveReticle(reticle, hit && hit.visible ? hit.pose : null);
                placer.trackAnchor(frame);
              }
              if (stage) stage.update(t);
              var ctx = {
                engine: api, handle: handle, input: input, stage: stage,
                session: sh.session, refSpace: sh.refSpace, THREE: THREE
              };
              if (typeof game.onXRFrame === 'function') game.onXRFrame(t, frame, ctx);
              if (typeof opts.onFrame === 'function') opts.onFrame(t, frame, ctx);
              if (opts.render !== false && scene && camera) renderer.render(scene, camera);
            });
          }

          activeHandle = handle;
          return handle;
        }).catch(function (err) {
          return { ok: false, mode: mode, reason: (err && err.message) || 'session request declined' };
        });
      });
    }).catch(function (err) {
      return { ok: false, mode: opts.mode === 'ar' ? 'ar' : 'vr', reason: (err && err.message) || 'enter failed' };
    });
  }

  /* exit() -> Promise<boolean> — end the active session cleanly. */
  function exit() {
    return ensureKit().then(function (K) {
      if (K && K.session && typeof K.session.endSession === 'function') {
        return K.session.endSession();
      }
      return false;
    });
  }

  function getActive() { return activeHandle; }

  /* ------------------------------------------------------------------ */
  /* 6. Buttons + labelling                                              */
  /* ------------------------------------------------------------------ */

  /*
   * buttonPlan(support) -> [{mode, enabled, label}] — pure decision
   * used by mountButton (and asserted by the harness): a mode that
   * is supported gets a working ENTER button (labelled SIM); a mode
   * that cannot genuinely sit in the world gets a disabled
   * ROOM — SOON marker instead of a fake view.
   */
  function buttonPlan(support) {
    support = support || {};
    return [
      {
        mode: 'vr',
        enabled: support.vr === true,
        label: support.vr === true ? 'ENTER VR (SIM)' : 'ROOM — SOON'
      },
      {
        mode: 'ar',
        enabled: support.ar === true,
        label: support.ar === true ? 'ENTER AR (SIM)' : 'ROOM — SOON'
      }
    ];
  }

  /*
   * mountButton(el, game, opts) -> Promise<{plan, support, refresh}>
   * Renders the platform-honesty message + the two buttons into el.
   * Enabled buttons call enter({mode, game, ...opts}); disabled ones
   * are real <button disabled> elements labelled ROOM — SOON.
   */
  function mountButton(el, game, opts) {
    opts = opts || {};
    if (!el || typeof document === 'undefined') {
      return Promise.resolve({ plan: buttonPlan({}), support: null, refresh: function () {} });
    }
    function render(support) {
      var plan = buttonPlan(support || {});
      el.innerHTML = '';
      var note = document.createElement('p');
      note.className = 'xr-engine-note';
      note.textContent = (support && support.message)
        ? support.message
        : 'Checking WebXR support…';
      el.appendChild(note);
      plan.forEach(function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'xr-engine-btn xr-engine-btn-' + item.mode + (item.enabled ? '' : ' is-soon');
        b.textContent = item.label;
        b.disabled = !item.enabled;
        if (item.enabled) {
          b.addEventListener('click', function () {
            var o = { mode: item.mode, game: game };
            Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
            enter(o).then(function (h) {
              if (!h.ok && typeof opts.onError === 'function') opts.onError(h);
              if (!h.ok) {
                note.textContent = 'Could not start ' + item.mode.toUpperCase() +
                  ': ' + h.reason + ' (SIM — flat mode still works.)';
              }
            });
          });
        } else {
          b.title = (support && support.reason) || 'Not supported on this device yet';
        }
        el.appendChild(b);
      });
      return plan;
    }
    var current = render(null);
    return detect().then(function (support) {
      current = render(support);
      return {
        plan: current, support: support,
        refresh: function () { return detect().then(function (s) { current = render(s); return current; }); }
      };
    });
  }

  /* ------------------------------------------------------------------ */

  var api = {
    version: VERSION,
    SIM: SIM,
    kitBase: kitBase,
    setKitBase: function (base) { kitBase = base; kitPromise = null; },
    ensureKit: ensureKit,
    kit: kit,
    detect: detect,
    enter: enter,
    exit: exit,
    getActive: getActive,
    createStage: createStage,
    createCabinet: createCabinet,
    createCabinetRow: createCabinetRow,
    makeContactShadow: makeContactShadow,
    createVirtualInput: createVirtualInput,
    mapControllerStates: mapControllerStates,
    buttonPlan: buttonPlan,
    mountButton: mountButton,
    clampScale: clampScale,
    SCALE_MIN: SCALE_MIN,
    SCALE_MAX: SCALE_MAX,
    DEFAULT_STAGE_WIDTH: DEFAULT_STAGE_WIDTH,
    DEADZONE: DEADZONE
  };

  root.XREngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
