/* ═══════════════════════════════════════════════════════════════════════════
   XTO_Npcs — the townsfolk + traffic (module #4)   [REWORK — "leaning A" 3D]

   Owner feedback that drove this rewrite:
     1. The old 2D billboard crowd was HORRIBLE  -> REMOVED.
        Replaced with a FEW (5–8) real 3D agent GLBs as townsfolk. Small-town
        density. They stand at a spot or gently wander between waypoints.
        Animation ONLY if the GLB ships a walk/idle clip; NEVER dance/attack.
     2. The old cars were BOX cars -> REMOVED.
        Replaced with 2–3 sleek futuristic HOVER-PODS: rounded capsule/ellipsoid
        body, curved tinted canopy, glowing underlight + thruster, tapered nose,
        neon trim. They glide slowly above the road and ease to a stop near you.
     3. Night = fewer townsfolk out (some go home / hurry), guarded cheaply
        via ctx.time.night.

   Contract:  window.XTO_Npcs = { build(ctx) -> { update(dt,t) } }
   ctx = { THREE, scene, loader, camera, time:{night},
           player:{position}, city:{radius,isSolid,starts,shaddai,spawn},
           terrain:{heightAt} }        (built AFTER City)

   Perf: agent GLB loaded ONCE each (cache), scene = a few objects, O(n) update,
   no per-frame allocation (scratch vectors reused), mixer.update for animated GLBs.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  window.XTO_Npcs = {
    build(ctx) {
      const THREE = ctx.THREE;
      const scene = ctx.scene;
      const camera = ctx.camera;
      const loader = ctx.loader || null;

      // ── Guards: this module leans on City + Terrain. Degrade gracefully. ──
      const city = ctx.city || null;
      const terrain = ctx.terrain || null;
      const RADIUS = (city && +city.radius) || 130;
      const isSolid = (city && typeof city.isSolid === 'function')
        ? city.isSolid
        : function () { return false; };
      const groundY = (terrain && typeof terrain.heightAt === 'function')
        ? terrain.heightAt
        : function () { return 0; };

      // ── Root group ───────────────────────────────────────────────────────
      const root = new THREE.Group();
      root.name = 'XTO_Npcs';
      scene.add(root);

      // ── Scratch (reused every frame — zero per-frame allocation) ──────────
      const _tmpA = new THREE.Vector3();
      const _tmpB = new THREE.Vector3();
      const _playerPos = new THREE.Vector3();

      // ── Tunables ─────────────────────────────────────────────────────────
      const AGENT_SCALE_TARGET = 1.9;   // desired townsfolk height (world units)
      const WANDER_R = RADIUS * 0.72;   // keep folk near the plaza/shops, inside ring
      const WALK_SPEED_DAY = 1.3;       // gentle stroll
      const WALK_SPEED_NIGHT = 2.6;     // hurry home
      const REPOINT_DIST = 1.2;         // reached-waypoint threshold
      const DAY_TOWNSFOLK = 7;          // out during the day (5–8 range)
      const NIGHT_TOWNSFOLK = 3;        // most have gone home

      // Agent GLBs (loaded ONCE each, cached in glbCache). ~a handful placed.
      const AGENT_URLS = {
        SHADDAI: '/assets/agents/SHADDAI.glb',
        ORACLE:  '/assets/agents/ORACLE.glb',
        QUILL:   '/assets/agents/QUILL.glb',
        PIKADON: '/assets/agents/PIKADON.glb',
        NEXUS:   '/assets/agents/NEXUS.glb',
        ZEROX:   '/assets/agents/ZEROX.glb',
      };
      // One townsperson per agent (7 total). Home = their shop/start if City gave one.
      const AGENT_ORDER = ['ORACLE', 'QUILL', 'PIKADON', 'NEXUS', 'ZEROX', 'SHADDAI'];

      const glbCache = Object.create(null);   // url -> Promise<gltf> (load once)
      function loadGLB(url) {
        if (!loader) return Promise.reject(new Error('no loader'));
        if (glbCache[url]) return glbCache[url];
        glbCache[url] = new Promise(function (resolve, reject) {
          loader.load(url, resolve, undefined, reject);
        });
        return glbCache[url];
      }

      // Pick a "home" position for a townsperson. Prefer their shop start; else
      // a random reachable point near the plaza. Returns {x,z}.
      function homeFor(name) {
        const s = city && city.starts && city.starts[name];
        if (s && typeof s.x === 'number' && !isSolid(s.x, s.z)) return { x: s.x, z: s.z };
        const spot = randomWaypoint(_tmpA);
        return { x: spot.x, z: spot.z };
      }

      // A random reachable point on the streets (never inside a building).
      function randomWaypoint(out) {
        for (let tries = 0; tries < 14; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * WANDER_R;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (!isSolid(x, z)) { out.set(x, 0, z); return out; }
        }
        out.set(0, 0, 0); return out;   // fallback: plaza centre
      }

      // ── Townsfolk pool (filled asynchronously as GLBs load) ───────────────
      const townsfolk = [];   // { grp, mixer|null, action|null, home, target, wander, pauseT, speedScale, radiusScale }

      function normalizeAndPlace(gltf, home) {
        const src = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!src) return null;
        const model = src.clone(true);

        // Scale to ~AGENT_SCALE_TARGET tall using the source bounding box.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const h = size.y || 1;
        const scale = AGENT_SCALE_TARGET / h;
        model.scale.setScalar(scale);

        // Re-measure after scaling so feet land exactly on the ground.
        const box2 = new THREE.Box3().setFromObject(model);
        const footOffset = -box2.min.y;   // lift so lowest point sits at grp origin

        const grp = new THREE.Group();
        model.position.y = footOffset;
        grp.add(model);

        // Soft ground shadow (shared geo/mat).
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        shadow.scale.setScalar(0.9);
        grp.add(shadow);

        grp.position.set(home.x, groundY(home.x, home.z), home.z);
        root.add(grp);

        // Animation: ONLY use a walk/idle clip. Never dance/attack/heavy/flip.
        let mixer = null, walkAction = null, idleAction = null;
        const clips = gltf.animations || [];
        if (clips.length) {
          const walk = pickClip(clips, ['walk', 'run', 'stroll', 'move']);
          const idle = pickClip(clips, ['idle', 'stand', 'breath', 'wait']);
          if (walk || idle) {
            mixer = new THREE.AnimationMixer(model);
            if (walk) { walkAction = mixer.clipAction(walk); walkAction.play(); walkAction.setEffectiveWeight(0); }
            if (idle) { idleAction = mixer.clipAction(idle); idleAction.play(); idleAction.setEffectiveWeight(1); }
          }
        }

        return { grp, mixer, walkAction, idleAction };
      }

      // Find a clip whose name loosely matches one of the allowed keywords.
      // Explicitly rejects violent/dance clips regardless of match.
      const BANNED = ['attack', 'atk', 'dance', 'flip', 'heavy', 'hit', 'die', 'death', 'jump', 'kick', 'punch', 'special', 'combo', 'windup', 'roll'];
      function pickClip(clips, wanted) {
        for (let w = 0; w < wanted.length; w++) {
          for (let i = 0; i < clips.length; i++) {
            const nm = (clips[i].name || '').toLowerCase();
            if (isBanned(nm)) continue;
            if (nm.indexOf(wanted[w]) !== -1) return clips[i];
          }
        }
        return null;
      }
      function isBanned(nm) {
        for (let i = 0; i < BANNED.length; i++) if (nm.indexOf(BANNED[i]) !== -1) return true;
        return false;
      }

      // Kick off loads — one townsperson per agent, in order. Failures are silent.
      AGENT_ORDER.forEach(function (name, idx) {
        const url = AGENT_URLS[name];
        if (!url) return;
        const home = homeFor(name);
        loadGLB(url).then(function (gltf) {
          const built = normalizeAndPlace(gltf, home);
          if (!built) return;
          const target = new THREE.Vector3();
          randomWaypoint(target);
          townsfolk.push({
            name: name,
            grp: built.grp,
            mixer: built.mixer,
            walkAction: built.walkAction,
            idleAction: built.idleAction,
            home: home,
            target: target,
            pauseT: 1 + Math.random() * 3,   // start settled at their spot
            homebody: (idx % 2 === 0),       // half tend to loiter near their shop
            slot: idx,
          });
        }).catch(function () { /* GLB missing -> that person just isn't there */ });
      });

      // ── Shared shadow geo/mat (townsfolk + used nowhere else) ─────────────
      const shadowGeo = new THREE.CircleGeometry(0.55, 20);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false,
      });

      // ══════════════════════════════════════════════════════════════════════
      //  FUTURISTIC HOVER-PODS (2–3)  — sleek rounded speeders, NOT boxes.
      //  Body = squashed capsule/ellipsoid. Canopy = curved tinted glass dome.
      //  Underlight bar + rear thruster glow. Tapered nose. Neon trim ring.
      //  All child geometries are SHARED across pods (built once).
      // ══════════════════════════════════════════════════════════════════════
      const NUM_PODS = 3;

      // Rounded ellipsoid body: a sphere squashed into a smooth teardrop-ish hull.
      const podBodyGeo = new THREE.SphereGeometry(1, 24, 16);
      podBodyGeo.scale(1.05, 0.5, 2.0);          // wide-ish, low, long -> sleek hull
      // Tapered nose cone (smooth, points forward +Z).
      const podNoseGeo = new THREE.ConeGeometry(0.85, 1.7, 24);
      podNoseGeo.rotateX(Math.PI / 2);           // point along +Z
      // Curved tinted canopy — a half-sphere dome (top-front bubble).
      const podCanopyGeo = new THREE.SphereGeometry(0.72, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      podCanopyGeo.scale(1.0, 0.85, 1.35);
      // Glowing underlight bar (thin rounded capsule along belly).
      const podUnderGeo = new THREE.CapsuleGeometry(0.14, 2.4, 4, 8);
      podUnderGeo.rotateX(Math.PI / 2);
      // Rear thruster ring + glow disc.
      const podThrusterGeo = new THREE.TorusGeometry(0.34, 0.12, 10, 20);
      const podGlowGeo = new THREE.CircleGeometry(0.3, 16);
      // Neon trim ring around the hull midsection.
      const podTrimGeo = new THREE.TorusGeometry(1.35, 0.055, 8, 32);
      podTrimGeo.scale(1.0, 1.0, 1.45);          // stretch to hug the long hull

      const POD_COLORS = [0x22d3ff, 0xff2d6f, 0xa855f7];   // cyan / magenta / violet

      // Shared materials keyed by color index (metallic hull + one neon per pod).
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x0a1622, metalness: 0.5, roughness: 0.08,
        transparent: true, opacity: 0.55,
        emissive: 0x123449, emissiveIntensity: 0.5,
      });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b0f16, metalness: 0.7, roughness: 0.4 });

      const pods = [];
      function makePod(colorHex) {
        const pod = new THREE.Group();

        const hullMat = new THREE.MeshStandardMaterial({
          color: 0xdfe9f5, metalness: 0.85, roughness: 0.22,
          emissive: colorHex, emissiveIntensity: 0.06,
        });
        const neonMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const neonSoft = new THREE.MeshBasicMaterial({
          color: colorHex, transparent: true, opacity: 0.85,
        });

        const body = new THREE.Mesh(podBodyGeo, hullMat);
        body.position.y = 0.7; pod.add(body);

        const nose = new THREE.Mesh(podNoseGeo, hullMat);
        nose.position.set(0, 0.65, 2.35); pod.add(nose);

        const canopy = new THREE.Mesh(podCanopyGeo, glassMat);
        canopy.position.set(0, 0.95, 0.35); pod.add(canopy);

        const trim = new THREE.Mesh(podTrimGeo, neonMat);
        trim.position.y = 0.7; pod.add(trim);

        const under = new THREE.Mesh(podUnderGeo, neonSoft);
        under.position.set(0, 0.28, 0); pod.add(under);

        const thruster = new THREE.Mesh(podThrusterGeo, darkMat);
        thruster.position.set(0, 0.7, -2.05); pod.add(thruster);
        const glow = new THREE.Mesh(podGlowGeo, neonMat);
        glow.position.set(0, 0.7, -2.12);
        glow.rotation.y = Math.PI;            // face rearward
        pod.add(glow);

        pod._underlight = under;               // pulse handle
        pod._glow = glow;
        root.add(pod);
        return pod;
      }

      for (let i = 0; i < NUM_PODS; i++) {
        const pod = makePod(POD_COLORS[i % POD_COLORS.length]);
        const lane = (0.42 + 0.42 * (i / Math.max(1, NUM_PODS - 1))) * WANDER_R;
        const loopRadius = Math.min(lane, WANDER_R - 6);
        const dir = (i % 2 === 0) ? 1 : -1;
        const startAng = (i / NUM_PODS) * Math.PI * 2;
        pods.push({
          pod: pod,
          angle: startAng,
          radius: loopRadius,
          dir: dir,
          speedMul: 1,          // eased toward target each frame (smooth stop/go)
          hoverPhase: Math.random() * Math.PI * 2,
        });
      }

      // ── helpers ───────────────────────────────────────────────────────────
      function getPlayerPos(out) {
        const p = ctx.player;
        if (p) {
          if (p.position && p.position.isVector3) return out.copy(p.position);
          if (p.object3D && p.object3D.position) return out.copy(p.object3D.position);
        }
        return out.set(0, 0, 0);
      }

      const POD_SPEED = 5.0;    // slow, graceful glide
      const HOVER_H = 0.9;      // ride height above the ground

      // ── UPDATE ────────────────────────────────────────────────────────────
      function update(dt, t) {
        const night = !!(ctx.time && ctx.time.night);
        const activeCount = night ? NIGHT_TOWNSFOLK : DAY_TOWNSFOLK;
        const walkSpeed = night ? WALK_SPEED_NIGHT : WALK_SPEED_DAY;

        getPlayerPos(_playerPos);

        // ── Townsfolk ──
        for (let i = 0; i < townsfolk.length; i++) {
          const c = townsfolk[i];

          // Day/night thinning: extras "go home" (hidden cheaply). Priority by slot.
          const shouldBeActive = c.slot < activeCount;
          if (c.grp.visible !== shouldBeActive) c.grp.visible = shouldBeActive;
          if (!shouldBeActive) {
            // keep mixer frozen when hidden (no update) — cheap
            continue;
          }

          const pos = c.grp.position;
          let moving = false;

          if (c.pauseT > 0) {
            c.pauseT -= dt;                    // standing at their spot (idle)
          } else {
            _tmpA.set(c.target.x - pos.x, 0, c.target.z - pos.z);
            const dist = _tmpA.length();
            if (dist < REPOINT_DIST) {
              // arrived -> pause a bit, then choose next spot.
              // Homebodies mostly return to their shop; others roam the plaza.
              if (c.homebody && Math.random() < 0.6) {
                c.target.set(c.home.x, 0, c.home.z);
              } else {
                randomWaypoint(c.target);
              }
              c.pauseT = 1.5 + Math.random() * (night ? 1.5 : 4.0);   // linger less at night
            } else {
              _tmpA.multiplyScalar(1 / dist);   // heading

              const step = walkSpeed * dt;
              const nx = pos.x + _tmpA.x * step;
              const nz = pos.z + _tmpA.z * step;
              const inRing = (nx * nx + nz * nz) < (WANDER_R * WANDER_R);
              if (inRing && !isSolid(nx, nz)) {
                pos.x = nx; pos.z = nz;
                moving = true;
                // face direction of travel
                c.grp.rotation.y = Math.atan2(_tmpA.x, _tmpA.z);
              } else {
                randomWaypoint(c.target);        // blocked -> new goal
              }
            }
          }

          // keep feet on terrain (cheap sampler)
          pos.y = groundY(pos.x, pos.z);

          // Animation cross-fade: walk while moving, idle while paused — only if
          // the GLB actually provided those clips.
          if (c.mixer) {
            c.mixer.update(dt);
            if (c.walkAction && c.idleAction) {
              const wantWalk = moving ? 1 : 0;
              const wa = c.walkAction, ia = c.idleAction;
              const cur = wa.getEffectiveWeight();
              const next = cur + (wantWalk - cur) * Math.min(1, dt * 8);
              wa.setEffectiveWeight(next);
              ia.setEffectiveWeight(1 - next);
            }
          }
        }

        // ── Hover-pods ──
        for (let i = 0; i < pods.length; i++) {
          const pp = pods[i];

          // ease to a stop when the player is near this pod's path
          _tmpA.copy(pp.pod.position); _tmpA.y = 0;
          const distToPlayer = _tmpA.distanceTo(_playerPos);
          let targetMul = 1;
          if (distToPlayer < 6) targetMul = 0;         // full, smooth stop
          else if (distToPlayer < 13) targetMul = 0.3; // ease down / crawl
          pp.speedMul += (targetMul - pp.speedMul) * Math.min(1, dt * 3);

          const angStep = (POD_SPEED / Math.max(6, pp.radius)) * dt * pp.dir * pp.speedMul;
          pp.angle += angStep;

          const px = Math.cos(pp.angle) * pp.radius;
          const pz = Math.sin(pp.angle) * pp.radius;

          // hover: ride above ground with a gentle bob
          pp.hoverPhase += dt * 1.4;
          const bob = Math.sin(pp.hoverPhase) * 0.08;
          pp.pod.position.set(px, groundY(px, pz) + HOVER_H + bob, pz);

          // heading = tangent to the loop (nose leads)
          const heading = pp.angle + (pp.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
          pp.pod.rotation.y = heading;
          // slight bank into the turn for style
          pp.pod.rotation.z = -0.12 * pp.dir * pp.speedMul;

          // pulse the underlight/thruster (brighter when moving)
          const glowP = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(pp.hoverPhase * 1.7));
          const drive = 0.5 + 0.5 * pp.speedMul;
          if (pp.pod._underlight) pp.pod._underlight.material.opacity = 0.45 + 0.4 * glowP * drive;
          if (pp.pod._glow) pp.pod._glow.scale.setScalar(0.8 + 0.5 * glowP * drive);
        }
      }

      // Expose a little info for other modules / debugging.
      return {
        update: update,
        root: root,
        get townsfolkCount() { return townsfolk.length; },
        podCount: pods.length,
      };
    },
  };
})();
