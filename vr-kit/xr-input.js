/*
 * xr-input.js — Shaddai Arcade VR Kit: controller + hand input.
 *
 * Original code written for the Shaddai Arcade project (2026-11-21).
 * Gamepad index mapping follows the WebXR "standard" XR gamepad
 * layout as documented on MDN and used by the Immersive Web samples
 * (immersive-web/webxr-samples, MIT — notice in comments only);
 * hand-joint pinch detection follows the WebXR Hand Input Module:
 * pinch = thumb-tip close to index-finger-tip. Details checked
 * against MDN on 2026-11-21.
 *
 * Everything here returns PLAIN DATA (poses as {position, quaternion,
 * matrix}) so game logic and tests never need a live session.
 */
(function (root) {
  'use strict';

  var XR = root.ShaddaiXR || (root.ShaddaiXR = {});

  /* Standard XR gamepad button indices (Quest Touch / similar). */
  var BUTTONS = {
    TRIGGER: 0,
    SQUEEZE: 1,
    TOUCHPAD: 2,
    THUMBSTICK: 3,
    PRIMARY: 4,   // X on left controller, A on right
    SECONDARY: 5  // Y on left controller, B on right
  };

  function poseData(pose) {
    if (!pose) return null;
    var t = pose.transform;
    return {
      position: { x: t.position.x, y: t.position.y, z: t.position.z },
      quaternion: { x: t.orientation.x, y: t.orientation.y, z: t.orientation.z, w: t.orientation.w },
      matrix: Array.prototype.slice.call(t.matrix),
      emulatedPosition: !!pose.emulatedPosition
    };
  }

  /*
   * rayFromPose(pose) -> { origin, direction } — the laser pointer
   * ray: position + forward (-Z) extracted from the pose matrix.
   */
  function rayFromPose(pose) {
    if (!pose || !pose.matrix) return null;
    var m = pose.matrix;
    var dx = -m[8], dy = -m[9], dz = -m[10];
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return {
      origin: { x: m[12], y: m[13], z: m[14] },
      direction: { x: dx / len, y: dy / len, z: dz / len }
    };
  }

  function readGamepad(gp) {
    if (!gp) return null;
    var buttons = [];
    for (var i = 0; i < gp.buttons.length; i++) {
      var b = gp.buttons[i];
      buttons.push({ pressed: !!b.pressed, touched: !!b.touched, value: b.value });
    }
    function btn(i) { return buttons[i] || { pressed: false, touched: false, value: 0 }; }
    // Standard mapping: axes [0,1] touchpad (older), [2,3] thumbstick.
    var axes = gp.axes || [];
    return {
      buttons: buttons,
      trigger: btn(BUTTONS.TRIGGER),
      squeeze: btn(BUTTONS.SQUEEZE),
      thumbstickButton: btn(BUTTONS.THUMBSTICK),
      primary: btn(BUTTONS.PRIMARY),
      secondary: btn(BUTTONS.SECONDARY),
      thumbstick: {
        x: (axes.length > 2 ? axes[2] : (axes[0] || 0)),
        y: (axes.length > 3 ? axes[3] : (axes[1] || 0))
      },
      touchpad: { x: axes[0] || 0, y: axes[1] || 0 }
    };
  }

  /*
   * pollControllers(session, frame, refSpace) -> array of states,
   * one per connected input source:
   * { handedness, targetMode, ray, gripPose, targetPose, gamepad, hand }
   * `hand` is the hand-tracking summary from handState() or null.
   * Never throws; a source with no pose yet reports null poses.
   */
  function pollControllers(session, frame, refSpace) {
    var out = [];
    if (!session || !session.inputSources) return out;
    for (var i = 0; i < session.inputSources.length; i++) {
      var src = session.inputSources[i];
      var targetPose = null, gripPose = null;
      if (frame && refSpace && typeof frame.getPose === 'function') {
        try { targetPose = poseData(frame.getPose(src.targetRaySpace, refSpace)); } catch (e) {}
        if (src.gripSpace) {
          try { gripPose = poseData(frame.getPose(src.gripSpace, refSpace)); } catch (e) {}
        }
      }
      out.push({
        handedness: src.handedness || 'none',
        targetMode: src.targetRayMode || 'gaze',
        targetPose: targetPose,
        gripPose: gripPose,
        ray: rayFromPose(targetPose),
        gamepad: readGamepad(src.gamepad),
        hand: handState(frame, src, refSpace),
        source: src
      });
    }
    return out;
  }

  /* ---- Session input events, normalised ---- */

  /*
   * onSessionInput(session, handlers) — handlers may define any of:
   * onSelectStart/onSelect/onSelectEnd, onSqueezeStart/onSqueeze/
   * onSqueezeEnd, onInputSourcesChange. Each handler receives
   * { type, inputSource, frame, handedness }.
   * Returns an unsubscribe function.
   */
  function onSessionInput(session, handlers) {
    handlers = handlers || {};
    var map = [
      ['selectstart', 'onSelectStart'], ['select', 'onSelect'], ['selectend', 'onSelectEnd'],
      ['squeezestart', 'onSqueezeStart'], ['squeeze', 'onSqueeze'], ['squeezeend', 'onSqueezeEnd'],
      ['inputsourceschange', 'onInputSourcesChange']
    ];
    var bound = [];
    map.forEach(function (pair) {
      var fn = handlers[pair[1]];
      if (typeof fn !== 'function') return;
      var listener = function (event) {
        fn({
          type: pair[0],
          inputSource: event.inputSource || null,
          frame: event.frame || null,
          handedness: event.inputSource ? event.inputSource.handedness : 'none'
        }, event);
      };
      session.addEventListener(pair[0], listener);
      bound.push([pair[0], listener]);
    });
    return function unsubscribe() {
      bound.forEach(function (b) {
        if (typeof session.removeEventListener === 'function') session.removeEventListener(b[0], b[1]);
      });
      bound = [];
    };
  }

  /* ---- Hand tracking: joints + pinch (with controller fallback) ---- */

  var PINCH_ON = 0.020;   // metres, thumb-tip to index-tip
  var PINCH_OFF = 0.030;  // hysteresis so pinch doesn't flicker

  function jointPose(frame, inputSource, jointName, refSpace) {
    if (!frame || !inputSource || !inputSource.hand || typeof inputSource.hand.get !== 'function') return null;
    if (typeof frame.getJointPose !== 'function') return null;
    var space = inputSource.hand.get(jointName);
    if (!space) return null;
    try { return poseData(frame.getJointPose(space, refSpace)); } catch (e) { return null; }
  }

  /*
   * handState(frame, inputSource, refSpace, prev) ->
   *   { joints: {wrist, thumbTip, indexTip}, pinch: bool, pinchPoint } | null
   * Null when the source is not a tracked hand — callers then fall
   * back to the controller path (trigger = select). Requires the
   * 'hand-tracking' session feature; without it inputSource.hand is
   * simply absent and this returns null. Pass the previous state as
   * `prev` for pinch hysteresis.
   */
  function handState(frame, inputSource, refSpace, prev) {
    if (!inputSource || !inputSource.hand) return null;
    var thumb = jointPose(frame, inputSource, 'thumb-tip', refSpace);
    var index = jointPose(frame, inputSource, 'index-finger-tip', refSpace);
    var wrist = jointPose(frame, inputSource, 'wrist', refSpace);
    if (!thumb || !index) return null;
    var dx = thumb.position.x - index.position.x;
    var dy = thumb.position.y - index.position.y;
    var dz = thumb.position.z - index.position.z;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var wasPinching = !!(prev && prev.pinch);
    var pinch = wasPinching ? dist < PINCH_OFF : dist < PINCH_ON;
    return {
      joints: { wrist: wrist, thumbTip: thumb, indexTip: index },
      pinchDistance: dist,
      pinch: pinch,
      pinchPoint: {
        x: (thumb.position.x + index.position.x) / 2,
        y: (thumb.position.y + index.position.y) / 2,
        z: (thumb.position.z + index.position.z) / 2
      }
    };
  }

  /* ---- Button edge detection (pressed-this-frame) ---- */

  function ButtonEdges() { this.prev = {}; }
  ButtonEdges.prototype.feed = function (name, pressed) {
    var was = !!this.prev[name];
    this.prev[name] = !!pressed;
    return { pressed: !!pressed, justPressed: !!pressed && !was, justReleased: !pressed && was };
  };
  ButtonEdges.prototype.reset = function () { this.prev = {}; };

  XR.input = {
    BUTTONS: BUTTONS,
    PINCH_ON: PINCH_ON,
    PINCH_OFF: PINCH_OFF,
    pollControllers: pollControllers,
    onSessionInput: onSessionInput,
    readGamepad: readGamepad,
    rayFromPose: rayFromPose,
    poseData: poseData,
    jointPose: jointPose,
    handState: handState,
    ButtonEdges: ButtonEdges
  };
})(typeof window !== 'undefined' ? window : globalThis);
