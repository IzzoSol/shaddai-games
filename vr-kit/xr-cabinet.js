/*
 * xr-cabinet.js — Shaddai Arcade VR Kit: cabinet with a LIVE game screen.
 *
 * Original code written for the Shaddai Arcade project (2026-11-21).
 * Uses the three.js API (MIT License, Copyright 2010-2026 three.js
 * authors — notice kept in comments only). three.js is NOT vendored
 * by this kit: the page passes its own THREE in, matching how the
 * project already loads three@0.180.0 through an import map.
 *
 * A cabinet is plain original geometry (boxes + planes, emerald trim)
 * whose screen is a THREE.CanvasTexture fed by any 2D canvas — our
 * games are canvas games, so a game running in a hidden/visible 2D
 * canvas becomes the cabinet's live screen with no changes to the
 * game itself.
 *
 * Refresh strategy: uploading a canvas texture every frame is the
 * expensive part. update() throttles needsUpdate to a configurable
 * rate (default 10 Hz) with a markDirty() fast path for games that
 * only redraw on change. One shared ticker can drive every cabinet.
 */
(function (root) {
  'use strict';

  var XR = root.ShaddaiXR || (root.ShaddaiXR = {});

  var DEFAULTS = {
    width: 0.72,        // metres — real upright cabinet footprint
    height: 1.85,
    depth: 0.80,
    screenAspect: 4 / 3,
    bodyColor: 0x10151c,
    trimColor: 0x2fe6a8,   // arcade emerald
    marqueeColor: 0x0d3b2a,
    refreshHz: 10,
    name: 'cabinet'
  };

  function buildCabinet(THREE, opts) {
    opts = opts || {};
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) { o[k] = (opts[k] !== undefined) ? opts[k] : DEFAULTS[k]; });

    var group = new THREE.Group();
    group.name = o.name;

    var bodyMat = new THREE.MeshStandardMaterial({ color: o.bodyColor, roughness: 0.85, metalness: 0.15 });
    var trimMat = new THREE.MeshStandardMaterial({
      color: o.trimColor, emissive: o.trimColor, emissiveIntensity: 0.55, roughness: 0.4
    });

    // Main body: slightly tapered look via two boxes (lower cab + head).
    var lower = new THREE.Mesh(new THREE.BoxGeometry(o.width, o.height * 0.62, o.depth), bodyMat);
    lower.position.y = o.height * 0.31;
    lower.rotation.x = 0.06; // gentle control-panel lean
    group.add(lower);

    var head = new THREE.Mesh(new THREE.BoxGeometry(o.width, o.height * 0.44, o.depth * 0.82), bodyMat);
    head.position.y = o.height * 0.80;
    head.position.z = -o.depth * 0.06;
    group.add(head);

    // Marquee strip across the top, lit emerald.
    var marquee = new THREE.Mesh(
      new THREE.BoxGeometry(o.width * 0.94, o.height * 0.10, 0.03),
      new THREE.MeshStandardMaterial({ color: o.marqueeColor, emissive: o.trimColor, emissiveIntensity: 0.35 })
    );
    marquee.position.set(0, o.height * 0.965, o.depth * 0.36);
    group.add(marquee);

    // Side trim rails (the glow lines that read as "our" cabinets).
    [-1, 1].forEach(function (side) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, o.height * 0.92, 0.02), trimMat);
      rail.position.set(side * (o.width / 2 + 0.005), o.height * 0.48, o.depth * 0.40);
      group.add(rail);
    });

    // Plinth.
    var plinth = new THREE.Mesh(new THREE.BoxGeometry(o.width * 1.04, 0.05, o.depth * 1.02), bodyMat);
    plinth.position.y = 0.025;
    group.add(plinth);

    // Screen: plane on the head's face, fed by the game's canvas.
    var screenH = o.height * 0.34;
    var screenW = screenH * o.screenAspect;
    if (screenW > o.width * 0.9) { screenW = o.width * 0.9; screenH = screenW / o.screenAspect; }

    var canvas = opts.canvas || null;
    var texture = null;
    var screenMat;
    if (canvas) {
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      screenMat = new THREE.MeshBasicMaterial({ map: texture });
    } else {
      screenMat = new THREE.MeshBasicMaterial({ color: 0x06110c });
    }
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
    screen.position.set(0, o.height * 0.80, o.depth * 0.355);
    screen.name = o.name + ':screen';
    group.add(screen);

    // Bezel frame around the screen.
    var bezel = new THREE.Mesh(
      new THREE.BoxGeometry(screenW + 0.04, screenH + 0.04, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.6 })
    );
    bezel.position.set(0, o.height * 0.80, o.depth * 0.345);
    group.add(bezel);
    group.remove(screen); group.add(screen); // screen back on top of bezel

    var state = {
      lastUpload: 0,
      dirty: true,
      refreshMs: 1000 / Math.max(1, o.refreshHz)
    };

    var api = {
      group: group,
      screen: screen,
      texture: texture,
      options: o,

      /* Point the screen at a (different) game canvas. */
      setCanvas: function (newCanvas) {
        canvas = newCanvas;
        if (texture) { texture.image = newCanvas; state.dirty = true; }
        else if (newCanvas) {
          texture = new THREE.CanvasTexture(newCanvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          screen.material = new THREE.MeshBasicMaterial({ map: texture });
          api.texture = texture;
          state.dirty = true;
        }
      },

      getCanvas: function () { return canvas; },

      /* Force the next update() to upload the texture. */
      markDirty: function () { state.dirty = true; },

      setRefreshHz: function (hz) { state.refreshMs = 1000 / Math.max(1, hz); },

      /*
       * update(nowMs) -> true if the texture was uploaded this call.
       * Call every frame; the throttle keeps uploads at refreshHz.
       */
      update: function (nowMs) {
        if (!texture) return false;
        if (!state.dirty && (nowMs - state.lastUpload) < state.refreshMs) return false;
        texture.needsUpdate = true;
        state.lastUpload = nowMs;
        state.dirty = false;
        return true;
      },

      dispose: function () {
        if (texture && texture.dispose) texture.dispose();
        group.traverse(function (node) {
          if (node.geometry && node.geometry.dispose) node.geometry.dispose();
          if (node.material && node.material.dispose) node.material.dispose();
        });
      }
    };
    screen.userData.cabinet = api;
    group.userData.cabinet = api;
    return api;
  }

  /*
   * createCabinetRow(THREE, defs, opts) — defs: [{name, canvas, ...}]
   * Lays cabinets along a gentle arc facing the origin (the player),
   * the natural room layout. opts: { radius (default 2.6m),
   * arcDeg (default 100), y (default 0) }.
   * Returns the array of cabinet apis.
   */
  function createCabinetRow(THREE, defs, opts) {
    opts = opts || {};
    var radius = opts.radius || 2.6;
    var arc = (opts.arcDeg || 100) * Math.PI / 180;
    var n = defs.length;
    var out = [];
    defs.forEach(function (def, i) {
      var cab = buildCabinet(THREE, def);
      var t = n === 1 ? 0 : (i / (n - 1) - 0.5);
      var ang = t * arc;
      cab.group.position.set(Math.sin(ang) * radius, opts.y || 0, -Math.cos(ang) * radius);
      cab.group.rotation.y = ang; // face the player at origin
      out.push(cab);
    });
    return out;
  }

  /* ---- Selection: one picking path for controller, hand, mouse ---- */

  /*
   * pickFromRay(THREE, origin, direction, cabinets) ->
   *   { cabinet, point:{x,y,z}, screenUV:{x,y}|null } | null
   * screenUV is set when the hit lands on a cabinet's screen mesh —
   * uv (0..1, origin bottom-left) lets the page forward the tap into
   * the game's own canvas coordinates.
   */
  function pickFromRay(THREE, origin, direction, cabinets) {
    if (!THREE || !cabinets || !cabinets.length) return null;
    var raycaster = new THREE.Raycaster(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(direction.x, direction.y, direction.z).normalize()
    );
    var meshes = [];
    cabinets.forEach(function (c) { if (c.group) meshes.push(c.group); });
    var hits = raycaster.intersectObjects(meshes, true);
    if (!hits.length) return null;
    var hit = hits[0];
    var obj = hit.object;
    var cab = null;
    var node = obj;
    while (node && !cab) {
      if (node.userData && node.userData.cabinet) cab = node.userData.cabinet;
      node = node.parent;
    }
    if (!cab && obj.userData && obj.userData.cabinet) cab = obj.userData.cabinet;
    var uv = null;
    if (cab && obj === cab.screen && hit.uv) uv = { x: hit.uv.x, y: hit.uv.y };
    return {
      cabinet: cab,
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      screenUV: uv
    };
  }

  /*
   * forwardTapToCanvas(canvas, uv) — dispatch a synthetic pointer
   * tap into the game's 2D canvas at the picked spot, so a player
   * can poke the live screen (menus, buttons) without the game
   * knowing anything about XR. Returns true if dispatched.
   * Note: games listening for keyboard input still need focus or
   * their own on-screen controls; this covers pointer-driven UI.
   */
  function forwardTapToCanvas(canvas, uv) {
    if (!canvas || !uv || typeof document === 'undefined') return false;
    var rect = (typeof canvas.getBoundingClientRect === 'function')
      ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width, height: canvas.height };
    var x = rect.left + uv.x * rect.width;
    var y = rect.top + (1 - uv.y) * rect.height;
    function fire(type) {
      var ev;
      try {
        ev = new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 991 });
      } catch (e) {
        ev = document.createEvent('MouseEvents');
        ev.initMouseEvent(type, true, true, null, 0, 0, 0, x, y, false, false, false, false, 0, null);
      }
      canvas.dispatchEvent(ev);
    }
    fire('pointerdown'); fire('pointerup'); fire('click');
    return true;
  }

  /*
   * bindControllerSelect(THREE, controller, cabinets, onPick)
   * controller: a THREE.Group from renderer.xr.getController(i) (or
   * getControllerGrip). Listens for 'selectstart'; the ray is the
   * controller's -Z. onPick(result, event) receives pickFromRay data.
   */
  function bindControllerSelect(THREE, controller, cabinets, onPick) {
    if (!controller || typeof controller.addEventListener !== 'function') return false;
    controller.addEventListener('selectstart', function (event) {
      var m = controller.matrixWorld;
      if (!m || !m.elements) return;
      var e = m.elements;
      var origin = { x: e[12], y: e[13], z: e[14] };
      var direction = { x: -e[8], y: -e[9], z: -e[10] };
      var hit = pickFromRay(THREE, origin, direction, cabinets);
      if (hit && onPick) onPick(hit, event);
    });
    return true;
  }

  /*
   * bindMousePick(THREE, domElement, camera, cabinets, onPick)
   * Desktop preview fallback: click in the flat view picks cabinets.
   */
  function bindMousePick(THREE, domElement, camera, cabinets, onPick) {
    if (!domElement || !camera) return false;
    domElement.addEventListener('click', function (ev) {
      var rect = domElement.getBoundingClientRect();
      var nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      var ny = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      var vec = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
      var dir = vec.sub(camera.position).normalize();
      var hit = pickFromRay(THREE,
        { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        { x: dir.x, y: dir.y, z: dir.z }, cabinets);
      if (hit && onPick) onPick(hit, ev);
    });
    return true;
  }

  XR.cabinet = {
    DEFAULTS: DEFAULTS,
    createCabinet: buildCabinet,
    createCabinetRow: createCabinetRow,
    pickFromRay: pickFromRay,
    forwardTapToCanvas: forwardTapToCanvas,
    bindControllerSelect: bindControllerSelect,
    bindMousePick: bindMousePick
  };
})(typeof window !== 'undefined' ? window : globalThis);
