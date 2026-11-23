/* ============================================================================
 * SHADDAI — combat.js
 * Self-contained combat module for the isometric 2.5D world.
 * Pure Canvas 2D, code-drawn voxel style. No assets, no external libs.
 *
 * Exposes window.Combat with:
 *   TYPES, spawnFor, update, draw, playerAttack
 *
 * Iso constants (for reference; drawing gets screen coords passed in):
 *   TW = 84, TH = 42  (true 2:1 iso)
 * ==========================================================================*/
(function () {
  'use strict';

  var TW = 84, TH = 42;

  // ---- tiny helpers --------------------------------------------------------
  // fal-generated pixel-art sprites, lazily loaded per enemy kind (shapes are
  // the fallback when a sprite is absent or still loading).
  var _sprCache = {};
  function spriteImg(kind) {
    if (!_sprCache[kind]) {
      var im = new Image();
      im.src = 'assets/world/enemy-' + encodeURIComponent(kind) + '.png';
      _sprCache[kind] = im;
    }
    return _sprCache[kind];
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function irnd(a, b) { return Math.floor(rnd(a, b + 1)); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  function shade(hex, amt) {
    // amt in [-1,1]; darken/lighten a #rrggbb hex
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r += r * amt; g += g * amt; b += b * amt; }
    r = clamp(Math.round(r), 0, 255); g = clamp(Math.round(g), 0, 255); b = clamp(Math.round(b), 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ---- enemy type table ----------------------------------------------------
  // hp, speed(tiles/sec), dmg, r(attack radius tiles), color, size(px scale),
  // tough(loot scalar), shape(draw variant), eye(eye color).
  var TYPES = {
    // forest / meadow
    wolf:       { name: 'Wolf',        hp: 26, speed: 2.4, dmg: 6,  r: 0.9, color: '#6b7280', size: 1.0, tough: 1.0, shape: 'beast',  eye: '#ffd24a' },
    direwolf:   { name: 'Dire Wolf',   hp: 90, speed: 2.6, dmg: 16, r: 1.1, color: '#3b3f4a', size: 1.5, tough: 3.2, shape: 'beast',  eye: '#ff4a4a', boss: true },
    boar:       { name: 'Boar',        hp: 34, speed: 1.9, dmg: 8,  r: 0.9, color: '#7a5a44', size: 1.1, tough: 1.2, shape: 'beast',  eye: '#ffbf6a' },

    // beach
    gull:       { name: 'Gull',        hp: 10, speed: 2.8, dmg: 3,  r: 0.8, color: '#e9edf2', size: 0.8, tough: 0.5, shape: 'bird',   eye: '#222831' },
    crab:       { name: 'Crab',        hp: 18, speed: 1.4, dmg: 5,  r: 0.8, color: '#e06a4a', size: 0.9, tough: 0.8, shape: 'crab',   eye: '#101418' },

    // desert
    scorpion:   { name: 'Scorpion',    hp: 22, speed: 1.8, dmg: 9,  r: 0.9, color: '#c8a24a', size: 0.9, tough: 1.1, shape: 'crab',   eye: '#201800' },
    coyote:     { name: 'Coyote',      hp: 24, speed: 2.5, dmg: 6,  r: 0.9, color: '#b98a5e', size: 1.0, tough: 1.0, shape: 'beast',  eye: '#ffe08a' },

    // volcano
    lavahound:  { name: 'Lava Hound',  hp: 44, speed: 2.5, dmg: 12, r: 1.0, color: '#ff5a2a', size: 1.1, tough: 1.8, shape: 'beast',  eye: '#fff2a0', glow: '#ff8a3a' },
    magmagolem: { name: 'Magma Golem', hp: 140, speed: 1.3, dmg: 22, r: 1.2, color: '#803020', size: 1.7, tough: 4.0, shape: 'golem', eye: '#ffcf3a', glow: '#ff6a1a', boss: true },

    // city / agentcity / suburb
    mugger:     { name: 'Mugger',      hp: 20, speed: 2.2, dmg: 5,  r: 0.9, color: '#2b2f38', size: 1.0, tough: 0.9, shape: 'humanoid', eye: '#c0c8d0' },
    drone:      { name: 'Rogue Drone', hp: 16, speed: 3.0, dmg: 4,  r: 1.0, color: '#39424f', size: 0.85, tough: 0.8, shape: 'drone',  eye: '#00e0ff', glow: '#00e0ff' }
  };

  // dark realm enemy roster — shadow-themed, escalating across 5 forest zones
  var DARK_TYPES = {
    shade:         { name: 'Shade',         hp: 24,  speed: 2.3, dmg: 7,  r: 0.9, color: '#241a38', size: 1.0,  tough: 1.0, shape: 'beast',    eye: '#cc44ff' },
    bonehound:     { name: 'Bonehound',     hp: 34,  speed: 2.8, dmg: 9,  r: 0.9, color: '#2a2230', size: 1.05, tough: 1.3, shape: 'beast',    eye: '#ff4444' },
    wraith:        { name: 'Wraith',        hp: 40,  speed: 2.6, dmg: 11, r: 1.0, color: '#3a1a4a', size: 1.1,  tough: 1.6, shape: 'humanoid', eye: '#aa00ff', glow: '#8800cc' },
    cultist:       { name: 'Cultist',       hp: 46,  speed: 2.0, dmg: 13, r: 1.0, color: '#1a0f24', size: 1.1,  tough: 1.7, shape: 'humanoid', eye: '#ff0044' },
    shadow_wraith: { name: 'Shadow Wraith', hp: 60,  speed: 2.4, dmg: 14, r: 1.0, color: '#160a20', size: 1.2,  tough: 2.0, shape: 'humanoid', eye: '#dd00ff', glow: '#aa00ff' },
    gate_guardian: { name: 'Gate Guardian', hp: 160, speed: 1.4, dmg: 28, r: 1.2, color: '#241030', size: 1.6,  tough: 3.5, shape: 'golem',    eye: '#ff2266', glow: '#cc0044', boss: true }
  };
  for (var _dk in DARK_TYPES) { TYPES[_dk] = DARK_TYPES[_dk]; }

  // zone 1-5 enemy pools — variety and average toughness increase per zone
  var DARK_ZONE_POOL = [
    ['shade'],
    ['shade', 'bonehound'],
    ['shade', 'bonehound', 'wraith'],
    ['wraith', 'bonehound', 'cultist'],
    ['wraith', 'cultist', 'shadow_wraith']
  ];

  // which types populate each region, and base spawn budget
  var REGIONS = {
    meadow:    { day: ['boar'],                          night: ['wolf', 'boar', 'direwolf'],        base: 5 },
    forest:    { day: ['wolf', 'boar'],                  night: ['wolf', 'wolf', 'boar', 'direwolf'], base: 6 },
    beach:     { day: ['gull', 'crab'],                  night: ['crab', 'gull'],                     base: 4 },
    desert:    { day: ['scorpion', 'coyote'],            night: ['coyote', 'scorpion', 'scorpion'],   base: 5 },
    volcano:   { day: ['lavahound', 'lavahound', 'magmagolem'], night: ['lavahound', 'lavahound', 'magmagolem'], base: 6 },
    city:      { day: ['mugger'],                        night: ['mugger', 'mugger', 'drone'],        base: 2 },
    agentcity: { day: ['drone'],                         night: ['drone', 'mugger'],                  base: 2 },
    suburb:    { day: [],                                night: ['mugger', 'drone'],                  base: 1 }
  };

  var _id = 0;

  function makeEnemy(kind, col, row) {
    var t = TYPES[kind] || TYPES.wolf;
    return {
      id: ++_id,
      kind: kind,
      col: col, row: row,      // fractional grid position (feet)
      tc: col, tr: row,        // wander target
      hp: t.hp, maxhp: t.hp,
      speed: t.speed,
      dmg: t.dmg,
      r: t.r,                  // attack radius (tiles)
      atkCd: rnd(0, 1),        // stagger initial attacks
      dead: false,
      hitFlash: 0,             // seconds remaining of hit-flash
      aggro: 6,                // chase radius (tiles)
      bob: rnd(0, Math.PI * 2) // per-enemy animation phase
    };
  }

  // ---- spawnFor ------------------------------------------------------------
  function spawnFor(regionId, isNight, walkable, GW, GH) {
    GW = GW || 52; GH = GH || 52;
    var cfg = REGIONS[regionId];
    if (!cfg) return [];
    var pool = (isNight ? cfg.night : cfg.day);
    if (!pool || !pool.length) return [];

    var wf = (typeof walkable === 'function') ? walkable : function () { return true; };

    var budget = cfg.base + (isNight ? irnd(1, 4) : 0);
    budget = clamp(budget, 0, 10);

    var cx = GW / 2, cy = GH / 2;
    var minFromCenter = Math.min(GW, GH) * 0.18; // keep away from spawn point
    var out = [];

    for (var i = 0; i < budget; i++) {
      var placed = false;
      for (var tryn = 0; tryn < 24 && !placed; tryn++) {
        var col = irnd(1, GW - 2);
        var row = irnd(1, GH - 2);
        if (!wf(col, row)) continue;
        if (dist(col, row, cx, cy) < minFromCenter) continue;
        var kind = pool[irnd(0, pool.length - 1)];
        out.push(makeEnemy(kind, col + 0.5, row + 0.5));
        placed = true;
      }
    }
    return out;
  }

  // ---- spawnDarkZone ---------------------------------------------------------
  function spawnDarkZone(zoneNum, walkable, GW, GH) {
    GW = GW || 52; GH = GH || 52;
    var zone = clamp(zoneNum || 1, 1, 5);
    var pool = DARK_ZONE_POOL[zone - 1];
    var wf = (typeof walkable === 'function') ? walkable : function () { return true; };
    var budget = clamp(4 + zone, 4, 9);
    var out = [];

    for (var i = 0; i < budget; i++) {
      var placed = false;
      for (var tryn = 0; tryn < 24 && !placed; tryn++) {
        var col = irnd(4, GW - 4);
        var row = irnd(4, GH - 4);
        if (!wf(col, row)) continue;
        var kind = pool[irnd(0, pool.length - 1)];
        var e = makeEnemy(kind, col + 0.5, row + 0.5);
        // scale toughness up slightly with zone so later zones stay a threat
        e.hp = e.maxhp = Math.round(e.hp * (1 + (zone - 1) * 0.12));
        out.push(e);
        placed = true;
      }
    }
    return out;
  }

  // ---- update --------------------------------------------------------------
  function update(enemies, player, dt, walkable) {
    if (!enemies || !enemies.length) return 0;
    dt = dt || 0.016;
    if (dt > 0.1) dt = 0.1; // guard against big frame gaps
    var wf = (typeof walkable === 'function') ? walkable : function () { return true; };
    var px = player ? player.col : 0, py = player ? player.row : 0;
    var totalDmg = 0;

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;

      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.atkCd > 0) e.atkCd -= dt;
      e.bob += dt * 6;

      // knockback from a player hit — a quick slide, wall-aware
      if (e.knock && e.knock.t > 0) {
        var kstep = Math.min(dt, e.knock.t) / 0.16;
        var knx = e.col + e.knock.x * kstep, kny = e.row + e.knock.y * kstep;
        if (wf(Math.floor(knx), Math.floor(e.row))) e.col = knx;
        if (wf(Math.floor(e.col), Math.floor(kny))) e.row = kny;
        e.knock.t -= dt;
      }

      var dToP = dist(e.col, e.row, px, py);
      var tx, ty;

      if (player && dToP <= e.aggro) {
        // chase the player
        tx = px; ty = py;

        // attack when in range
        if (dToP <= e.r && e.atkCd <= 0) {
          totalDmg += e.dmg;
          e.atkCd = rnd(0.9, 1.2);
        }
      } else {
        // wander: pick a new nearby target when close to current one
        if (dist(e.col, e.row, e.tc, e.tr) < 0.4) {
          var found = false;
          for (var w = 0; w < 8 && !found; w++) {
            var ncx = e.col + rnd(-5, 5);
            var ncy = e.row + rnd(-5, 5);
            if (wf(Math.floor(ncx), Math.floor(ncy))) { e.tc = ncx; e.tr = ncy; found = true; }
          }
        }
        tx = e.tc; ty = e.tr;
      }

      // move toward (tx,ty), but only into walkable tiles (axis-separated so
      // enemies can slide along walls / water edges)
      var dx = tx - e.col, dy = ty - e.row;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.001) {
        // don't shove into the player's own tile — stop at attack range
        var stop = (player && dToP <= e.aggro) ? Math.max(0.5, e.r * 0.8) : 0;
        if (len > stop) {
          var step = e.speed * dt;
          if (step > len - stop) step = len - stop;
          var nx = e.col + (dx / len) * step;
          var ny = e.row + (dy / len) * step;
          if (wf(Math.floor(nx), Math.floor(e.row))) e.col = nx;
          if (wf(Math.floor(e.col), Math.floor(ny))) e.row = ny;
        }
      }
    }
    return totalDmg;
  }

  // ---- draw ----------------------------------------------------------------
  // (sx,sy) = screen ground point (the enemy's feet). Build upward from sy.
  function draw(ctx, e, sx, sy, time) {
    var t = TYPES[e.kind] || TYPES.wolf;
    var s = (t.size || 1) * (TW / 84); // px scale, tied to tile width
    var flash = e.hitFlash > 0;
    var body = flash ? '#ffffff' : t.color;
    var bob = Math.sin((e.bob || 0)) * 2 * s;

    ctx.save();

    // shadow
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 16 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // optional glow (lava/drone)
    if (t.glow) {
      ctx.globalAlpha = flash ? 0.9 : 0.5;
      var g = ctx.createRadialGradient(sx, sy - 14 * s, 2, sx, sy - 14 * s, 26 * s);
      g.addColorStop(0, t.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy - 14 * s, 26 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    var top = sy - 8 * s - bob; // reference for the body top

    // fal sprite (12:10 sprite-cam box) when loaded; voxel shapes otherwise ----
    var spr = spriteImg(e.kind);
    if (spr.complete && spr.naturalWidth > 0) {
      var bw = 22 * s, bh = 34 * s, full = bw / spr.naturalWidth;
      ctx.save();
      if (flash) { ctx.globalAlpha = 0.85; if (ctx.filter !== undefined) ctx.filter = 'brightness(2.4) saturate(0)'; }
      ctx.drawImage(spr, sx - bw / 2, sy - bh - bob + 4 * s, spr.naturalWidth * full, spr.naturalHeight * full);
      ctx.filter = 'none';
      ctx.restore();
    } else {
      // shape variants ---------------------------------------------------------
      switch (t.shape) {
        case 'beast': drawBeast(ctx, sx, sy, s, body, t, flash, bob); break;
        case 'bird':  drawBird(ctx, sx, sy, s, body, t, bob); break;
        case 'crab':  drawCrab(ctx, sx, sy, s, body, t); break;
        case 'golem': drawGolem(ctx, sx, sy, s, body, t, flash); break;
        case 'drone': drawDrone(ctx, sx, sy, s, body, t, time); break;
        case 'humanoid': drawHumanoid(ctx, sx, sy, s, body, t); break;
        default: drawBeast(ctx, sx, sy, s, body, t, flash, bob);
      }
    }

    // HP bar (only when damaged) --------------------------------------------
    if (e.hp < e.maxhp) {
      var bw = 26 * s, bh = 3.5;
      var by = sy - 34 * s - bob;
      var bx = sx - bw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#3a0d0d';
      ctx.fillRect(bx, by, bw, bh);
      var frac = clamp(e.hp / e.maxhp, 0, 1);
      ctx.fillStyle = t.boss ? '#ff2a2a' : '#ff5a5a';
      ctx.fillRect(bx, by, bw * frac, bh);
    }

    ctx.restore();
  }

  function eyes(ctx, cx, cy, gap, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx - gap, cy, size, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + gap, cy, size, 0, Math.PI * 2); ctx.fill();
  }

  // four-legged beast (wolf/boar/coyote/lavahound)
  function drawBeast(ctx, sx, sy, s, body, t, flash, bob) {
    var dark = flash ? '#ffffff' : shade(t.color, -0.35);
    // legs
    ctx.fillStyle = dark;
    ctx.fillRect(sx - 10 * s, sy - 8 * s, 3 * s, 8 * s);
    ctx.fillRect(sx + 7 * s, sy - 8 * s, 3 * s, 8 * s);
    // body (voxel block)
    ctx.fillStyle = body;
    ctx.fillRect(sx - 12 * s, sy - 18 * s - bob * 0.3, 24 * s, 12 * s);
    // top facet (iso light)
    ctx.fillStyle = flash ? '#ffffff' : shade(t.color, 0.18);
    ctx.fillRect(sx - 12 * s, sy - 18 * s - bob * 0.3, 24 * s, 4 * s);
    // head
    ctx.fillStyle = body;
    ctx.fillRect(sx + 6 * s, sy - 24 * s - bob * 0.3, 12 * s, 10 * s);
    // ears
    ctx.fillStyle = dark;
    ctx.fillRect(sx + 7 * s, sy - 27 * s - bob * 0.3, 3 * s, 4 * s);
    ctx.fillRect(sx + 13 * s, sy - 27 * s - bob * 0.3, 3 * s, 4 * s);
    // eyes
    eyes(ctx, sx + 12 * s, sy - 20 * s - bob * 0.3, 3 * s, 1.6 * s, t.eye);
  }

  function drawBird(ctx, sx, sy, s, body, t, bob) {
    var flap = Math.sin((bob || 0) * 0.6) * 4 * s;
    ctx.fillStyle = body;
    // body
    ctx.beginPath();
    ctx.ellipse(sx, sy - 16 * s, 8 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // wings
    ctx.fillStyle = shade(t.color, -0.15);
    ctx.beginPath(); ctx.moveTo(sx, sy - 16 * s);
    ctx.lineTo(sx - 16 * s, sy - 20 * s - flap); ctx.lineTo(sx - 4 * s, sy - 14 * s); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx, sy - 16 * s);
    ctx.lineTo(sx + 16 * s, sy - 20 * s - flap); ctx.lineTo(sx + 4 * s, sy - 14 * s); ctx.fill();
    // beak
    ctx.fillStyle = '#f0a83a';
    ctx.beginPath();
    ctx.moveTo(sx + 7 * s, sy - 17 * s); ctx.lineTo(sx + 13 * s, sy - 16 * s); ctx.lineTo(sx + 7 * s, sy - 14 * s); ctx.fill();
    eyes(ctx, sx + 4 * s, sy - 18 * s, 2 * s, 1.3 * s, t.eye);
  }

  function drawCrab(ctx, sx, sy, s, body, t) {
    ctx.fillStyle = shade(t.color, -0.3);
    // legs
    for (var i = -1; i <= 1; i += 2) {
      ctx.fillRect(sx + i * 12 * s, sy - 6 * s, 4 * s, 5 * s);
    }
    // claws
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(sx - 14 * s, sy - 12 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 14 * s, sy - 12 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    // shell
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 12 * s, 11 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(t.color, 0.2);
    ctx.beginPath();
    ctx.ellipse(sx, sy - 14 * s, 8 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, sx, sy - 16 * s, 3.5 * s, 1.5 * s, t.eye);
  }

  function drawGolem(ctx, sx, sy, s, body, t, flash) {
    var lite = flash ? '#ffffff' : shade(t.color, 0.15);
    var dark = flash ? '#ffffff' : shade(t.color, -0.4);
    // legs
    ctx.fillStyle = dark;
    ctx.fillRect(sx - 11 * s, sy - 12 * s, 8 * s, 12 * s);
    ctx.fillRect(sx + 3 * s, sy - 12 * s, 8 * s, 12 * s);
    // torso
    ctx.fillStyle = body;
    ctx.fillRect(sx - 14 * s, sy - 34 * s, 28 * s, 24 * s);
    ctx.fillStyle = lite;
    ctx.fillRect(sx - 14 * s, sy - 34 * s, 28 * s, 6 * s);
    // molten cracks
    if (t.glow) {
      ctx.strokeStyle = t.glow; ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(sx - 8 * s, sy - 30 * s); ctx.lineTo(sx - 2 * s, sy - 22 * s); ctx.lineTo(sx - 6 * s, sy - 14 * s);
      ctx.moveTo(sx + 8 * s, sy - 32 * s); ctx.lineTo(sx + 4 * s, sy - 24 * s);
      ctx.stroke();
    }
    // head
    ctx.fillStyle = body;
    ctx.fillRect(sx - 7 * s, sy - 46 * s, 14 * s, 13 * s);
    ctx.fillStyle = lite;
    ctx.fillRect(sx - 7 * s, sy - 46 * s, 14 * s, 3 * s);
    eyes(ctx, sx, sy - 40 * s, 3.5 * s, 2 * s, t.eye);
  }

  function drawDrone(ctx, sx, sy, s, body, t, time) {
    var hover = Math.sin((time || 0) / 200 + (sx)) * 3 * s;
    var cy = sy - 22 * s - hover;
    // rotor blur
    ctx.strokeStyle = 'rgba(180,200,220,0.5)'; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.ellipse(sx, cy - 8 * s, 16 * s, 4 * s, 0, 0, Math.PI * 2); ctx.stroke();
    // body
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(sx, cy, 10 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(t.color, 0.2);
    ctx.beginPath();
    ctx.ellipse(sx, cy - 2 * s, 7 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // single eye / sensor
    ctx.fillStyle = t.eye;
    ctx.beginPath(); ctx.arc(sx, cy + 1 * s, 2.4 * s, 0, Math.PI * 2); ctx.fill();
    if (t.glow) {
      ctx.globalAlpha = 0.6; ctx.fillStyle = t.glow;
      ctx.beginPath(); ctx.arc(sx, cy + 1 * s, 4.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // tether shadow to ground handled by main shadow
  }

  function drawHumanoid(ctx, sx, sy, s, body, t) {
    var dark = shade(t.color, -0.3), skin = '#c99a6a';
    // legs
    ctx.fillStyle = dark;
    ctx.fillRect(sx - 6 * s, sy - 12 * s, 4 * s, 12 * s);
    ctx.fillRect(sx + 2 * s, sy - 12 * s, 4 * s, 12 * s);
    // torso
    ctx.fillStyle = body;
    ctx.fillRect(sx - 8 * s, sy - 30 * s, 16 * s, 20 * s);
    ctx.fillStyle = shade(t.color, 0.12);
    ctx.fillRect(sx - 8 * s, sy - 30 * s, 16 * s, 4 * s);
    // arms
    ctx.fillStyle = dark;
    ctx.fillRect(sx - 11 * s, sy - 28 * s, 3 * s, 14 * s);
    ctx.fillRect(sx + 8 * s, sy - 28 * s, 3 * s, 14 * s);
    // head
    ctx.fillStyle = skin;
    ctx.fillRect(sx - 5 * s, sy - 40 * s, 10 * s, 10 * s);
    // hood/mask
    ctx.fillStyle = dark;
    ctx.fillRect(sx - 5 * s, sy - 40 * s, 10 * s, 4 * s);
    eyes(ctx, sx, sy - 34 * s, 2.5 * s, 1.4 * s, t.eye);
  }

  // ---- playerAttack --------------------------------------------------------
  // Returns { dead:[...], hits:[{e,dmg,crit,dead}] } so the game can pop damage numbers,
  // sparks and knockback. (Back-compat: .dead is also iterable as before via result.dead.)
  function playerAttack(enemies, player, weaponPower) {
    var dead = [], hits = [];
    if (!enemies || !enemies.length || !player) return { dead: dead, hits: hits };
    weaponPower = weaponPower || 1;
    var reach = 1.7; // tiles — slightly generous so swings connect
    var base = 8 * weaponPower;

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var d = dist(e.col, e.row, player.col, player.row);
      if (d > reach) continue;

      var crit = Math.random() < 0.16;            // 16% crit for pop
      var dmg = Math.round(base * (crit ? 1.9 : 1) * rnd(0.9, 1.1));
      e.hp -= dmg;
      e.hitFlash = crit ? 0.24 : 0.15;

      // knockback: shove the enemy away from the player (a short lunge)
      var kdx = e.col - player.col, kdy = e.row - player.row, kl = Math.sqrt(kdx * kdx + kdy * kdy) || 1;
      var kb = (crit ? 0.9 : 0.55);
      e.knock = { x: (kdx / kl) * kb, y: (kdy / kl) * kb, t: 0.16 };

      var killed = false;
      if (e.hp <= 0) {
        e.hp = 0; e.dead = true; killed = true;
        var t = TYPES[e.kind] || TYPES.wolf;
        var tough = t.tough || 1;
        e.loot = {
          money: Math.round(clamp(5 + rnd(0, 35) * tough, 5, 40 * Math.max(1, tough))),
          xp: Math.round(clamp(3 + rnd(0, 17) * tough, 3, 20 * Math.max(1, tough)))
        };
        dead.push(e);
      }
      hits.push({ e: e, dmg: dmg, crit: crit, dead: killed });
    }
    return { dead: dead, hits: hits };
  }

  // ---- publish -------------------------------------------------------------
  window.Combat = {
    TYPES: TYPES,
    spawnFor: spawnFor,
    spawnDarkZone: spawnDarkZone,
    update: update,
    draw: draw,
    playerAttack: playerAttack
  };
})();
