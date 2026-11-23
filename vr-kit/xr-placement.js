/*
 * xr-placement.js — Shaddai Arcade VR Kit: AR hit-test placement.
 *
 * Original code written for the Shaddai Arcade project (2026-11-21).
 * The hit-test flow follows the W3C WebXR Hit Test Module as
 * demonstrated in the canonical Immersive Web samples
 * (immersive-web/webxr-samples, MIT License, Copyright 2018 The
 * Immersive Web Community Group — notice kept in comments only) and
 * the three.js webxr_ar_hittest example (MIT). API details checked
 * against MDN on 2026-11-21.
 *
 * Design: this module deals in PLAIN DATA ({position, quaternion,
 * matrix}) so the room page can render the reticle however it likes.
 * A convenience makeReticle(THREE) builds the standard ring mesh.
 * Poses come from the viewer-centred hit-test source: point the
 * device at a floor/table, the reticle rides the surface, `select`
 * (tap / trigger / pinch) places the cabinet there.
 */
(function (root) {
  'use strict';

  var XR = root.ShaddaiXR || (root.ShaddaiXR = {});

  /* Reticle look: emerald ring, arcade identity. Data only. */
  var RETICLE = {
    innerRadius: 0.14,
    outerRadius: 0.20,
    segments: 32,
    color: 0x2fe6a8,
    dotRadius: 0.02,
    opacity: 0.9
  };

  function poseToData(pose) {
    var t = pose.transform;
    return {
      position: { x: t.position.x, y: t.position.y, z: t.position.z },
      quaternion: { x: t.orientation.x, y: t.orientation.y, z: t.orientation.z, w: t.orientation.w },
      matrix: Array.prototype.slice.call(t.matrix)
    };
  }

  function applyPoseToObject(obj, data) {
    if (!obj || !data) return false;
    if (obj.position && obj.position.set) {
      obj.position.set(data.position.x, data.position.y, data.position.z);
    }
    if (obj.quaternion && obj.quaternion.set) {
      obj.quaternion.set(data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w);
    }
    return true;
  }

  /*
   * makeReticle(THREE) -> THREE.Mesh ring lying flat (rotated -90 deg
   * about X in geometry space), matrixAutoUpdate=false: the caller
   * drives it from the pose matrix each frame, the canonical pattern.
   */
  function makeReticle(THREE) {
    var geo = new THREE.RingGeometry(RETICLE.innerRadius, RETICLE.outerRadius, RETICLE.segments);
    geo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshBasicMaterial({
      color: RETICLE.color, transparent: true, opacity: RETICLE.opacity, side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    return mesh;
  }

  function driveReticle(mesh, data) {
    if (!mesh) return;
    if (!data) { mesh.visible = false; return; }
    mesh.visible = true;
    if (mesh.matrix && mesh.matrix.fromArray) mesh.matrix.fromArray(data.matrix);
    if (mesh.matrixWorldNeedsUpdate !== undefined) mesh.matrixWorldNeedsUpdate = true;
  }

  /*
   * createPlacer({ session, refSpace, anchorsGranted })
   *
   * Lifecycle:
   *   var placer = ShaddaiXR.placement.createPlacer({session, refSpace});
   *   await placer.init();              // creates the hit-test source
   *   // per XR frame:
   *   var hit = placer.update(frame);   // {visible, pose, result} | {visible:false}
   *   // on 'select' (wire via xr-input or session events):
   *   var res = await placer.place(cabinetGroup);   // {placed, anchored}
   *   placer.beginMove(cabinetGroup);   // cabinet follows the reticle
   *   placer.confirmMove();             // ...until confirmed (or cancelMove())
   *   placer.dispose();                 // cancels the source
   */
  function createPlacer(opts) {
    opts = opts || {};
    var session = opts.session;
    var refSpace = opts.refSpace;
    if (!session || typeof session.requestHitTestSource !== 'function') {
      throw new Error('createPlacer: session with hit-test support is required');
    }
    if (!refSpace) throw new Error('createPlacer: refSpace is required');

    var hitTestSource = null;
    var viewerSpace = null;
    var lastHit = null;      // { poseData, result } from the latest frame
    var moving = null;       // object currently following the reticle
    var disposed = false;

    function init() {
      return Promise.resolve(session.requestReferenceSpace('viewer')).then(function (vs) {
        viewerSpace = vs;
        return session.requestHitTestSource({ space: vs, entityTypes: ['plane'] });
      }).then(function (src) {
        hitTestSource = src;
        session.addEventListener('end', dispose);
        return api;
      });
    }

    /* Call once per XR frame. Returns plain data; never throws. */
    function update(frame) {
      if (disposed || !frame || !hitTestSource || typeof frame.getHitTestResults !== 'function') {
        lastHit = null;
        return { visible: false };
      }
      var results;
      try { results = frame.getHitTestResults(hitTestSource); }
      catch (e) { lastHit = null; return { visible: false }; }
      if (!results || !results.length) {
        lastHit = null;
        return { visible: false };
      }
      var result = results[0];
      var pose = null;
      try { pose = result.getPose(refSpace); } catch (e) { pose = null; }
      if (!pose) { lastHit = null; return { visible: false }; }
      var data = poseToData(pose);
      lastHit = { pose: data, result: result };
      if (moving) applyPoseToObject(moving, data);
      return { visible: true, pose: data, result: result };
    }

    /*
     * place(target) -> Promise<{placed:boolean, anchored:boolean}>
     * Snaps target to the latest hit pose. If the session granted the
     * anchors feature and the hit result supports createAnchor(), the
     * target is anchored to the real surface so the runtime keeps it
     * registered as tracking refines. Anchor pose updates are exposed
     * via trackAnchor(frame) for callers that keep the anchor.
     */
    var anchor = null;
    var anchoredTarget = null;
    function place(target) {
      if (!target || !lastHit) return Promise.resolve({ placed: false, anchored: false });
      applyPoseToObject(target, lastHit.pose);
      anchor = null; anchoredTarget = null;
      var result = lastHit.result;
      if (opts.anchorsGranted && result && typeof result.createAnchor === 'function') {
        var p;
        try { p = result.createAnchor(); } catch (e) { p = null; }
        if (p && typeof p.then === 'function') {
          return p.then(function (a) {
            anchor = a; anchoredTarget = target;
            return { placed: true, anchored: true };
          }, function () { return { placed: true, anchored: false }; });
        }
      }
      return Promise.resolve({ placed: true, anchored: false });
    }

    /* If an anchor is live, re-apply its pose for this frame. */
    function trackAnchor(frame) {
      if (!anchor || !anchoredTarget || !frame || typeof frame.getPose !== 'function') return false;
      if (!anchor.requestSpace) return false;
      var pose = null;
      try { pose = frame.getPose(anchor.requestSpace, refSpace); } catch (e) { pose = null; }
      if (!pose) return false;
      return applyPoseToObject(anchoredTarget, poseToData(pose));
    }

    function beginMove(target) { moving = target || null; }
    function confirmMove() {
      var t = moving; moving = null;
      if (t && lastHit) applyPoseToObject(t, lastHit.pose);
      return t;
    }
    function cancelMove() { moving = null; }
    function isMoving() { return !!moving; }

    function dispose() {
      if (disposed) return;
      disposed = true;
      moving = null;
      if (hitTestSource && typeof hitTestSource.cancel === 'function') {
        try { hitTestSource.cancel(); } catch (e) {}
      }
      hitTestSource = null;
      anchor = null; anchoredTarget = null;
    }

    var api = {
      init: init,
      update: update,
      place: place,
      trackAnchor: trackAnchor,
      beginMove: beginMove,
      confirmMove: confirmMove,
      cancelMove: cancelMove,
      isMoving: isMoving,
      dispose: dispose,
      getLastHit: function () { return lastHit; },
      hasSource: function () { return !!hitTestSource; }
    };
    return api;
  }

  /*
   * Transient input (phone screen tap): the input source exists only
   * while the finger is down, so its hit-test source is per-source.
   * Usage inside a 'select' event handler:
   *   var src = await placer.requestTransientSource(event.inputSource);
   *   var hit = placer.transientHit(event.frame, src); // pose data | null
   */
  function requestTransientSource(session, inputSource) {
    if (!session || typeof session.requestHitTestSourceForTransientInput !== 'function') {
      return Promise.resolve(null);
    }
    var profile = (inputSource && inputSource.profiles && inputSource.profiles[0]) || 'generic-touchscreen';
    var p;
    try { p = session.requestHitTestSourceForTransientInput({ profile: profile }); }
    catch (e) { return Promise.resolve(null); }
    return Promise.resolve(p).then(function (s) { return s; }, function () { return null; });
  }

  function transientHit(frame, transientSource, refSpace) {
    if (!frame || !transientSource || typeof frame.getHitTestResultsForTransientInput !== 'function') return null;
    var results;
    try { results = frame.getHitTestResultsForTransientInput(transientSource); }
    catch (e) { return null; }
    if (!results || !results.length || !results[0].results || !results[0].results.length) return null;
    var pose = null;
    try { pose = results[0].results[0].getPose(refSpace); } catch (e) { pose = null; }
    return pose ? poseToData(pose) : null;
  }

  /* ---- Transform handles (data-level; the room's UI calls these) ---- */

  function rotateY(target, radians) {
    if (!target) return false;
    if (target.rotation && typeof target.rotation.y === 'number') {
      target.rotation.y += radians;
      return true;
    }
    if (typeof target.rotateY === 'function') { target.rotateY(radians); return true; }
    return false;
  }

  function getScale(target) {
    if (target && target.scale && typeof target.scale.x === 'number') return target.scale.x;
    return 1;
  }

  function setScale(target, s, min, max) {
    min = (min === undefined) ? 0.35 : min;
    max = (max === undefined) ? 2.5 : max;
    var clamped = Math.max(min, Math.min(max, s));
    if (target && target.scale && target.scale.set) {
      target.scale.set(clamped, clamped, clamped);
      return clamped;
    }
    return null;
  }

  function nudgeScale(target, factor, min, max) {
    return setScale(target, getScale(target) * factor, min, max);
  }

  XR.placement = {
    RETICLE: RETICLE,
    createPlacer: createPlacer,
    makeReticle: makeReticle,
    driveReticle: driveReticle,
    poseToData: poseToData,
    applyPoseToObject: applyPoseToObject,
    requestTransientSource: requestTransientSource,
    transientHit: transientHit,
    rotateY: rotateY,
    getScale: getScale,
    setScale: setScale,
    nudgeScale: nudgeScale
  };
})(typeof window !== 'undefined' ? window : globalThis);
