/* ═══════════════════════════════════════════════════════════════════════════
   XTO_City — a SMALL AGENTIC FUTURISTIC TOWN (module 3 of 5)   [TURTLE build]
   Owner: TURTLE.  Contract:
     window.XTO_City = { build(ctx) → { update(dt,t) } }   (build may be async)

   ctx = { THREE, scene, camera, renderer, loader, canvas, hud, keys, input,
           player, time:{dayFrac,night}, state, helpers, flags, lights,
           chosen, terrain:{ heightAt(x,z), group, size } }

   Build order: AFTER Terrain — every building/prop is seated on the ground via
   ctx.terrain.heightAt(x,z).  If terrain is absent we guard → y = 0 (flat).

   ── The town (NOT a big NYC city) ──────────────────────────────────────────
   Cozy, clean, futuristic-agentic.  Rounded / DOMED forms, glass-and-neon
   shopfronts, holographic signage.  Human scale:
     hero ≈ 1.9u tall · DOORS ≈ 2.4u tall · buildings mostly 1–2 storeys
     (~4–9u, a few landmark domes taller) · streets ≈ 10u wide.
     Compact core, radius ≈ 130u.

   ── SACRED GEOMETRY LAYOUT ─────────────────────────────────────────────────
   Central plaza (r ≈ 28) with a civic dome + fountain.  Six primary buildings
   on a HEXAGON / Seed-of-Life inner ring (R ≈ 72) — the 3 hero HQs + 3 civic
   shops.  Twelve secondary shops on a concentric outer ring (R ≈ 108).
   Six radial avenues + two ring roads connect everything.  Symmetric and
   intentional.  Street signs / holo-signposts at each intersection.

   Exposes on ctx.city:
     { radius, isSolid(x,z)->bool,
       starts:{ TURTLE:{x,z}, ORACLE:{x,z}, XEROX:{x,z} },
       shaddai:{x,z}, spawn:{x,z}, group }
   spawn sits just OUTSIDE the chosen hero's door, on the ground.

   Perf: InstancedMesh for windows / lamps / bollards / trees.  Geometry made
   once, matrices baked at build.  update() only pulses a few signs + spins
   holo-rings — no per-frame allocation.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.XTO_City = {
    build: async function (ctx) {
      const THREE = ctx.THREE;
      const scene = ctx.scene;

      // ── ground sampler (seat everything on terrain; guard if absent) ────────
      const terrain = ctx.terrain || null;
      function groundY(x, z) {
        if (terrain && typeof terrain.heightAt === 'function') {
          const y = terrain.heightAt(x, z);
          return (typeof y === 'number' && isFinite(y)) ? y : 0;
        }
        return 0;
      }

      // ── asset roots (graceful: missing files fall back to procedural) ───────
      const TEX = '/assets/xto/';
      const texLoader = new THREE.TextureLoader();
      function loadTex(file, repX, repY) {
        try {
          const t = texLoader.load(TEX + file, undefined, undefined, () => {});
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          if (repX || repY) t.repeat.set(repX || 1, repY || 1);
          t.anisotropy = 4;
          return t;
        } catch (_) { return null; }
      }

      // ── deterministic rng + palette ─────────────────────────────────────────
      const rng = (function () { let s = 0x51ed270b; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
      const pick = (arr) => arr[(rng() * arr.length) | 0];
      const NEON = [0x27e0ff, 0x8a6cff, 0x1fd6c4, 0xff5db1, 0xffd23f, 0x5dff8a, 0xff7a3c];

      // ── self-contained group ────────────────────────────────────────────────
      const CITY = new THREE.Group();
      CITY.name = 'XTO_City';
      scene.add(CITY);

      // ── scratch objects (no per-call alloc in loops) ────────────────────────
      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(),
            _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _col = new THREE.Color();

      // ── collision registry (rounded axis-aligned footprints) ────────────────
      const solids = [];
      const addSolid = (x, z, rx, rz) => solids.push({ x, z, rx, rz });
      function solidAt(x, z) {
        for (let i = 0; i < solids.length; i++) {
          const s = solids[i];
          if (Math.abs(x - s.x) <= s.rx && Math.abs(z - s.z) <= s.rz) return true;
        }
        return false;
      }

      // ── neon things update() pulses / spins ─────────────────────────────────
      const pulses = [];
      const holos = [];

      // ── SACRED-GEOMETRY CONSTANTS ───────────────────────────────────────────
      const TOWN_RADIUS = 132;   // compact core
      const PLAZA_R     = 28;    // central open plaza radius
      const INNER_R     = 72;    // hexagon / seed-of-life primary ring
      const OUTER_R     = 108;   // concentric secondary ring
      const STREET_W    = 10;    // avenue width
      const HEX_START   = -Math.PI / 2; // first hex vertex points NORTH

      // ════════════════════════════════════════════════════════════════════════
      // 1. GROUND + ROADS  (soft ground disc, tiled paved radial + ring roads)
      // ════════════════════════════════════════════════════════════════════════
      {
        // soft ground disc (grass/plaza tone) — sits just below road level
        const gMat = new THREE.MeshStandardMaterial({ color: 0x121a2e, roughness: 0.95, metalness: 0.0 });
        const ground = new THREE.Mesh(new THREE.CircleGeometry(TOWN_RADIUS + 8, 64), gMat);
        ground.rotation.x = -Math.PI / 2; ground.position.y = groundY(0, 0) - 0.03;
        ground.receiveShadow = true; CITY.add(ground);
      }

      const roadTex = loadTex('road.jpg', 1, 8);
      const roadMat = new THREE.MeshStandardMaterial({
        color: roadTex ? 0x9aa4b8 : 0x1b2236, map: roadTex || null,
        roughness: 0.9, metalness: 0.1
      });
      const curbMat = new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.7, metalness: 0.3, emissive: 0x0b2740, emissiveIntensity: 0.5 });
      const laneMat = new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.45, toneMapped: false });
      const roadY = groundY(0, 0) + 0.02;

      // -- one straight paved segment (with curbs + centre neon lane) ----------
      function roadSegment(x0, z0, x1, z1, width) {
        const dx = x1 - x0, dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        const ang = Math.atan2(dz, dx);          // rotate about Y so +X aligns to dir
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const rt = (roadTex && roadTex.clone) ? roadTex.clone() : null;
        if (rt) { rt.needsUpdate = true; rt.repeat.set(1, Math.max(1, len / 6)); }
        const mat = rt ? new THREE.MeshStandardMaterial({ color: 0x9aa4b8, map: rt, roughness: 0.9, metalness: 0.1 }) : roadMat;
        const road = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat);
        road.rotation.x = -Math.PI / 2; road.rotation.z = -ang + Math.PI / 2;
        road.position.set(cx, roadY, cz); road.receiveShadow = true; CITY.add(road);
        // centre neon lane line
        const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.35, len - 2), laneMat);
        lane.rotation.x = -Math.PI / 2; lane.rotation.z = -ang + Math.PI / 2;
        lane.position.set(cx, roadY + 0.02, cz); CITY.add(lane);
        // curbs (two thin emissive rails along the sides)
        for (const sgn of [-1, 1]) {
          const ox = Math.cos(ang + Math.PI / 2) * (width / 2) * sgn;
          const oz = Math.sin(ang + Math.PI / 2) * (width / 2) * sgn;
          const curb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, len), curbMat);
          curb.rotation.y = -ang + Math.PI / 2;
          curb.position.set(cx + ox, roadY + 0.15, cz + oz); CITY.add(curb);
        }
      }

      // -- crosswalk stripes at an intersection --------------------------------
      const crossMat = new THREE.MeshBasicMaterial({ color: 0xdfefff, transparent: true, opacity: 0.7, toneMapped: false });
      function crosswalk(x, z, ang) {
        for (let i = -2; i <= 2; i++) {
          const st = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4.4), crossMat);
          st.rotation.x = -Math.PI / 2; st.rotation.z = -ang;
          st.position.set(x + Math.cos(ang) * i * 1.1, roadY + 0.015, z + Math.sin(ang) * i * 1.1);
          CITY.add(st);
        }
      }

      // 6 RADIAL avenues (plaza edge → town edge) on the hex axes
      const AXES = 6;
      for (let i = 0; i < AXES; i++) {
        const a = HEX_START + (i / AXES) * Math.PI * 2;
        const ix = Math.cos(a), iz = Math.sin(a);
        roadSegment(ix * (PLAZA_R - 2), iz * (PLAZA_R - 2), ix * (TOWN_RADIUS - 4), iz * (TOWN_RADIUS - 4), STREET_W);
      }
      // 2 RING roads at the inner + outer rings (segmented polygons, 48 sides)
      function ringRoad(R, width) {
        const N = 48;
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
          roadSegment(Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R, width);
        }
      }
      ringRoad(INNER_R, STREET_W);
      ringRoad(OUTER_R, STREET_W - 1);
      // crosswalks where radials meet the inner ring
      for (let i = 0; i < AXES; i++) {
        const a = HEX_START + (i / AXES) * Math.PI * 2;
        crosswalk(Math.cos(a) * INNER_R, Math.sin(a) * INNER_R, a + Math.PI / 2);
      }

      // ════════════════════════════════════════════════════════════════════════
      // 2. CENTRAL PLAZA — inlaid Seed-of-Life pattern + glowing ring
      // ════════════════════════════════════════════════════════════════════════
      {
        const plazaMat = new THREE.MeshStandardMaterial({ color: 0x0e1734, roughness: 0.45, metalness: 0.3, emissive: 0x0a1f3a, emissiveIntensity: 0.4 });
        const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 64), plazaMat);
        plaza.rotation.x = -Math.PI / 2; plaza.position.y = roadY + 0.005; plaza.receiveShadow = true; CITY.add(plaza);

        // glowing rim ring
        const rim = new THREE.Mesh(new THREE.RingGeometry(PLAZA_R - 1.4, PLAZA_R, 64),
          new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false }));
        rim.rotation.x = -Math.PI / 2; rim.position.y = roadY + 0.02; CITY.add(rim);

        // Seed-of-Life: 1 centre + 6 petal circles (thin emissive rings)
        const solMat = new THREE.MeshBasicMaterial({ color: 0x8a6cff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, toneMapped: false });
        const solR = PLAZA_R * 0.42;
        function inlayRing(cx, cz) {
          const r = new THREE.Mesh(new THREE.RingGeometry(solR - 0.25, solR, 48), solMat);
          r.rotation.x = -Math.PI / 2; r.position.set(cx, roadY + 0.015, cz); CITY.add(r);
        }
        inlayRing(0, 0);
        for (let i = 0; i < 6; i++) { const a = HEX_START + (i / 6) * Math.PI * 2; inlayRing(Math.cos(a) * solR, Math.sin(a) * solR); }
      }

      // ════════════════════════════════════════════════════════════════════════
      // 3. TOWN BUILDINGS — rounded/domed shopfronts with real DOORS + windows
      // ════════════════════════════════════════════════════════════════════════
      const facadeTex = [loadTex('facade-a.jpg', 2, 2), loadTex('facade-b.jpg', 2, 2), loadTex('facade-c.jpg', 2, 2)];

      // shared geometry (made once)
      const unitBox   = new THREE.BoxGeometry(1, 1, 1);
      const cylGeo    = new THREE.CylinderGeometry(1, 1, 1, 24);      // rounded tower body
      const domeHalf  = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2); // dome cap
      const doorGeo   = new THREE.BoxGeometry(1.6, 2.4, 0.25);        // human-scale DOOR (~2.4u)
      const awnGeo    = new THREE.BoxGeometry(3.2, 0.25, 1.4);        // awning
      const signBarGeo= new THREE.PlaneGeometry(1, 1);

      // instanced lit WINDOWS (shopfront glow) across all buildings
      const MAX_WIN = 2600;
      const winGeo = new THREE.PlaneGeometry(0.9, 1.0);
      const winMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.92 });
      const windows = new THREE.InstancedMesh(winGeo, winMat, MAX_WIN);
      windows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_WIN * 3), 3);
      let winCount = 0;
      function addWindow(x, y, z, ry, lit) {
        if (winCount >= MAX_WIN) return;
        _e.set(0, ry, 0); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(1, 1, 1);
        _m.compose(_p, _q, _s); windows.setMatrixAt(winCount, _m);
        if (lit) _col.setHex(pick(NEON)).multiplyScalar(0.85); else _col.setRGB(0.05, 0.08, 0.13);
        windows.setColorAt(winCount, _col); winCount++;
      }
      CITY.add(windows);

      // Canvas street/shop SIGN (readable holo text on a plane)
      const _signCache = {};
      function signTexture(text, colHex) {
        const key = text + '|' + colHex;
        if (_signCache[key]) return _signCache[key];
        const c = document.createElement('canvas'); c.width = 256; c.height = 64;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(4,8,18,0.85)'; g.fillRect(0, 0, 256, 64);
        const col = '#' + colHex.toString(16).padStart(6, '0');
        g.strokeStyle = col; g.lineWidth = 4; g.strokeRect(4, 4, 248, 56);
        g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = col; g.shadowBlur = 12; g.fillStyle = '#eaf6ff';
        g.fillText(text, 128, 34);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        _signCache[key] = t; return t;
      }
      function makeSign(text, col, w) {
        const t = signTexture(text, col);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.25),
          new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
        m.userData.glow = true; pulses.push(m);
        return m;
      }

      /* Build ONE rounded/glassy shop with a DOME roof, real recessed DOOR,
         lit shopfront windows, awning, and a readable holo sign.
         form: 'dome' (geodesic dome hall) | 'round' (cylinder + dome cap) | 'box' (soft box + dome).
         Returns the group.  Door faces +Z (local); caller rotates to face street. */
      function makeShop(x, z, opts) {
        opts = opts || {};
        const w = opts.w || 9, d = opts.d || 9;
        const storeys = opts.storeys || 1;
        const h = opts.h || (3.2 + storeys * 3.0);   // ground floor + storeys, human scale
        const col = opts.col || pick([0x16233f, 0x1c1740, 0x123028, 0x2a1830, 0x102a3a]);
        const form = opts.form || 'round';
        const label = opts.label || null;
        const gy = groundY(x, z);

        const g = new THREE.Group();
        g.position.set(x, gy, z);

        const fTex = pick(facadeTex);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: fTex ? 0xcfd8e6 : col, map: fTex || null,
          roughness: 0.55, metalness: 0.3, emissive: col, emissiveIntensity: 0.12
        });
        const glassMat = new THREE.MeshStandardMaterial({
          color: 0x0b1a2e, roughness: 0.15, metalness: 0.6,
          emissive: col, emissiveIntensity: 0.25, transparent: true, opacity: 0.9
        });

        let bodyR = Math.max(w, d) / 2;
        let bodyTop = h;

        if (form === 'box') {
          const body = new THREE.Mesh(unitBox, bodyMat);
          body.scale.set(w, h, d); body.position.y = h / 2;
          body.castShadow = true; body.receiveShadow = true; g.add(body);
          // dome cap on top (rounded, not boxy)
          const cap = new THREE.Mesh(domeHalf, new THREE.MeshStandardMaterial({ color: col, metalness: 0.6, roughness: 0.3, emissive: col, emissiveIntensity: 0.2 }));
          cap.scale.set(w * 0.55, Math.max(w, d) * 0.32, d * 0.55); cap.position.y = h; g.add(cap);
          bodyR = Math.max(w, d) * 0.55;
        } else if (form === 'dome') {
          // big glass geodesic DOME hall (landmark)
          const R = Math.max(w, d) / 2;
          const base = new THREE.Mesh(cylGeo, bodyMat);
          base.scale.set(R, 2.6, R); base.position.y = 1.3; base.castShadow = true; base.receiveShadow = true; g.add(base);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0x0e2440, roughness: 0.1, metalness: 0.7, emissive: col, emissiveIntensity: 0.28, transparent: true, opacity: 0.88 }));
          dome.scale.set(R, R * 0.9, R); dome.position.y = 2.6; g.add(dome);
          // meridian ribs (rounded organic detail)
          const ribMat = new THREE.MeshStandardMaterial({ color: 0x2b3b5c, metalness: 0.85, roughness: 0.3, emissive: col, emissiveIntensity: 0.3 });
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const rib = new THREE.Mesh(new THREE.TorusGeometry(R * 0.99, 0.1, 6, 24, Math.PI),
              ribMat);
            rib.position.y = 2.6; rib.rotation.y = ang; rib.rotation.x = 0; g.add(rib);
          }
          bodyR = R; bodyTop = 2.6 + R * 0.9;
        } else { // 'round'
          const R = Math.max(w, d) / 2;
          const body = new THREE.Mesh(cylGeo, bodyMat);
          body.scale.set(R, h, R); body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
          // glass band (mid ring)
          const band = new THREE.Mesh(cylGeo, glassMat);
          band.scale.set(R * 1.01, h * 0.34, R * 1.01); band.position.y = h * 0.55; g.add(band);
          // dome cap
          const cap = new THREE.Mesh(domeHalf, new THREE.MeshStandardMaterial({ color: col, metalness: 0.65, roughness: 0.28, emissive: col, emissiveIntensity: 0.22 }));
          cap.scale.set(R, R * 0.7, R); cap.position.y = h; g.add(cap);
          bodyR = R; bodyTop = h + R * 0.7;
        }

        // ── lit shopfront: recessed frame + DOOR (owner: "bottom needs doors") ──
        const frontZ = bodyR;
        // shopfront glass panel (lit interior)
        const shop = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, bodyR * 1.6), 2.6),
          new THREE.MeshBasicMaterial({ color: pick(NEON), transparent: true, opacity: 0.28, toneMapped: false }));
        shop.position.set(0, 1.5, frontZ + 0.04); g.add(shop);
        // recessed DOOR (dark, glowing threshold) ~2.4u tall
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.35, metalness: 0.4, emissive: col, emissiveIntensity: 0.5 });
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 1.2, frontZ + 0.02); g.add(door);
        // lit threshold strip under the door
        const thr = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.18),
          new THREE.MeshBasicMaterial({ color: 0x27e0ff, toneMapped: false }));
        thr.rotation.x = -Math.PI / 2; thr.position.set(0, 0.05, frontZ + 0.5); g.add(thr);
        // awning over the door
        const awn = new THREE.Mesh(awnGeo, new THREE.MeshStandardMaterial({ color: pick(NEON), emissive: 0x111111, roughness: 0.5, metalness: 0.2 }));
        awn.position.set(0, 2.9, frontZ + 0.55); awn.castShadow = true; g.add(awn);
        // door point-light (warm invite)
        const dl = new THREE.PointLight(0xbfe6ff, 0.9, 12, 2); dl.position.set(0, 2.4, frontZ + 1.2); g.add(dl);

        // ── shop sign above the door ──
        if (label) {
          const sgn = makeSign(label, pick(NEON), Math.min(w, 6));
          sgn.position.set(0, 3.7, frontZ + 0.1); g.add(sgn);
        }

        // ── lit windows wrapping the body (front + sides), instanced ──
        const ringN = form === 'dome' ? 0 : 10;
        for (let s = 0; s < storeys; s++) {
          const wy = 4.2 + s * 3.0;
          for (let k = 0; k < ringN; k++) {
            const wa = (k / ringN) * Math.PI * 2;
            const wx = x + Math.cos(wa) * (bodyR + 0.05);
            const wz = z + Math.sin(wa) * (bodyR + 0.05);
            addWindow(wx, gy + wy, wz, wa + Math.PI / 2, rng() > 0.3);
          }
        }

        CITY.add(g);
        addSolid(x, z, bodyR * 0.95, bodyR * 0.95);
        return { g, bodyR, bodyTop, gy };
      }

      // ════════════════════════════════════════════════════════════════════════
      // 4. HERO HQs + SHADDAI CIVIC DOME  (sacred-geometry hexagon ring)
      // ════════════════════════════════════════════════════════════════════════
      const starts = {};
      // hex vertices: index 0 = NORTH.  Heroes on 3 alternating vertices, civic
      // shops on the other 3 → perfectly symmetric triangle-in-hexagon.
      function hexPoint(i, R) { const a = HEX_START + (i / 6) * Math.PI * 2; return { x: Math.cos(a) * R, z: Math.sin(a) * R, a }; }

      function makeHeroHQ(name, hexIdx, col, label) {
        const p = hexPoint(hexIdx, INNER_R);
        const built = makeShop(p.x, p.z, {
          w: 18, d: 18, storeys: 2, h: 9, form: 'dome',
          col: col, label: label
        });
        const g = built.g;
        // face door toward plaza centre
        g.rotation.y = Math.atan2(-p.x, -p.z);

        // hero banner + halo ring above the dome
        const halo = new THREE.Mesh(new THREE.TorusGeometry(built.bodyR * 0.5, 0.28, 8, 28),
          new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
        halo.position.set(0, built.bodyTop + 3.0, 0); halo.rotation.x = Math.PI / 2; g.add(halo);
        halo.userData.spin = true; holos.push(halo);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12),
          new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
        beacon.position.set(0, built.bodyTop + 5.5, 0); g.add(beacon);
        beacon.userData.glow = true; pulses.push(beacon);
        const bl = new THREE.PointLight(col, 2.0, 46, 2); bl.position.set(0, built.bodyTop + 4, 0); g.add(bl);

        // start = just OUTSIDE the door, on the ground (toward plaza)
        const dir = new THREE.Vector2(-p.x, -p.z).normalize();
        const sx = p.x + dir.x * (built.bodyR + 4);
        const sz = p.z + dir.y * (built.bodyR + 4);
        starts[name] = { x: sx, z: sz };
        return built;
      }

      // 3 hero domes on alternating hex vertices (0=N, 2=SE, 4=SW)
      makeHeroHQ('TURTLE', 0, 0x1fd6c4, 'TURTLE HQ');   // north  — emerald/teal
      makeHeroHQ('XEROX',  2, 0x27e0ff, 'XEROX HQ');    // se     — cyan (blue katana)
      makeHeroHQ('ORACLE', 4, 0x8a6cff, 'ORACLE HQ');   // sw     — violet

      // 3 civic shops on the other hex vertices (1=E-ish, 3=S, 5=W-ish)
      const CIVIC = [
        [1, 0xffd23f, 'AGORA', 'round'],
        [3, 0x5dff8a, 'ATELIER', 'round'],
        [5, 0xff5db1, 'ARCHIVE', 'box'],
      ];
      for (const [idx, col, label, form] of CIVIC) {
        const p = hexPoint(idx, INNER_R);
        const built = makeShop(p.x, p.z, { w: 12, d: 12, storeys: 1, h: 7, form, col, label });
        built.g.rotation.y = Math.atan2(-p.x, -p.z);
      }

      // ── central SHADDAI civic DOME at plaza centre-north (kept off dead-centre
      //    so the plaza + fountain stay open) ──
      let shaddaiPos;
      {
        const cx = 0, cz = -(PLAZA_R - 6);       // just inside the north plaza edge
        const built = makeShop(cx, cz, {
          w: 20, d: 20, storeys: 1, h: 6, form: 'dome', col: 0x2a2410, label: 'SHADDAI'
        });
        const g = built.g;
        g.rotation.y = Math.PI;                  // door faces plaza centre (+z→south)
        // golden crown dome + spire (landmark tallest form)
        const crown = new THREE.Mesh(domeHalf,
          new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.9, roughness: 0.22, emissive: 0x3a2c05, emissiveIntensity: 0.55 }));
        crown.scale.set(built.bodyR * 0.8, built.bodyR * 0.7, built.bodyR * 0.8);
        crown.position.y = built.bodyTop; g.add(crown);
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 6, 10),
          new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false }));
        spire.position.y = built.bodyTop + built.bodyR * 0.7 + 3; g.add(spire);
        spire.userData.glow = true; pulses.push(spire);
        const gl = new THREE.PointLight(0xffd88a, 2.4, 60, 2); gl.position.set(0, built.bodyTop + 4, 0); g.add(gl);
        shaddaiPos = { x: cx, z: cz };
      }

      // ════════════════════════════════════════════════════════════════════════
      // 5. SECONDARY SHOPS on the OUTER concentric ring (12, alternating forms)
      // ════════════════════════════════════════════════════════════════════════
      const OUTER_N = 12;
      const shopNames = ['CAFE', 'FORGE', 'MARKET', 'CLINIC', 'GARDEN', 'NEXUS', 'STUDIO', 'BAZAAR', 'DOCK', 'LAB', 'GUILD', 'RELAY'];
      for (let i = 0; i < OUTER_N; i++) {
        const a = HEX_START + (i / OUTER_N) * Math.PI * 2 + 0.02;
        const R = OUTER_R + (i % 2 ? 8 : -6);        // slight in/out stagger, still ring-ordered
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        const form = ['round', 'box', 'dome'][i % 3];
        const built = makeShop(x, z, {
          w: 8 + (i % 3), d: 8 + (i % 2), storeys: 1 + (i % 2), form,
          label: shopNames[i]
        });
        built.g.rotation.y = Math.atan2(-x, -z);     // face inward toward the ring road
      }

      windows.instanceMatrix.needsUpdate = true;
      if (windows.instanceColor) windows.instanceColor.needsUpdate = true;

      // ════════════════════════════════════════════════════════════════════════
      // 6. STREET SIGNS / HOLO SIGNPOSTS at intersections
      // ════════════════════════════════════════════════════════════════════════
      const AVENUE_NAMES = ['NORTH WALK', 'AURA WAY', 'FORGE ROW', 'SOUTH WALK', 'ORACLE LANE', 'NEXUS ROW'];
      function signpost(x, z, faceA, text, col) {
        const gy = groundY(x, z);
        const g = new THREE.Group(); g.position.set(x, gy, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 8),
          new THREE.MeshStandardMaterial({ color: 0x223052, metalness: 0.85, roughness: 0.35 }));
        pole.position.y = 2.1; pole.castShadow = true; g.add(pole);
        const sgn = makeSign(text, col, 3.4);
        sgn.position.set(0, 3.9, 0); sgn.rotation.y = faceA; g.add(sgn);
        // second face (back) so it reads both ways
        const sgn2 = makeSign(text, col, 3.4);
        sgn2.position.set(0, 3.9, 0); sgn2.rotation.y = faceA + Math.PI; g.add(sgn2);
        const tip = new THREE.PointLight(col, 0.8, 10, 2); tip.position.set(0, 4.4, 0); g.add(tip);
        CITY.add(g); addSolid(x, z, 0.4, 0.4);
      }
      // one signpost where each radial meets the inner ring
      for (let i = 0; i < AXES; i++) {
        const a = HEX_START + (i / AXES) * Math.PI * 2;
        const sx = Math.cos(a) * (INNER_R - 6), sz = Math.sin(a) * (INNER_R - 6);
        signpost(sx, sz, a + Math.PI / 2, AVENUE_NAMES[i], pick(NEON));
      }

      // ════════════════════════════════════════════════════════════════════════
      // 7. PLAZA CENTRE — fountain + walkable-around monument (solid)
      // ════════════════════════════════════════════════════════════════════════
      {
        const gy = groundY(0, 0);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 1.0, 28),
          new THREE.MeshStandardMaterial({ color: 0x16203a, roughness: 0.5, metalness: 0.4, emissive: 0x0a1f3a, emissiveIntensity: 0.4 }));
        base.position.set(0, gy + 0.5, 0); base.receiveShadow = true; CITY.add(base);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.3, 28),
          new THREE.MeshBasicMaterial({ color: 0x1a6cff, transparent: true, opacity: 0.5, toneMapped: false }));
        water.position.set(0, gy + 1.05, 0); CITY.add(water);
        const tier = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.6, 3.0, 16),
          new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.4, metalness: 0.5, emissive: 0x102a4a, emissiveIntensity: 0.5 }));
        tier.position.set(0, gy + 2.4, 0); CITY.add(tier);
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1),
          new THREE.MeshBasicMaterial({ color: 0x27e0ff, toneMapped: false }));
        orb.position.set(0, gy + 5, 0); CITY.add(orb); orb.userData.glow = true; pulses.push(orb);
        const ol = new THREE.PointLight(0x27e0ff, 2.2, 44, 2); ol.position.set(0, gy + 6, 0); CITY.add(ol);
        addSolid(0, 0, 6.2, 6.2);
      }

      // ════════════════════════════════════════════════════════════════════════
      // 8. PROPS — instanced STREET LAMPS, BOLLARDS, glowing TREES/planters
      // ════════════════════════════════════════════════════════════════════════

      // -- STREET LAMPS along the inner + outer rings (instanced pole + head) --
      const lampSpots = [];
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; lampSpots.push([Math.cos(a) * (INNER_R + 6), Math.sin(a) * (INNER_R + 6)]); }
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2 + 0.1; lampSpots.push([Math.cos(a) * (OUTER_R + 6), Math.sin(a) * (OUTER_R + 6)]); }
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; lampSpots.push([Math.cos(a) * (PLAZA_R + 3), Math.sin(a) * (PLAZA_R + 3)]); }
      {
        const poleGeo = new THREE.CylinderGeometry(0.13, 0.18, 5.2, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x223052, metalness: 0.8, roughness: 0.4 });
        const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
        const headGeo = new THREE.SphereGeometry(0.42, 10, 10);
        const headMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, toneMapped: false });
        const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
        lampSpots.forEach(([lx, lz], i) => {
          const gy = groundY(lx, lz);
          _q.identity(); _s.set(1, 1, 1);
          _p.set(lx, gy + 2.6, lz); _m.compose(_p, _q, _s); poles.setMatrixAt(i, _m);
          _p.set(lx, gy + 5.4, lz); _m.compose(_p, _q, _s); heads.setMatrixAt(i, _m);
          addSolid(lx, lz, 0.35, 0.35);
        });
        poles.castShadow = true; CITY.add(poles); CITY.add(heads);
        // a few real point-lights only near the plaza ring (perf)
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pl = new THREE.PointLight(0x8fd0ff, 0.9, 26, 2); const px = Math.cos(a) * (PLAZA_R + 3), pz = Math.sin(a) * (PLAZA_R + 3); pl.position.set(px, groundY(px, pz) + 5, pz); CITY.add(pl); }
      }

      // -- glowing TREES / planters ringing the plaza (instanced trunk + canopy) --
      {
        const N = 14;
        const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.8, metalness: 0.1 });
        const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
        const canGeo = new THREE.IcosahedronGeometry(1.4, 0);
        const canMat = new THREE.MeshStandardMaterial({ color: 0x1fd6c4, emissive: 0x0a5a4a, emissiveIntensity: 0.7, roughness: 0.8, metalness: 0.1 });
        const cans = new THREE.InstancedMesh(canGeo, canMat, N);
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2 + 0.22;
          const tx = Math.cos(a) * (PLAZA_R - 3), tz = Math.sin(a) * (PLAZA_R - 3);
          const gy = groundY(tx, tz);
          _q.identity(); _s.set(1, 1, 1);
          _p.set(tx, gy + 1.1, tz); _m.compose(_p, _q, _s); trunks.setMatrixAt(i, _m);
          _p.set(tx, gy + 3.0, tz); _m.compose(_p, _q, _s); cans.setMatrixAt(i, _m);
          addSolid(tx, tz, 0.5, 0.5);
        }
        trunks.castShadow = true; CITY.add(trunks); CITY.add(cans);
      }

      // -- glowing BOLLARDS lining the radial avenues (instanced) --
      {
        const spots = [];
        for (let i = 0; i < AXES; i++) {
          const a = HEX_START + (i / AXES) * Math.PI * 2;
          const ux = Math.cos(a), uz = Math.sin(a), px = -uz, pz = ux;
          for (let s = 0; s < 6; s++) {
            const along = PLAZA_R + 6 + s * ((INNER_R - PLAZA_R - 8) / 5);
            for (const side of [-1, 1]) spots.push([ux * along + px * (STREET_W / 2 + 1) * side, uz * along + pz * (STREET_W / 2 + 1) * side]);
          }
        }
        const bgeo = new THREE.CylinderGeometry(0.2, 0.24, 1.0, 8);
        const bmat = new THREE.MeshStandardMaterial({ color: 0x16233f, metalness: 0.6, roughness: 0.4, emissive: 0x27e0ff, emissiveIntensity: 0.5 });
        const bolls = new THREE.InstancedMesh(bgeo, bmat, spots.length);
        spots.forEach(([bx, bz], i) => { const gy = groundY(bx, bz); _q.identity(); _s.set(1, 1, 1); _p.set(bx, gy + 0.5, bz); _m.compose(_p, _q, _s); bolls.setMatrixAt(i, _m); });
        CITY.add(bolls);
      }

      // ════════════════════════════════════════════════════════════════════════
      // 9. HF POSTERS — a few holo-billboards flanking the plaza approaches
      // ════════════════════════════════════════════════════════════════════════
      function makePoster(file, x, z, ry, w, h) {
        const gy = groundY(x, z);
        const grp = new THREE.Group(); grp.position.set(x, gy, z); grp.rotation.y = ry;
        const pTex = loadTex(file, 1, 1);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ color: pTex ? 0xffffff : pick(NEON), map: pTex || null, toneMapped: false }));
        face.position.set(0, h / 2 + 3.5, 0); grp.add(face);
        const frameMat = new THREE.MeshBasicMaterial({ color: pick(NEON), toneMapped: false });
        const bars = [[w + 0.5, 0.35, 0, h / 2], [w + 0.5, 0.35, 0, -h / 2], [0.35, h + 0.35, -w / 2, 0], [0.35, h + 0.35, w / 2, 0]];
        bars.forEach(([bw, bh, bx, by]) => { const m = new THREE.Mesh(unitBox, frameMat); m.scale.set(bw, bh, 0.25); m.position.set(bx, h / 2 + 3.5 + by, 0.02); grp.add(m); });
        for (const sx of [-w / 2 + 0.5, w / 2 - 0.5]) { const p = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x1a2136, metalness: 0.7, roughness: 0.4 })); p.scale.set(0.35, 3.5, 0.35); p.position.set(sx, 1.7, -0.2); grp.add(p); }
        const bl = new THREE.PointLight(0x66aaff, 1.1, 22, 2); bl.position.set(0, h / 2 + 3.5, 1.3); grp.add(bl);
        CITY.add(grp); addSolid(x, z, w * 0.5, 1.0);
      }
      makePoster('poster-1.jpg', -PLAZA_R - 8, -12, Math.PI * 0.3, 8, 5);
      makePoster('poster-2.jpg',  PLAZA_R + 8, -10, -Math.PI * 0.3, 8, 5);
      makePoster('poster-3.jpg',  0, PLAZA_R + 8, Math.PI, 10, 6);

      // ════════════════════════════════════════════════════════════════════════
      // 10. SPAWN + COLLISION API — spawn just outside the chosen hero's door
      // ════════════════════════════════════════════════════════════════════════
      const chosen = (ctx.chosen || 'TURTLE').toUpperCase();
      const heroStart = starts[chosen] || starts.TURTLE || { x: 0, z: PLAZA_R - 6 };
      let spawn = { x: heroStart.x, z: heroStart.z };
      // safety: nudge spawn out of any solid
      if (solidAt(spawn.x, spawn.z)) {
        const dir = new THREE.Vector2(-spawn.x, -spawn.z).normalize();
        for (let step = 0; step < 12 && solidAt(spawn.x, spawn.z); step++) { spawn.x += dir.x * 2; spawn.z += dir.y * 2; }
      }

      ctx.city = {
        radius: TOWN_RADIUS,
        isSolid: solidAt,
        starts: starts,
        shaddai: shaddaiPos || { x: 0, z: -(PLAZA_R - 6) },
        spawn: spawn,
        group: CITY
      };

      // move player to spawn if it already exists (player module runs after us,
      // but be defensive so it works either way)
      if (ctx.player && ctx.player.position) {
        const sy = groundY(spawn.x, spawn.z);
        ctx.player.position.set(spawn.x, sy, spawn.z);
        if (ctx.player.object3D) ctx.player.object3D.position.set(spawn.x, sy, spawn.z);
      }

      // ════════════════════════════════════════════════════════════════════════
      // update() — cheap neon pulse + holo spin only.  No allocation.
      // ════════════════════════════════════════════════════════════════════════
      return {
        update: function (dt, t) {
          for (let i = 0; i < pulses.length; i++) {
            const o = pulses[i];
            if (o.material) o.material.opacity = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.0 + i));
          }
          for (let i = 0; i < holos.length; i++) holos[i].rotation.z += dt * 0.8;
        }
      };
    }
  };
})();
