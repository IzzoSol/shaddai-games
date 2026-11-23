/* ═══════════════════════════════════════════════════════════════════════════
   XTO · TERRAIN — the land the town sits on.
   Owner: "actual better terrain" — a small town on a flat pad, gentle rolling
   hills rising only in the outer wilderness ring. No cliffs near town.

   Contract (see xto.html): window.XTO_Terrain = { build(ctx) → {update(dt,t)} }
   Build order: FIRST among world modules (before City + Player) so they can
   read ctx.terrain to place buildings and walk the ground.

   Exposes (the whole point of this module):
     ctx.terrain = {
       heightAt(x, z) -> y   // cheap pure-math ground height (no raycast, no alloc)
       group                 // THREE.Group holding the ground mesh
       size                  // full plane extent (units, square)
     }
   Town center (radius ≤ CORE) returns heightAt ≈ 0 so streets/buildings are level.

   Perf: geometry built ONCE at build(). heightAt is pure trig math with zero
   per-call allocation. update() is a no-op (terrain never changes).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── World proportions (small town) ─────────────────────────────────────────
  const SIZE   = 400;   // plane extent (units, square) — matches shell's old disc
  const SEG    = 200;   // subdivisions per side → ~2u quads, smooth walkable slopes
  const CORE   = 130;   // town core radius — dead flat (heightAt ≈ 0)
  const BLEND  = 90;    // ring over which flat pad eases up into the hills
  const AMP    = 9;     // max relief amplitude out in the wilderness (± a few u)

  // ── Value-noise (deterministic, cheap, zero-alloc) ─────────────────────────
  // Hash a 2D integer lattice point → pseudo-random [0,1). Pure math, no tables.
  function hash2(ix, iz) {
    let h = (ix * 374761393 + iz * 668265263) | 0;   // two large primes
    h = (h ^ (h >>> 13)) * 1274126177;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;                            // → [0,1)
  }
  // Smoothstep-interpolated value noise at (x,z). Continuous → smooth slopes.
  function valueNoise(x, z) {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = x - x0, fz = z - z0;
    const ux = fx * fx * (3 - 2 * fx);   // smootherstep-ish
    const uz = fz * fz * (3 - 2 * fz);
    const a = hash2(x0,     z0);
    const b = hash2(x0 + 1, z0);
    const c = hash2(x0,     z0 + 1);
    const d = hash2(x0 + 1, z0 + 1);
    const ab = a + (b - a) * ux;
    const cd = c + (d - c) * ux;
    return ab + (cd - ab) * uz;          // → [0,1)
  }
  // Layered (fractal) noise → natural rolling relief. Returns roughly [-1, 1].
  function fbm(x, z) {
    let f = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      f    += amp * valueNoise(x * freq, z * freq);
      norm += amp;
      amp  *= 0.5;
      freq *= 2.03;   // non-integer lacunarity avoids grid repetition
    }
    return (f / norm) * 2 - 1;           // → [-1, 1]
  }

  // ── heightAt — THE public sampler. Pure math, no allocation. ────────────────
  // Flat town pad in the centre, easing into gentle hills past CORE.
  function heightAt(x, z) {
    const r = Math.sqrt(x * x + z * z);
    if (r <= CORE) return 0;                                    // dead-flat town
    // 0 at CORE → 1 at CORE+BLEND (smoothstep so the transition has no seam)
    let t = (r - CORE) / BLEND;
    if (t > 1) t = 1;
    const ease = t * t * (3 - 2 * t);
    // low-freq rolling base + a touch of higher-freq detail
    const base   = fbm(x * 0.010, z * 0.010);          // broad hills
    const detail = fbm(x * 0.045, z * 0.045) * 0.28;   // small undulations
    return (base + detail) * AMP * ease;
  }

  window.XTO_Terrain = {
    build(ctx) {
      const THREE = ctx.THREE;
      const scene = ctx.scene;

      // ── Ground geometry (built ONCE) ──────────────────────────────────────
      const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
      const pos = geo.attributes.position;

      // Vertex colours: grass / dirt / rock blended by height + slope so the
      // land reads natural under the day/night lighting (not one flat tone).
      const colors = new Float32Array(pos.count * 3);

      const GRASS_LO = new THREE.Color(0x3f6b34);   // valley grass
      const GRASS_HI = new THREE.Color(0x5f8a3e);   // sunlit grass
      const DIRT     = new THREE.Color(0x6b5535);   // exposed earth on slopes
      const ROCK     = new THREE.Color(0x7d7a72);   // rocky hilltops
      const tmp = new THREE.Color();

      // Plane is built in XY; we rotate -90° about X so Y becomes world up.
      // Before rotation: vertex (px, py) → world (px, height, -py). We push the
      // local Z (into world +Y after rotation) to sculpt relief.
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const wx = px;
        const wz = -py;                    // world Z after the -90° X rotation
        const h  = heightAt(wx, wz);
        pos.setZ(i, h);                    // local Z → world up after rotation

        // slope estimate via cheap finite difference of heightAt
        const e = 2.0;
        const hx = heightAt(wx + e, wz) - heightAt(wx - e, wz);
        const hz = heightAt(wx, wz + e) - heightAt(wx, wz - e);
        const slope = Math.min(1, Math.sqrt(hx * hx + hz * hz) / (2 * e) * 3.2);

        const hn = Math.min(1, Math.max(0, (h + 1) / (AMP + 1)));  // 0..1 by height

        // grass at low/flat → dirt on slopes → rock on high steep tops
        tmp.copy(GRASS_LO).lerp(GRASS_HI, hn * 0.7);
        tmp.lerp(DIRT, slope * 0.75);
        tmp.lerp(ROCK, Math.min(1, hn * slope * 1.4));

        // subtle deterministic mottling so large flats aren't a dead sheet
        const m = (valueNoise(wx * 0.6, wz * 0.6) - 0.5) * 0.10;
        tmp.offsetHSL(0, 0, m);

        colors[i * 3]     = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();          // smooth lighting across the relief

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.96,
        metalness: 0.0,
        flatShading: false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0;
      mesh.receiveShadow = true;
      mesh.name = 'xto-terrain';

      const group = new THREE.Group();
      group.name = 'XTO_Terrain';
      group.add(mesh);
      scene.add(group);

      // Retire the shell's flat fallback disc — this ground replaces it.
      if (ctx.groundFallback) {
        scene.remove(ctx.groundFallback);
        try {
          ctx.groundFallback.geometry.dispose();
          ctx.groundFallback.material.dispose();
        } catch (_) {}
        ctx.groundFallback = null;
      }

      // ── Publish the API City + Player rely on ─────────────────────────────
      ctx.terrain = { heightAt, group, size: SIZE };

      return {
        update() { /* terrain is static — no-op */ },
        heightAt,
        group,
        size: SIZE,
      };
    },
  };
})();
