/* region-map.js — SHADDAI top-down region-select world map (Canvas 2D, $0, no assets)
 * window.RegionMap.draw(ctx, W, H, regions, selectedId, t)
 * window.RegionMap.hitTest(x, y, W, H, regions) -> regionId | null
 *
 * Regions expected (ids): agentcity, meadow, beach, city, forest, desert, (volcano optional)
 * Each region: {id,name,color,emoji,desc}
 */
(function () {
  'use strict';

  // ---- deterministic layout (normalized 0..1 coords over the island) ----
  // hand-tuned so areas form ONE connected painterly island.
  var LAYOUT = {
    agentcity: { cx: 0.50, cy: 0.47, r: 0.185, tone: '#2b3b6e', land: '#3a4d86', icon: 'hub' },
    meadow:    { cx: 0.27, cy: 0.27, r: 0.150, tone: '#4f8f3a', land: '#63a743', icon: 'meadow' },
    forest:    { cx: 0.20, cy: 0.62, r: 0.150, tone: '#1f5a34', land: '#276e40', icon: 'forest' },
    beach:     { cx: 0.74, cy: 0.74, r: 0.152, tone: '#c9a45c', land: '#e0c07a', icon: 'beach' },
    city:      { cx: 0.74, cy: 0.22, r: 0.150, tone: '#4a505f', land: '#5a6172', icon: 'city' },
    desert:    { cx: 0.81, cy: 0.49, r: 0.150, tone: '#b98a52', land: '#d5a566', icon: 'desert' },
    volcano:   { cx: 0.41, cy: 0.82, r: 0.130, tone: '#5a3030', land: '#6e3a3a', icon: 'volcano' }
  };

  // travel network: which areas connect by road/rail
  var ROADS = [
    ['agentcity', 'meadow'], ['agentcity', 'forest'], ['agentcity', 'city'],
    ['agentcity', 'desert'], ['agentcity', 'beach'], ['meadow', 'forest'],
    ['city', 'desert'], ['desert', 'beach'], ['forest', 'volcano'], ['agentcity', 'volcano']
  ];

  // ---- small deterministic PRNG for stable organic shapes ----
  function seeded(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return ((seed >>> 8) & 0xffffff) / 0xffffff;
    };
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) & 0xffffffff; } return h >>> 0; }

  function present(regions) {
    var map = {};
    for (var i = 0; i < regions.length; i++) map[regions[i].id] = regions[i];
    return map;
  }
  function px(n, W) { return n * W; }
  function py(n, H) { return n * H; }

  // organic blob path (cached point offsets via seed)
  function blobPoints(id, cx, cy, r, wobble) {
    var rnd = seeded(hashStr(id) + 7);
    var pts = [];
    var n = 14;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var rr = r * (1 - wobble + rnd() * wobble * 2);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return pts;
  }
  function tracePath(ctx, pts) {
    ctx.beginPath();
    var n = pts.length;
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (var i = 0; i < n; i++) {
      var cur = pts[i], next = pts[(i + 1) % n];
      var mx = (cur[0] + next[0]) / 2, my = (cur[1] + next[1]) / 2;
      ctx.quadraticCurveTo(cur[0], cur[1], mx, my);
    }
    ctx.closePath();
  }

  // union island silhouette from all present areas
  function drawIsland(ctx, W, H, ids, expand) {
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < ids.length; i++) {
      var L = LAYOUT[ids[i]]; if (!L) continue;
      var pts = blobPoints(ids[i], px(L.cx, W), py(L.cy, H), (L.r + expand) * W, 0.14);
      // add each as sub-path
      var n = pts.length;
      ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
      for (var j = 0; j < n; j++) {
        var cur = pts[j], next = pts[(j + 1) % n];
        ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2);
      }
      ctx.closePath();
    }
    ctx.restore();
  }

  // ---------- ICON PAINTERS (draw inside area at cx,cy in px, scale s=area radius px) ----------
  function iconHub(ctx, x, y, s, t) {
    // AGENT CITY = central neon-tech hub built AROUND a big DORMANT volcano.
    ctx.save();
    var pulse = 0.5 + 0.5 * Math.sin(t * 2);

    // --- ring of tech buildings around the volcano base ---
    var rnd = seeded(hashStr('agentcityblocks'));
    for (var b = 0; b < 10; b++) {
      var ba = (b / 10) * Math.PI * 2 + 0.3;
      var brd = s * (0.62 + rnd() * 0.2);
      var bx = x + Math.cos(ba) * brd, by = y + Math.sin(ba) * brd;
      var bw = s * 0.11, bh = s * (0.1 + rnd() * 0.12);
      ctx.fillStyle = 'rgba(30,44,74,0.95)';
      ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
      ctx.strokeStyle = 'rgba(0,255,156,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(bx - bw / 2, by - bh / 2, bw, bh);
    }

    // --- the DORMANT VOLCANO (large, central, cool-toned, no lava) ---
    var vg = ctx.createLinearGradient(x, y - s * 0.62, x, y + s * 0.5);
    vg.addColorStop(0, '#4a5678'); vg.addColorStop(0.55, '#2f3a5c'); vg.addColorStop(1, '#1c2440');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y + s * 0.45);
    ctx.lineTo(x - s * 0.2, y - s * 0.52);
    ctx.lineTo(x + s * 0.2, y - s * 0.52);
    ctx.lineTo(x + s * 0.6, y + s * 0.45);
    ctx.closePath();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    ctx.fill();
    ctx.restore();
    // ridge shading (left light / right dark)
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.2, y - s * 0.52); ctx.lineTo(x - s * 0.6, y + s * 0.45);
    ctx.lineTo(x - s * 0.3, y + s * 0.45); ctx.lineTo(x - s * 0.05, y - s * 0.5); ctx.closePath(); ctx.fill();
    // snow-ish / cool cap
    ctx.fillStyle = 'rgba(190,210,235,0.5)';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.2, y - s * 0.52); ctx.lineTo(x + s * 0.2, y - s * 0.52);
    ctx.lineTo(x + s * 0.12, y - s * 0.34); ctx.lineTo(x - s * 0.12, y - s * 0.34); ctx.closePath(); ctx.fill();

    // dormant crater (dark, faint teal energy pool — NOT lava)
    var cg = ctx.createRadialGradient(x, y - s * 0.5, 1, x, y - s * 0.5, s * 0.22);
    cg.addColorStop(0, 'rgba(0,255,156,' + (0.35 + pulse * 0.25) + ')');
    cg.addColorStop(0.5, 'rgba(10,60,60,0.9)');
    cg.addColorStop(1, 'rgba(6,20,30,1)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.5, s * 0.2, s * 0.085, 0, 0, Math.PI * 2); ctx.fill();

    // faint energy wisp rising from dormant crater
    ctx.globalAlpha = 0.3;
    for (var w = 0; w < 3; w++) {
      var wy = y - s * 0.55 - w * s * 0.16 - (t * 5 % (s * 0.16));
      ctx.fillStyle = 'rgba(0,255,156,' + (0.18 - w * 0.05) + ')';
      ctx.beginPath(); ctx.arc(x + Math.sin(t + w) * s * 0.05, wy, s * (0.05 + w * 0.02), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // --- neon hub energy rings orbiting the whole thing ---
    ctx.shadowColor = '#00ff9c';
    for (var ring = 0; ring < 3; ring++) {
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.1, s * (0.7 + ring * 0.16), s * (0.34 + ring * 0.08), 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,255,156,' + (0.4 - ring * 0.1) + ')';
      ctx.lineWidth = 1.5; ctx.shadowBlur = 6;
      ctx.stroke();
    }
    // orbiting data node
    var oa = t * 1.2;
    ctx.fillStyle = '#00ff9c'; ctx.shadowBlur = 12 + pulse * 8;
    ctx.beginPath();
    ctx.arc(x + Math.cos(oa) * s * 0.7, y + s * 0.1 + Math.sin(oa) * s * 0.34, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function iconVolcano(ctx, x, y, s, t) {
    ctx.save();
    // mountain cone
    var g = ctx.createLinearGradient(x, y - s * 0.5, x, y + s * 0.45);
    g.addColorStop(0, '#7a4038'); g.addColorStop(1, '#3a201c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y + s * 0.4);
    ctx.lineTo(x - s * 0.14, y - s * 0.42);
    ctx.lineTo(x + s * 0.14, y - s * 0.42);
    ctx.lineTo(x + s * 0.5, y + s * 0.4);
    ctx.closePath(); ctx.fill();
    // crater glow
    var glow = 0.6 + 0.4 * Math.sin(t * 3);
    ctx.fillStyle = 'rgba(255,120,40,' + (0.6 + glow * 0.3) + ')';
    ctx.shadowColor = '#ff5a1e'; ctx.shadowBlur = 14 + glow * 12;
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.4, s * 0.16, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // lava trails
    ctx.strokeStyle = 'rgba(255,90,30,0.7)'; ctx.lineWidth = 2.2; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x - s * 0.05, y - s * 0.38); ctx.quadraticCurveTo(x - s * 0.22, y, x - s * 0.28, y + s * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.05, y - s * 0.38); ctx.quadraticCurveTo(x + s * 0.2, y, x + s * 0.24, y + s * 0.28); ctx.stroke();
    // smoke
    ctx.shadowBlur = 0;
    for (var i = 0; i < 3; i++) {
      var yy = y - s * 0.5 - i * s * 0.18 - (t * 8 % (s * 0.18));
      ctx.fillStyle = 'rgba(180,170,170,' + (0.22 - i * 0.05) + ')';
      ctx.beginPath(); ctx.arc(x + Math.sin(t + i) * s * 0.06, yy, s * (0.08 + i * 0.03), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function iconMeadow(ctx, x, y, s) {
    ctx.save();
    // pond
    var g = ctx.createRadialGradient(x + s * 0.15, y + s * 0.2, 1, x + s * 0.15, y + s * 0.2, s * 0.3);
    g.addColorStop(0, '#7fd0ff'); g.addColorStop(1, '#3a86c8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x + s * 0.15, y + s * 0.2, s * 0.28, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    // flowers
    var cols = ['#ffd54a', '#ff7ab0', '#ffffff', '#ffb347'];
    var rnd = seeded(99);
    for (var i = 0; i < 10; i++) {
      var fx = x + (rnd() - 0.5) * s * 0.9, fy = y - s * 0.2 + (rnd() - 0.5) * s * 0.6;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.arc(fx, fy, s * 0.035, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function iconForest(ctx, x, y, s) {
    ctx.save();
    var rnd = seeded(hashStr('forest'));
    for (var i = 0; i < 9; i++) {
      var tx = x + (rnd() - 0.5) * s * 1.0, ty = y + (rnd() - 0.5) * s * 0.8;
      var ts = s * (0.16 + rnd() * 0.08);
      // trunk
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(tx - ts * 0.06, ty, ts * 0.12, ts * 0.4);
      // canopy
      ctx.fillStyle = i % 2 ? '#1e6b3a' : '#278a4a';
      ctx.beginPath();
      ctx.moveTo(tx, ty - ts); ctx.lineTo(tx - ts * 0.5, ty + ts * 0.1); ctx.lineTo(tx + ts * 0.5, ty + ts * 0.1); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx, ty - ts * 0.5); ctx.lineTo(tx - ts * 0.42, ty + ts * 0.25); ctx.lineTo(tx + ts * 0.42, ty + ts * 0.25); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function iconCity(ctx, x, y, s) {
    ctx.save();
    var rnd = seeded(hashStr('city'));
    for (var i = 0; i < 7; i++) {
      var bw = s * (0.12 + rnd() * 0.06);
      var bh = s * (0.25 + rnd() * 0.55);
      var bx = x - s * 0.6 + i * (s * 0.17);
      var by = y + s * 0.35 - bh;
      var shade = 150 + Math.floor(rnd() * 70);
      ctx.fillStyle = 'rgb(' + shade + ',' + (shade + 10) + ',' + (shade + 28) + ')';
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillRect(bx, by, bw, bh);
      ctx.restore();
      // windows
      ctx.fillStyle = 'rgba(255,224,130,0.85)';
      for (var wy = by + 4; wy < y + s * 0.3; wy += 7)
        for (var wx = bx + 3; wx < bx + bw - 3; wx += 6)
          if ((wx + wy) % 3 === 0) ctx.fillRect(wx, wy, 2, 3);
    }
    ctx.restore();
  }
  function iconBeach(ctx, x, y, s, t) {
    ctx.save();
    // palm
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 0.2, y + s * 0.4); ctx.quadraticCurveTo(x - s * 0.1, y - s * 0.1, x - s * 0.25, y - s * 0.35); ctx.stroke();
    ctx.fillStyle = '#2f9e5a';
    for (var a = 0; a < 5; a++) {
      var ang = -Math.PI / 2 + (a - 2) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.25, y - s * 0.35);
      ctx.quadraticCurveTo(x - s * 0.25 + Math.cos(ang) * s * 0.3, y - s * 0.35 + Math.sin(ang) * s * 0.3 - s * 0.05,
        x - s * 0.25 + Math.cos(ang) * s * 0.42, y - s * 0.35 + Math.sin(ang) * s * 0.42);
      ctx.lineWidth = s * 0.06; ctx.strokeStyle = '#2f9e5a'; ctx.stroke();
    }
    // waves
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    for (var w = 0; w < 3; w++) {
      ctx.beginPath();
      var wy = y + s * 0.2 + w * s * 0.12;
      for (var xx = -s * 0.5; xx <= s * 0.5; xx += 4)
        ctx.lineTo(x + xx, wy + Math.sin(xx * 0.1 + t * 2 + w) * 3);
      ctx.stroke();
    }
    ctx.restore();
  }
  function iconDesert(ctx, x, y, s) {
    ctx.save();
    // mesas
    var g = ctx.createLinearGradient(x, y - s * 0.3, x, y + s * 0.4);
    g.addColorStop(0, '#c98a4a'); g.addColorStop(1, '#8a5a2e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.45, y + s * 0.35); ctx.lineTo(x - s * 0.45, y - s * 0.05);
    ctx.lineTo(x - s * 0.15, y - s * 0.05); ctx.lineTo(x - s * 0.15, y + s * 0.35); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.05, y + s * 0.35); ctx.lineTo(x + s * 0.05, y - s * 0.28);
    ctx.lineTo(x + s * 0.4, y - s * 0.28); ctx.lineTo(x + s * 0.4, y + s * 0.35); ctx.closePath(); ctx.fill();
    // cactus
    ctx.strokeStyle = '#4e8a4a'; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 0.02, y + s * 0.35); ctx.lineTo(x - s * 0.02, y - s * 0.05);
    ctx.moveTo(x - s * 0.02, y + s * 0.1); ctx.lineTo(x - s * 0.12, y + s * 0.1); ctx.lineTo(x - s * 0.12, y - s * 0.02);
    ctx.moveTo(x - s * 0.02, y + s * 0.05); ctx.lineTo(x + s * 0.08, y + s * 0.05); ctx.lineTo(x + s * 0.08, y - s * 0.06); ctx.stroke();
    ctx.restore();
  }

  function drawIcon(ctx, id, icon, x, y, s, t) {
    switch (icon) {
      case 'hub': iconHub(ctx, x, y, s, t); break;
      case 'volcano': iconVolcano(ctx, x, y, s, t); break;
      case 'meadow': iconMeadow(ctx, x, y, s); break;
      case 'forest': iconForest(ctx, x, y, s); break;
      case 'city': iconCity(ctx, x, y, s); break;
      case 'beach': iconBeach(ctx, x, y, s, t); break;
      case 'desert': iconDesert(ctx, x, y, s); break;
    }
  }

  // ---------------- MAIN DRAW ----------------
  function draw(ctx, W, H, regions, selectedId, t) {
    t = t || 0;
    var byId = present(regions);
    var ids = [];
    for (var i = 0; i < regions.length; i++) if (LAYOUT[regions[i].id]) ids.push(regions[i].id);

    // ---- OCEAN ----
    var oc = ctx.createLinearGradient(0, 0, 0, H);
    oc.addColorStop(0, '#0a2540'); oc.addColorStop(0.5, '#0d3a5c'); oc.addColorStop(1, '#08263f');
    ctx.fillStyle = oc; ctx.fillRect(0, 0, W, H);
    // animated ocean shimmer bands
    ctx.save();
    ctx.globalAlpha = 0.06; ctx.strokeStyle = '#9fd4ff'; ctx.lineWidth = 2;
    for (var b = 0; b < H; b += 26) {
      ctx.beginPath();
      for (var xx = 0; xx <= W; xx += 18)
        ctx.lineTo(xx, b + Math.sin(xx * 0.02 + t * 1.2 + b) * 5);
      ctx.stroke();
    }
    ctx.restore();

    // ---- ISLAND: soft outer glow / foam rings ----
    ctx.save();
    for (var ring = 3; ring >= 1; ring--) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#bfe6ff';
      ctx.beginPath();
      buildIslandPath(ctx, W, H, ids, 0.028 * ring + 0.01);
      ctx.fill();
    }
    ctx.restore();

    // island drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.beginPath(); buildIslandPath(ctx, W, H, ids, 0.008);
    ctx.fillStyle = '#2a5a3a'; ctx.fill();
    ctx.restore();

    // base land (sandy coast)
    ctx.beginPath(); buildIslandPath(ctx, W, H, ids, 0.012);
    ctx.fillStyle = '#d8c48a'; ctx.fill();

    // ---- clip to island for area painting ----
    ctx.save();
    ctx.beginPath(); buildIslandPath(ctx, W, H, ids, 0.002);
    ctx.clip();

    // green base
    var lg = ctx.createRadialGradient(W * 0.5, H * 0.45, 10, W * 0.5, H * 0.5, W * 0.6);
    lg.addColorStop(0, '#4a7a3e'); lg.addColorStop(1, '#3a6634');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);

    // ---- each AREA as a colored zone ----
    for (var k = 0; k < ids.length; k++) {
      var id = ids[k], L = LAYOUT[id];
      var cx = px(L.cx, W), cy = py(L.cy, H), rr = L.r * W;
      var pts = blobPoints(id, cx, cy, rr, 0.13);
      tracePath(ctx, pts);
      var zg = ctx.createRadialGradient(cx, cy - rr * 0.2, rr * 0.1, cx, cy, rr * 1.05);
      zg.addColorStop(0, lighten(L.land, 18));
      zg.addColorStop(1, L.land);
      ctx.fillStyle = zg;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.fill();
      ctx.restore();
      // subtle inner texture rim
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2; ctx.stroke();
    }

    // ---- ROADS / RAIL (travel network) ----
    for (var rI = 0; rI < ROADS.length; rI++) {
      var a = LAYOUT[ROADS[rI][0]], c = LAYOUT[ROADS[rI][1]];
      if (!byId[ROADS[rI][0]] || !byId[ROADS[rI][1]]) continue;
      var ax = px(a.cx, W), ay = py(a.cy, H), bx = px(c.cx, W), by = py(c.cy, H);
      var mx = (ax + bx) / 2 + (ay - by) * 0.12, my = (ay + by) / 2 + (bx - ax) * 0.12;
      // road bed
      ctx.strokeStyle = 'rgba(40,30,20,0.35)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
      ctx.strokeStyle = 'rgba(235,215,160,0.85)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
      // dashes (rail feel) + travel pulse
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
      ctx.setLineDash([2, 8]); ctx.lineDashOffset = -(t * 40 % 10);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
      ctx.restore();
    }

    // ---- ICONS per area ----
    for (var m = 0; m < ids.length; m++) {
      var id2 = ids[m], L2 = LAYOUT[id2];
      drawIcon(ctx, id2, L2.icon, px(L2.cx, W), py(L2.cy, H), L2.r * W, t);
      // 2026-11-22 gated realms: locked areas sit under a dusk veil with a lock;
      // completed areas carry a gold check. Flags come from the caller
      // (reg.locked / reg.done, set from RealmProgress).
      var rg2 = byId[id2];
      if (rg2 && (rg2.locked || rg2.done)) {
        var ix = px(L2.cx, W), iy = py(L2.cy, H), ir = L2.r * W;
        if (rg2.locked) {
          ctx.save();
          ctx.beginPath(); ctx.arc(ix, iy, ir * 0.98, 0, Math.PI * 2); ctx.clip();
          ctx.fillStyle = 'rgba(6,8,18,0.55)'; ctx.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);
          ctx.restore();
          ctx.font = Math.round(ir * 0.62) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🔒', ix, iy);
        } else {
          ctx.save();
          ctx.beginPath(); ctx.arc(ix + ir * 0.52, iy - ir * 0.52, ir * 0.2, 0, Math.PI * 2);
          ctx.fillStyle = '#d99b1c'; ctx.fill();
          ctx.strokeStyle = '#ffd45c'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#1a1206'; ctx.font = 'bold ' + Math.round(ir * 0.26) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', ix + ir * 0.52, iy - ir * 0.52 + 1);
          ctx.restore();
        }
      }
    }

    ctx.restore(); // unclip

    // ---- SELECTED highlight outline (drawn over everything, unclipped) ----
    if (selectedId && LAYOUT[selectedId] && byId[selectedId]) {
      var SL = LAYOUT[selectedId];
      var scx = px(SL.cx, W), scy = py(SL.cy, H), srr = SL.r * W;
      var spts = blobPoints(selectedId, scx, scy, srr, 0.13);
      var pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save();
      tracePath(ctx, spts);
      ctx.strokeStyle = 'rgba(0,255,156,' + (0.7 + pulse * 0.3) + ')';
      ctx.lineWidth = 4 + pulse * 2;
      ctx.shadowColor = '#00ff9c'; ctx.shadowBlur = 20 + pulse * 14;
      ctx.stroke();
      // second glow ring
      tracePath(ctx, blobPoints(selectedId, scx, scy, srr * 1.06, 0.13));
      ctx.strokeStyle = 'rgba(0,255,156,0.25)'; ctx.lineWidth = 2; ctx.shadowBlur = 8; ctx.stroke();
      ctx.restore();
    }

    // ---- LABELS ----
    for (var q = 0; q < ids.length; q++) {
      var rid = ids[q], LL = LAYOUT[rid], reg = byId[rid];
      var lx = px(LL.cx, W), ly = py(LL.cy, H) + LL.r * W * 0.78;
      var sel = rid === selectedId;
      drawLabel(ctx, reg, lx, ly, sel, t);
    }

    // ---- compass rose ----
    drawCompass(ctx, W - 62, H - 62, 34, t);
  }

  function drawLabel(ctx, reg, x, y, selected, t) {
    ctx.save();
    ctx.font = (selected ? 'bold ' : '') + (selected ? 16 : 13) + 'px "Segoe UI", system-ui, sans-serif';
    var label = (reg.locked ? '🔒 ' : (reg.done ? '✓ ' : '')) + (reg.emoji ? reg.emoji + '  ' : '') + reg.name;
    var w = ctx.measureText(label).width + 20;
    var h = selected ? 26 : 22;
    // callout bubble
    ctx.globalAlpha = selected ? 1 : 0.82;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    var bg = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    if (selected) { bg.addColorStop(0, 'rgba(6,20,16,0.96)'); bg.addColorStop(1, 'rgba(4,30,22,0.96)'); }
    else { bg.addColorStop(0, 'rgba(8,14,22,0.7)'); bg.addColorStop(1, 'rgba(6,12,20,0.7)'); }
    ctx.fillStyle = bg;
    if (selected) { ctx.shadowColor = '#00ff9c'; ctx.shadowBlur = 16; }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = selected ? 'rgba(0,255,156,0.9)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = selected ? 2 : 1; ctx.stroke();
    // text
    ctx.fillStyle = selected ? '#eafff6' : 'rgba(230,240,245,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
    // little pointer up to area
    ctx.beginPath();
    ctx.moveTo(x - 6, y - h / 2); ctx.lineTo(x + 6, y - h / 2); ctx.lineTo(x, y - h / 2 - 7); ctx.closePath();
    ctx.fillStyle = selected ? 'rgba(4,30,22,0.96)' : 'rgba(6,12,20,0.7)';
    ctx.fill();
    ctx.restore();
  }

  function drawCompass(ctx, x, y, r, t) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,20,30,0.6)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,255,156,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.translate(x, y);
    // needle
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7); ctx.lineTo(r * 0.18, 0); ctx.lineTo(0, r * 0.7); ctx.lineTo(-r * 0.18, 0); ctx.closePath();
    var ng = ctx.createLinearGradient(0, -r, 0, r);
    ng.addColorStop(0, '#ff5a5a'); ng.addColorStop(0.5, '#ff5a5a'); ng.addColorStop(0.5, '#e8eef5'); ng.addColorStop(1, '#e8eef5');
    ctx.fillStyle = ng; ctx.fill();
    ctx.fillStyle = '#00ff9c'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -r * 0.82);
    ctx.restore();
  }

  // ---- helpers ----
  function buildIslandPath(ctx, W, H, ids, expand) {
    for (var i = 0; i < ids.length; i++) {
      var L = LAYOUT[ids[i]]; if (!L) continue;
      var pts = blobPoints(ids[i], px(L.cx, W), py(L.cy, H), (L.r + expand) * W, 0.14);
      var n = pts.length;
      ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
      for (var j = 0; j < n; j++) {
        var cur = pts[j], next = pts[(j + 1) % n];
        ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2);
      }
      ctx.closePath();
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function lighten(hex, amt) {
    var c = hex.replace('#', '');
    var n = parseInt(c, 16);
    var r = Math.min(255, ((n >> 16) & 255) + amt);
    var g = Math.min(255, ((n >> 8) & 255) + amt);
    var b = Math.min(255, (n & 255) + amt);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ---------------- HIT TEST ----------------
  function hitTest(x, y, W, H, regions) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < regions.length; i++) {
      var id = regions[i].id, L = LAYOUT[id]; if (!L) continue;
      var cx = px(L.cx, W), cy = py(L.cy, H), rr = L.r * W;
      var d = Math.hypot(x - cx, y - cy);
      if (d <= rr * 1.02 && d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  window.RegionMap = { draw: draw, hitTest: hitTest, LAYOUT: LAYOUT };
})();
