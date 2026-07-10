/* ═══════════════════════════════════════════════════════════════════════════
   XTO · DAY/NIGHT — the sky that lives while you play.
   Owner: "the sun rises and sets."

   Contract (see xto.html): window.XTO_DayNight = { build(ctx) → {update(dt,t), ...} }
   Build order: FIRST. We WRITE ctx.time.dayFrac (0..1) + ctx.time.night every
   frame — every other module READS these (night = stronger monsters later).

   0.00 = midnight · 0.25 = dawn · 0.50 = noon · 0.75 = dusk
   Perf: zero per-frame allocation — every vector/color below is reused.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.XTO_DayNight = {
    build(ctx) {
      const THREE = ctx.THREE;
      const scene = ctx.scene;
      const camera = ctx.camera;
      const sun = ctx.lights && ctx.lights.sun;
      const hemi = ctx.lights && ctx.lights.hemi;

      // ── tuning ────────────────────────────────────────────────────────────
      let DAY_SECONDS = 240;            // one full cycle ≈ 4 real minutes
      let speed = 1;                    // setSpeed() multiplier
      const SKY_R = 480;                // sky dome radius (< camera far 900)
      const SUN_R = 380;                // orbit radius for sun/moon lights

      // ── palette keyframes (reused Colors, never re-allocated per frame) ─────
      // Each phase: sky (bg+fog), hemi sky, hemi ground, sun color, sun intensity, hemi intensity.
      const C = (h) => new THREE.Color(h);
      const KEY = {
        //            sky bg/fog   hemiSky      hemiGround   sunColor     sunI   hemiI
        midnight: { sky: C(0x05070f), hs: C(0x1a2547), hg: C(0x05060d), sc: C(0x6f86c4), si: 0.00, hi: 0.22 },
        dawn:     { sky: C(0xf7b98a), hs: C(0xffd7b0), hg: C(0x40304a), sc: C(0xffb06a), si: 0.75, hi: 0.55 },
        noon:     { sky: C(0x2f8fd8), hs: C(0xbfe0ff), hg: C(0x274058), sc: C(0xfff4e0), si: 1.35, hi: 0.85 },
        dusk:     { sky: C(0x7a4bb0), hs: C(0xd79ad0), hg: C(0x3a2340), sc: C(0xff7e5a), si: 0.65, hi: 0.50 },
        night:    { sky: C(0x0a0f24), hs: C(0x23345f), hg: C(0x070a16), sc: C(0x8aa0d8), si: 0.00, hi: 0.28 },
      };

      // scratch objects (reused every frame — no GC churn)
      const _skyCol = new THREE.Color();
      const _hsCol = new THREE.Color();
      const _hgCol = new THREE.Color();
      const _sunCol = new THREE.Color();
      const _moonCol = new THREE.Color(0x9db4ff);
      const _sunPos = new THREE.Vector3();
      const _moonPos = new THREE.Vector3();

      // linear interpolate a keyframe field between two phases into `out`
      function lerpKey(a, b, k, u) {
        _skyCol.copy(a.sky).lerp(b.sky, u);
        _hsCol.copy(a.hs).lerp(b.hs, u);
        _hgCol.copy(a.hg).lerp(b.hg, u);
        _sunCol.copy(a.sc).lerp(b.sc, u);
        k.si = a.si + (b.si - a.si) * u;
        k.hi = a.hi + (b.hi - a.hi) * u;
      }
      const _mix = { si: 0, hi: 0 };

      // ── sky dome (camera-following) + optional HF textures ──────────────────
      // Gradient sky ALWAYS built as the reliable fallback. If the HF jpgs load,
      // we add day/night textured domes that crossfade over it.
      const skyGeo = new THREE.SphereGeometry(SKY_R, 32, 16);

      const gradMat = new THREE.MeshBasicMaterial({
        color: 0x0a1226, side: THREE.BackSide, fog: false, depthWrite: false,
      });
      const skyDome = new THREE.Mesh(skyGeo, gradMat);
      skyDome.renderOrder = -10;
      scene.add(skyDome);

      // textured domes (created only if the jpgs exist)
      let dayDome = null, nightDome = null, dayMat = null, nightMat = null;
      const texLoader = new THREE.TextureLoader();

      function tryTexturedSky() {
        const load = (url) => new Promise((res) => {
          texLoader.load(
            url,
            (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.mapping = THREE.EquirectangularReflectionMapping; res(tex); },
            undefined,
            () => res(null)      // graceful: missing file → null, keep gradient
          );
        });
        return Promise.all([load('/assets/xto/sky-day.jpg'), load('/assets/xto/sky-night.jpg')])
          .then(([dTex, nTex]) => {
            if (dTex) {
              dayMat = new THREE.MeshBasicMaterial({ map: dTex, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 });
              dayDome = new THREE.Mesh(skyGeo, dayMat); dayDome.renderOrder = -9; scene.add(dayDome);
            }
            if (nTex) {
              nightMat = new THREE.MeshBasicMaterial({ map: nTex, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 });
              nightDome = new THREE.Mesh(skyGeo, nightMat); nightDome.renderOrder = -8; scene.add(nightDome);
            }
          })
          .catch(() => { /* keep gradient fallback */ });
      }

      // ── stars (fade in at night) — one buffered Points cloud, no per-frame work ─
      const STAR_N = 900;
      const starPos = new Float32Array(STAR_N * 3);
      for (let i = 0; i < STAR_N; i++) {
        // random points on upper hemisphere just inside the sky dome
        const u = Math.random(), v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(1 - v);        // bias toward horizon-up
        const r = SKY_R * 0.92;
        starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 6;   // keep above ground
        starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xdce8ff, size: 1.6, sizeAttenuation: true,
        transparent: true, opacity: 0, depthWrite: false, fog: false,
      });
      const stars = new THREE.Points(starGeo, starMat);
      stars.renderOrder = -7;
      scene.add(stars);

      // ── MOON — glowing sprite that rides opposite the sun ───────────────────
      const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe7ff, fog: false, transparent: true, opacity: 0.95 });
      const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 16), moonMat);
      moon.renderOrder = -6;
      scene.add(moon);
      // soft cool moonlight (its own directional so night reads blue, not black)
      const moonLight = new THREE.DirectionalLight(0x8fa8ff, 0.0);
      scene.add(moonLight); scene.add(moonLight.target);

      // small sun disc so you can SEE it rise/set (light is invisible on its own)
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false, transparent: true, opacity: 1 });
      const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 16), sunMat);
      sunDisc.renderOrder = -6;
      scene.add(sunDisc);

      // ── NEON HUD clock (dark-glass + neon glow + swirl accent) ──────────────
      const panel = document.createElement('div');
      panel.className = 'panel xto-daynight';
      panel.innerHTML =
        '<style>' +
        '.xto-daynight{position:absolute;top:14px;right:14px;display:flex;align-items:center;gap:10px;' +
        'padding:9px 14px;border-radius:14px;font-family:"IBM Plex Mono",ui-monospace,monospace;' +
        'background:linear-gradient(150deg,rgba(10,16,34,.82),rgba(6,9,20,.9));' +
        'border:1px solid rgba(39,224,255,.35);' +
        'box-shadow:0 0 18px rgba(39,224,255,.28),inset 0 0 22px rgba(138,108,255,.12);' +
        'backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);color:#dbe8ff;overflow:hidden}' +
        '.xto-daynight .swirl{position:absolute;inset:-40% -20% auto auto;width:120px;height:120px;opacity:.35;' +
        'background:conic-gradient(from 0deg,transparent,rgba(39,224,255,.5),rgba(138,108,255,.5),transparent);' +
        'border-radius:50%;filter:blur(6px);animation:xtoSwirl 14s linear infinite;pointer-events:none}' +
        '@keyframes xtoSwirl{to{transform:rotate(360deg)}}' +
        '.xto-daynight .icon{font-size:20px;line-height:1;filter:drop-shadow(0 0 8px currentColor);z-index:1}' +
        '.xto-daynight .cw{display:flex;flex-direction:column;line-height:1.1;z-index:1}' +
        '.xto-daynight .clk{font-size:16px;font-weight:700;letter-spacing:.06em;' +
        'text-shadow:0 0 10px rgba(39,224,255,.7)}' +
        '.xto-daynight .tod{font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:#7f93b8}' +
        '</style>' +
        '<div class="swirl"></div>' +
        '<div class="icon" id="xtoDNicon">☀️</div>' +
        '<div class="cw"><div class="clk" id="xtoDNclock">06:00</div>' +
        '<div class="tod" id="xtoDNtod">DAWN</div></div>';
      ctx.hud.appendChild(panel);
      const elIcon = panel.querySelector('#xtoDNicon');
      const elClock = panel.querySelector('#xtoDNclock');
      const elTod = panel.querySelector('#xtoDNtod');
      let lastMin = -1, lastTod = '';

      function phaseName(f) {
        if (f < 0.22) return 'NIGHT';
        if (f < 0.30) return 'DAWN';
        if (f < 0.47) return 'MORNING';
        if (f < 0.53) return 'NOON';
        if (f < 0.72) return 'AFTERNOON';
        if (f < 0.80) return 'DUSK';
        return 'NIGHT';
      }

      // ── the frame update ────────────────────────────────────────────────────
      function update(dt, t) {
        // advance the day clock
        let f = ctx.time.dayFrac + (dt * speed) / DAY_SECONDS;
        f -= Math.floor(f);                 // wrap 0..1
        ctx.time.dayFrac = f;
        // night ≈ dusk(0.78) → dawn(0.24)
        const night = (f >= 0.78 || f < 0.24);
        ctx.time.night = night;

        // pick the two palette phases we're between + blend factor u
        let a, b, u;
        if (f < 0.25) { a = KEY.midnight; b = KEY.dawn; u = f / 0.25; }
        else if (f < 0.50) { a = KEY.dawn; b = KEY.noon; u = (f - 0.25) / 0.25; }
        else if (f < 0.75) { a = KEY.noon; b = KEY.dusk; u = (f - 0.50) / 0.25; }
        else { a = KEY.dusk; b = KEY.night; u = (f - 0.75) / 0.25; }
        lerpKey(a, b, _mix, u);

        // sky background + fog color (reuse _skyCol)
        _skyCol.copy(a.sky).lerp(b.sky, u);
        if (scene.background && scene.background.isColor) scene.background.copy(_skyCol);
        else scene.background = _skyCol.clone();
        if (scene.fog) scene.fog.color.copy(_skyCol);

        // gradient sky dome tint (a touch brighter than fog so horizon reads)
        gradMat.color.copy(_skyCol).multiplyScalar(1.15);

        // hemisphere light — colors + intensity ride the cycle
        if (hemi) {
          hemi.color.copy(_hsCol);
          hemi.groundColor.copy(_hgCol);
          hemi.intensity = _mix.hi;
        }

        // ── sun arc, parameterised straight off dayFrac ──
        // f=0 (midnight) → below horizon, f=0.5 (noon) → overhead, sweeping E→W.
        const ang = f * Math.PI * 2;
        _sunPos.y = Math.sin(ang - Math.PI / 2) * SUN_R;   // f=.5 → +1 (high), f=0 → -1 (low)
        _sunPos.x = Math.cos(ang - Math.PI / 2) * SUN_R;   // horizontal sweep across the sky
        _sunPos.z = Math.sin(ang) * SUN_R * 0.25;          // slight N/S tilt so it isn't dead-flat

        if (sun) {
          sun.position.copy(_sunPos).add(camera.position); // follow camera so shadows stay centered-ish
          sun.target.position.copy(camera.position);
          sun.target.updateMatrixWorld();
          sun.color.copy(_sunCol);
          sun.intensity = _mix.si;
          sun.visible = _mix.si > 0.02;
        }
        // sun disc rides the same vector (a bit inside the dome), fades at night
        sunDisc.position.copy(camera.position).addScaledVector(_sunPos, SKY_R / SUN_R * 0.9);
        sunMat.color.copy(_sunCol);
        sunMat.opacity = THREE.MathUtils.clamp((_sunPos.y / SUN_R) * 2.2 + 0.15, 0, 1);
        sunDisc.visible = sunMat.opacity > 0.02;

        // ── moon: opposite the sun, glows at night ──
        _moonPos.copy(_sunPos).multiplyScalar(-1);
        moon.position.copy(camera.position).addScaledVector(_moonPos, SKY_R / SUN_R * 0.9);
        // night factor 0..1 for moon/star/moonlight fades (peaks at midnight)
        const nightF = THREE.MathUtils.clamp((-_sunPos.y / SUN_R) * 1.6 + 0.15, 0, 1);
        moonMat.opacity = 0.35 + nightF * 0.6;
        moon.visible = _moonPos.y > -SUN_R * 0.2;

        if (moonLight) {
          moonLight.position.copy(_moonPos).add(camera.position);
          moonLight.target.position.copy(camera.position);
          moonLight.target.updateMatrixWorld();
          moonLight.color.copy(_moonCol);
          moonLight.intensity = nightF * 0.35;   // gentle cool fill so night isn't pitch black
        }

        // stars fade in with night
        starMat.opacity = nightF * 0.9;
        stars.position.copy(camera.position);   // follow camera
        stars.rotation.y = t * 0.005;           // slow drift

        // textured HF domes crossfade (only if loaded) — day vs night mix
        skyDome.position.copy(camera.position);
        if (dayMat) { dayMat.opacity = 1 - nightF; dayDome.position.copy(camera.position); dayDome.visible = dayMat.opacity > 0.02; }
        if (nightMat) { nightMat.opacity = nightF; nightDome.position.copy(camera.position); nightDome.visible = nightMat.opacity > 0.02; }
        // if we have full textured coverage, hide gradient behind them to avoid double-tint
        if (dayMat && nightMat) gradMat.opacity = 1; // gradient still shows through transparent domes at partial opacity

        // ── HUD clock (update only when the displayed minute/phase changes) ──
        const totalMin = Math.floor(f * 24 * 60);
        if (totalMin !== lastMin) {
          lastMin = totalMin;
          const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
          const mm = String(totalMin % 60).padStart(2, '0');
          elClock.textContent = hh + ':' + mm;
        }
        const tod = phaseName(f);
        if (tod !== lastTod) {
          lastTod = tod;
          elTod.textContent = tod;
          elIcon.textContent = night ? '🌙' : '☀️';
          elIcon.style.color = night ? '#8fa8ff' : '#ffd27a';
        }
      }

      // kick off (non-blocking) HF sky texture probe
      tryTexturedSky();

      return {
        update,
        isNight: () => ctx.time.night,
        dayFrac: () => ctx.time.dayFrac,
        setSpeed: (x) => { speed = Math.max(0, Number(x) || 0); },
      };
    },
  };
})();
