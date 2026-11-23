/* terrain.js — SHADDAI iso ground renderer (Canvas 2D, code-only, $0)
 * TURTLE / environment art.
 *
 * window.Terrain.tile(ctx, regionId, type, sx, sy, col, row, time)
 *   Draws ONE 2:1 iso diamond tile centered at (sx,sy).
 *   TW=84 TH=42  (half-width 42, half-height 21). Single upper-left light.
 *   col,row  -> deterministic texture variation (no per-frame randomness).
 *   time     -> ms, used only for animated water/lava shimmer.
 *
 * type in: grass water sand path dock lava concrete tron
 */
(function () {
  'use strict';

  var HW = 42, HH = 21; // half width / half height of the 2:1 diamond

  // ---- deterministic hash helpers (no Math.random anywhere) ----
  function hash2(c, r, salt) {
    // integer hash -> [0,1)
    var n = (c * 374761393 + r * 668265263 + (salt | 0) * 2246822519) | 0;
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177) | 0;
    n = (n ^ (n >>> 16)) >>> 0;
    return n / 4294967296;
  }
  function pick(c, r, salt, n) { return Math.floor(hash2(c, r, salt) * n); }

  function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
  function shade(hex, amt) {
    // amt in [-1,1]; lighten (+) / darken (-)
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r += r * amt; g += g * amt; b += b * amt; }
    return 'rgb(' + clampByte(r) + ',' + clampByte(g) + ',' + clampByte(b) + ')';
  }
  function rgba(hex, a) {
    if (typeof hex === 'string' && hex.indexOf('rgb') === 0) {
      var n = hex.replace(/rgba?\(|\)/g, '').split(',');
      return 'rgba(' + (parseInt(n[0], 10) || 0) + ',' + (parseInt(n[1], 10) || 0) + ',' + (parseInt(n[2], 10) || 0) + ',' + a + ')';
    }
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }

  // ---- geometry ----
  function diamondPath(ctx, sx, sy) {
    ctx.beginPath();
    ctx.moveTo(sx, sy - HH);      // top
    ctx.lineTo(sx + HW, sy);      // right
    ctx.lineTo(sx, sy + HH);      // bottom
    ctx.lineTo(sx - HW, sy);      // left
    ctx.closePath();
  }
  function clipTile(ctx, sx, sy) { diamondPath(ctx, sx, sy); ctx.clip(); }

  // A vertical top-face gradient: light at top vertex -> dark at bottom vertex.
  function topGradient(ctx, sx, sy, hex, topAmt, botAmt) {
    var g = ctx.createLinearGradient(sx, sy - HH, sx, sy + HH);
    g.addColorStop(0, shade(hex, topAmt));
    g.addColorStop(0.5, hex);
    g.addColorStop(1, shade(hex, botAmt));
    return g;
  }

  // Base fill + subtle top gradient. Returns nothing; leaves path consumed.
  function baseFill(ctx, sx, sy, hex, topAmt, botAmt) {
    diamondPath(ctx, sx, sy);
    ctx.fillStyle = topGradient(ctx, sx, sy, hex, topAmt == null ? 0.16 : topAmt, botAmt == null ? -0.28 : botAmt);
    ctx.fill();
  }

  // Thin inner AO edge (darker lower-right, faint light upper-left rim).
  function aoEdge(ctx, sx, sy, darkHex) {
    ctx.save();
    // lower-right darkening
    ctx.beginPath();
    ctx.moveTo(sx + HW, sy);
    ctx.lineTo(sx, sy + HH);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(darkHex || '#000000', 0.32);
    ctx.stroke();
    // upper-left light rim
    ctx.beginPath();
    ctx.moveTo(sx - HW, sy);
    ctx.lineTo(sx, sy - HH);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    ctx.restore();
  }

  // Scatter deterministic specks inside the tile (already clipped).
  // colors: array of hex; count via density.
  function specks(ctx, sx, sy, c, r, salt, count, colors, sizeMin, sizeMax) {
    for (var i = 0; i < count; i++) {
      var hx = hash2(c, r, salt + i * 3);
      var hy = hash2(c, r, salt + i * 3 + 1);
      // map a unit square into the diamond via (u,v) barycentric-ish: keep inside
      var u = hx * 2 - 1, v = hy * 2 - 1;
      if (Math.abs(u) + Math.abs(v) > 0.94) continue; // skip near edges
      var px = sx + u * HW * 0.5 + v * HW * 0.5;
      var py = sy + (v - u) * HH * 0.5;
      var col = colors[pick(c, r, salt + i * 3 + 2, colors.length)];
      var sz = sizeMin + hash2(c, r, salt + i * 3 + 5) * (sizeMax - sizeMin);
      ctx.fillStyle = col;
      ctx.fillRect(px, py, sz, sz);
    }
  }

  // Soft radial color blobs (mottling). colorHexArr = plain hex strings.
  function softBlobs(ctx, sx, sy, c, r, salt, count, colorHexArr, alpha) {
    for (var i = 0; i < count; i++) {
      var bx = sx + (hash2(c, r, salt + i * 4) * 2 - 1) * HW * 0.62;
      var by = sy + (hash2(c, r, salt + i * 4 + 1) * 2 - 1) * HH * 0.62;
      var rad = 7 + hash2(c, r, salt + i * 4 + 2) * 12;
      var col = colorHexArr[i % colorHexArr.length];
      var gg = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
      gg.addColorStop(0, hexToRgba(col, alpha));
      gg.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
    }
  }
  // Accept either '#rrggbb' or 'rgb(r,g,b)' and apply alpha.
  function hexToRgba(col, a) {
    if (col.charAt(0) === '#') return rgba(col, a);
    // rgb(r,g,b)
    var m = col.match(/\d+/g);
    return 'rgba(' + m[0] + ',' + m[1] + ',' + m[2] + ',' + a + ')';
  }

  // ================= REGION PALETTES =================
  // Each region defines colors per ground type.
  var REGIONS = {
    agentcity: { grass: '#0a0e1a', sand: '#12161f', path: '#070a12', concrete: '#0c1018', water: '#04121a', accent: '#00f0ff' },
    meadow:    { grass: '#3f9b3a', sand: '#e4d08a', path: '#7a6a4a', concrete: '#8f8f8f', water: '#2f8fe0' },
    beach:     { grass: '#6faa4a', sand: '#e8d59a', path: '#c9b47e', concrete: '#9a9a9a', water: '#28c2c0' },
    city:      { grass: '#5a7d4a', sand: '#c9bd93', path: '#3a3d42', concrete: '#8a8d92', water: '#3a6fa0' },
    forest:    { grass: '#1f5f28', sand: '#b9a86a', path: '#4a3c26', concrete: '#7a7d70', water: '#256b6b' },
    desert:    { grass: '#c9a95e', sand: '#dcb867', path: '#b89550', concrete: '#b0a080', water: '#4a9ec0' },
    volcano:   { grass: '#241f22', sand: '#3a2f2a', path: '#1a1518', concrete: '#2a2528', water: '#5a2410', lava: '#ff6a12' }
  };
  function regionOf(id) { return REGIONS[id] || REGIONS.meadow; }

  // ================= GROUND STYLES =================

  // Deterministic checkerboard tint (0/1) so a field of tiles alternates subtly.
  function checker(c, r) { return ((c + r) & 1); }

  // A few short grass-blade ticks pointing up (cheap, deterministic).
  function bladeTicks(ctx, sx, sy, c, r, salt, count, spread, light, dark, alpha) {
    ctx.lineWidth = 1;
    for (var b = 0; b < count; b++) {
      var hx = hash2(c, r, salt + b * 2);
      var hy = hash2(c, r, salt + b * 2 + 1);
      var u = hx * 2 - 1, v = hy * 2 - 1;
      if (Math.abs(u) + Math.abs(v) > 0.86) continue;
      var bx = sx + u * HW * spread;
      var by = sy + v * HH * spread;
      var len = 2 + hash2(c, r, salt + b * 2 + 400) * 3;
      var lean = (hash2(c, r, salt + b * 2 + 800) - 0.5) * 2.2;
      // dark base blade then light tip => reads as a little tuft
      ctx.strokeStyle = rgba(dark, alpha);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + lean, by - len); ctx.stroke();
      ctx.strokeStyle = rgba(light, alpha * 0.7);
      ctx.beginPath(); ctx.moveTo(bx + lean * 0.6, by - len * 0.55); ctx.lineTo(bx + lean, by - len); ctx.stroke();
    }
  }

  function grass(ctx, R, id, sx, sy, c, r, time) {
    var base = R.grass;
    // per-region tone identity: forest cooler/darker, city duller, meadow lush
    var checkAmt = checker(c, r) ? 0.05 : -0.05;
    var toneBase = shade(base, checkAmt);
    baseFill(ctx, sx, sy, toneBase, 0.18, -0.30);
    ctx.save(); clipTile(ctx, sx, sy);

    if (id === 'forest') {
      // deep rich green + darker undergrowth mottling (big soft dark blobs)
      for (var m = 0; m < 5; m++) {
        var mx = sx + (hash2(c, r, 40 + m) * 2 - 1) * HW * 0.7;
        var my = sy + (hash2(c, r, 60 + m) * 2 - 1) * HH * 0.7;
        var rad = 6 + hash2(c, r, 80 + m) * 10;
        var gg = ctx.createRadialGradient(mx, my, 0, mx, my, rad);
        gg.addColorStop(0, rgba('#0d3d16', 0.55));
        gg.addColorStop(1, rgba('#0d3d16', 0));
        ctx.fillStyle = gg;
        ctx.fillRect(mx - rad, my - rad, rad * 2, rad * 2);
      }
      // bluer-green forest floor mottle + moss + dead leaves
      specks(ctx, sx, sy, c, r, 3, 30, [shade(base, 0.22), shade(base, -0.34), '#2e7d33', '#0e4a1c', '#6b5a2a'], 1, 2.4);
      bladeTicks(ctx, sx, sy, c, r, 900, 8, 0.62, '#6fbf5a', '#0e3a18', 0.5);
      // occasional fallen twig / mushroom fleck
      if (pick(c, r, 220, 4) === 0) {
        var tx = sx + (hash2(c, r, 221) * 2 - 1) * HW * 0.5;
        var ty = sy + (hash2(c, r, 222) * 2 - 1) * HH * 0.5;
        ctx.fillStyle = rgba('#4a3418', 0.7); ctx.fillRect(tx, ty, 4, 1);
      }
    } else if (id === 'meadow' || id === 'beach') {
      // soft patchy tone variation so the field isn't a flat green
      softBlobs(ctx, sx, sy, c, r, 500, 4, [shade(base, 0.24), shade(base, -0.26), '#8fd06a'], 0.30);
      // lush blades: many small light/dark specks
      specks(ctx, sx, sy, c, r, 3, 40,
        [shade(base, 0.30), shade(base, 0.12), shade(base, -0.20), shade(base, -0.34), '#a6e06a'], 1, 2.4);
      // upward grass-blade ticks (the field reads as real grass)
      bladeTicks(ctx, sx, sy, c, r, 900, 12, 0.66, '#e6ffcf', '#2f7d33', 0.5);
      // occasional flower or pebble speck (deterministic)
      var deco = pick(c, r, 200, 6);
      if (deco === 0) {
        var fx = sx + (hash2(c, r, 210) * 2 - 1) * HW * 0.5;
        var fy = sy + (hash2(c, r, 211) * 2 - 1) * HH * 0.5;
        var petalPick = pick(c, r, 212, 3);
        var petal = petalPick === 0 ? '#ffe14d' : petalPick === 1 ? '#ffffff' : '#ff8fb0';
        ctx.fillStyle = petal; ctx.fillRect(fx - 1, fy, 2, 2); ctx.fillRect(fx, fy - 1, 2, 2); ctx.fillRect(fx + 1, fy, 1, 1);
        ctx.fillStyle = '#d99a10'; ctx.fillRect(fx, fy, 1, 1);
      } else if (deco === 1) {
        var px = sx + (hash2(c, r, 214) * 2 - 1) * HW * 0.55;
        var py = sy + (hash2(c, r, 215) * 2 - 1) * HH * 0.55;
        ctx.fillStyle = rgba('#9a9488', 0.8); ctx.fillRect(px, py, 2, 2);
        ctx.fillStyle = rgba('#ffffff', 0.3); ctx.fillRect(px, py, 1, 1);
      }
    } else if (id === 'city') {
      // scrubby lot grass with concrete-dust hint, patchy & duller
      specks(ctx, sx, sy, c, r, 3, 24, [shade(base, 0.14), shade(base, -0.25), '#6b8a3a', '#4a5d30', '#8f8d80'], 1, 2.2);
      bladeTicks(ctx, sx, sy, c, r, 900, 6, 0.6, '#b8c78a', '#3a4a24', 0.4);
      // occasional bare-dirt / concrete patch
      if (pick(c, r, 230, 3) === 0) {
        softBlobs(ctx, sx, sy, c, r, 232, 1, ['#7c766a'], 0.22);
      }
    } else {
      // desert / volcano "grass" = dry tuft / generic
      specks(ctx, sx, sy, c, r, 3, 22, [shade(base, 0.16), shade(base, -0.22)], 1, 2.2);
      bladeTicks(ctx, sx, sy, c, r, 900, 5, 0.6, shade(base, 0.3), shade(base, -0.3), 0.4);
    }
    ctx.restore();
    aoEdge(ctx, sx, sy, shade(base, -0.6));
  }

  function sand(ctx, R, id, sx, sy, c, r, time) {
    var base = R.sand;
    var checkAmt = checker(c, r) ? 0.03 : -0.03;
    baseFill(ctx, sx, sy, shade(base, checkAmt), 0.16, -0.24);
    ctx.save(); clipTile(ctx, sx, sy);
    // ripple bands: paired dark trough + light crest running along one diagonal
    var off = pick(c, r, 5, 4);
    for (var i = -2; i < 4; i++) {
      var yy = sy - HH + (i * 6 + off * 2);
      // dark trough
      ctx.strokeStyle = rgba(shade(base, -0.28), 0.45);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - HW, yy + 5);
      ctx.quadraticCurveTo(sx, yy, sx + HW, yy + 5);
      ctx.stroke();
      // light crest just above it
      ctx.strokeStyle = rgba(shade(base, 0.24), 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - HW, yy + 3);
      ctx.quadraticCurveTo(sx, yy - 2, sx + HW, yy + 3);
      ctx.stroke();
    }
    // beach sand gets a wetter/darker gradient toward the lower (waterward) edge
    if (id === 'beach') {
      var wet = ctx.createLinearGradient(sx, sy, sx, sy + HH);
      wet.addColorStop(0, rgba('#000000', 0));
      wet.addColorStop(1, rgba('#3a5a55', 0.22));
      ctx.fillStyle = wet; ctx.fillRect(sx - HW, sy - HH, HW * 2, HH * 2);
      // a few tiny shell / pebble flecks
      if (pick(c, r, 18, 3) === 0) {
        var shx = sx + (hash2(c, r, 19) * 2 - 1) * HW * 0.5;
        var shy = sy + (hash2(c, r, 20) * 2 - 1) * HH * 0.5;
        ctx.fillStyle = rgba('#fff4e0', 0.85); ctx.fillRect(shx, shy, 2, 1);
      }
    }
    if (id === 'desert') {
      // dune banding: broad light/dark horizontal bands + cracks
      var bandTop = ctx.createLinearGradient(sx, sy - HH, sx, sy + HH);
      bandTop.addColorStop(0, rgba('#fff0c0', 0.18));
      bandTop.addColorStop(0.5, rgba('#000000', 0));
      bandTop.addColorStop(1, rgba('#7a5a20', 0.22));
      ctx.fillStyle = bandTop; ctx.fillRect(sx - HW, sy - HH, HW * 2, HH * 2);
      // cracks
      if (pick(c, r, 7, 3) === 0) {
        ctx.strokeStyle = rgba('#6a4a18', 0.5); ctx.lineWidth = 1;
        var cx = sx + (hash2(c, r, 8) - 0.5) * HW, cy = sy + (hash2(c, r, 9) - 0.5) * HH;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (hash2(c, r, 10) - 0.5) * 20, cy + (hash2(c, r, 11) - 0.5) * 10);
        ctx.lineTo(cx + (hash2(c, r, 12) - 0.5) * 30, cy + (hash2(c, r, 13) - 0.5) * 16);
        ctx.stroke();
      }
    }
    specks(ctx, sx, sy, c, r, 14, 30, [shade(base, 0.18), shade(base, -0.16), shade(base, -0.06), '#fff6d8'], 1, 1.8);
    ctx.restore();
    aoEdge(ctx, sx, sy, shade(base, -0.5));
  }

  function water(ctx, R, id, sx, sy, c, r, time) {
    var base = R.water;
    // deep base with vertical gradient
    baseFill(ctx, sx, sy, base, 0.10, -0.4);
    ctx.save(); clipTile(ctx, sx, sy);

    // depth: darker core, lighter rim (radial toward center = deeper)
    var dg = ctx.createRadialGradient(sx, sy, 0, sx, sy, HW * 0.9);
    dg.addColorStop(0, rgba(shade(base, -0.35), 0.55));
    dg.addColorStop(0.65, rgba(shade(base, -0.1), 0.15));
    dg.addColorStop(1, rgba(shade(base, 0.35), 0.30));
    ctx.fillStyle = dg; ctx.fillRect(sx - HW, sy - HH, HW * 2, HH * 2);

    // animated shimmer via time
    var t = (time || 0) * 0.001;
    var phase = t + (c * 0.7 + r * 1.3);

    // moving highlight band
    var hy = sy + Math.sin(phase) * HH * 0.5;
    var hg = ctx.createLinearGradient(sx, hy - 8, sx, hy + 8);
    hg.addColorStop(0, rgba('#ffffff', 0));
    hg.addColorStop(0.5, rgba('#ffffff', id === 'agentcity' ? 0.10 : 0.22));
    hg.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = hg; ctx.fillRect(sx - HW, sy - HH, HW * 2, HH * 2);

    // foam ripples: bright arcs that drift (beach = bright cyan-white)
    var foam = (id === 'agentcity') ? rgba(R.accent, 0.5)
             : (id === 'beach')    ? 'rgba(210,255,255,0.65)'
             : 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = foam; ctx.lineWidth = 1;
    for (var i = 0; i < 3; i++) {
      var drift = ((phase * 6 + i * 12) % 30) - 6;
      var yy = sy - HH + 8 + i * 10 + Math.sin(phase + i) * 2;
      var xx = sx - HW * 0.4 + drift;
      ctx.beginPath();
      ctx.moveTo(xx - 8, yy);
      ctx.quadraticCurveTo(xx, yy - 3, xx + 8, yy);
      ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(phase + i));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // sparkle glints (deterministic position, time-blinked) — plus/star shape
    for (var s = 0; s < 5; s++) {
      var sxp = sx + (hash2(c, r, 300 + s) * 2 - 1) * HW * 0.6;
      var syp = sy + (hash2(c, r, 320 + s) * 2 - 1) * HH * 0.6;
      var blink = 0.5 + 0.5 * Math.sin(phase * 2 + s * 1.7);
      if (blink < 0.55) continue; // most of the time off => twinkles
      var ga = 0.2 + blink * 0.6;
      ctx.fillStyle = rgba(id === 'agentcity' ? R.accent : '#ffffff', ga);
      ctx.fillRect(sxp, syp, 1.5, 1.5);
      if (blink > 0.85) { ctx.fillRect(sxp - 1, syp + 0.25, 3.5, 0.7); ctx.fillRect(sxp + 0.25, syp - 1, 0.7, 3.5); }
    }

    // lighter foam-ish rim hugging the diamond edge
    ctx.strokeStyle = (id === 'agentcity') ? rgba(R.accent, 0.30)
                    : (id === 'beach')    ? 'rgba(220,255,255,0.35)'
                    : 'rgba(200,230,255,0.22)';
    ctx.lineWidth = 1.5;
    diamondPath(ctx, sx, sy); ctx.stroke();

    ctx.restore();
    aoEdge(ctx, sx, sy, shade(base, -0.5));
  }

  function pathTile(ctx, R, id, sx, sy, c, r, time) {
    var base = R.path;
    baseFill(ctx, sx, sy, base, 0.12, -0.26);
    ctx.save(); clipTile(ctx, sx, sy);

    if (id === 'agentcity') {
      // dark path with a neon seam down the middle
      ctx.strokeStyle = rgba(R.accent, 0.6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx - HW, sy); ctx.lineTo(sx + HW, sy); ctx.stroke();
      ctx.strokeStyle = rgba(R.accent, 0.18); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx - HW, sy); ctx.lineTo(sx + HW, sy); ctx.stroke();
    } else if (id === 'city') {
      // grey asphalt: fine tarmac grit + faint dashed yellow centerline
      specks(ctx, sx, sy, c, r, 44, 32, ['#2b2e33', '#4a4d52', '#55585d', '#3a3d42'], 1, 1.6);
      // subtle oil-stain patch
      if (pick(c, r, 49, 3) === 0) softBlobs(ctx, sx, sy, c, r, 50, 1, ['#181a1e'], 0.30);
      ctx.strokeStyle = 'rgba(230,210,120,0.5)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(sx - HW * 0.6, sy + HH * 0.3); ctx.lineTo(sx + HW * 0.6, sy - HH * 0.3); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // packed dirt / cobble road — warmer, with cobble cells + wheel ruts
      specks(ctx, sx, sy, c, r, 44, 24, [shade(base, 0.14), shade(base, -0.2), shade(base, -0.32)], 1, 2.2);
      // faint cobble cells: short seams along both iso axes (deterministic grid)
      ctx.strokeStyle = rgba(shade(base, -0.42), 0.35); ctx.lineWidth = 1;
      for (var k = -1; k <= 1; k++) {
        var oy = k * 8 + (pick(c, r, 51, 3) - 1) * 2;
        ctx.beginPath();
        ctx.moveTo(sx - HW * 0.7, sy + oy);
        ctx.lineTo(sx, sy + oy - HH * 0.35);
        ctx.lineTo(sx + HW * 0.7, sy + oy);
        ctx.stroke();
      }
      // two wheel-rut lines running across the tile (slightly darker, worn)
      ctx.strokeStyle = rgba(shade(base, -0.3), 0.4); ctx.lineWidth = 1.4;
      for (var w = -1; w <= 1; w += 2) {
        var ry = sy + w * HH * 0.28;
        ctx.beginPath();
        ctx.moveTo(sx - HW, ry - w * 2);
        ctx.quadraticCurveTo(sx, ry, sx + HW, ry - w * 2);
        ctx.stroke();
      }
      // occasional pebble / footprint
      if (pick(c, r, 46, 2) === 0) {
        ctx.fillStyle = rgba(shade(base, -0.4), 0.6);
        var px = sx + (hash2(c, r, 47) - 0.5) * HW, py = sy + (hash2(c, r, 48) - 0.5) * HH;
        ctx.fillRect(px, py, 2, 2);
        ctx.fillStyle = rgba(shade(base, 0.3), 0.4); ctx.fillRect(px, py, 1, 1);
      }
    }
    // darker edges so roads read as roads (inner border)
    ctx.strokeStyle = rgba(shade(base, -0.5), 0.35); ctx.lineWidth = 3;
    diamondPath(ctx, sx, sy); ctx.stroke();
    ctx.restore();
    aoEdge(ctx, sx, sy, shade(base, -0.55));
  }

  function dock(ctx, R, id, sx, sy, c, r, time) {
    var wood = id === 'agentcity' ? '#20303a' : '#7a5a34';
    baseFill(ctx, sx, sy, wood, 0.12, -0.3);
    ctx.save(); clipTile(ctx, sx, sy);
    // alternating plank boards along one iso axis (light face + dark seam)
    for (var i = -3; i <= 3; i++) {
      var ox = i * 12;
      var boardTint = (i & 1) ? 0.08 : -0.06;
      // board face
      ctx.strokeStyle = rgba(shade(wood, boardTint), 0.5); ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(sx - HW + ox * 0.5, sy - HH + Math.abs(ox) * 0.2);
      ctx.lineTo(sx + ox * 0.5, sy + HH);
      ctx.stroke();
    }
    // dark seams between boards
    ctx.strokeStyle = rgba(shade(wood, -0.45), 0.75); ctx.lineWidth = 1.3;
    for (var j = -3; j <= 3; j++) {
      var sxo = j * 12 + 6;
      ctx.beginPath();
      ctx.moveTo(sx - HW + sxo * 0.5, sy - HH + Math.abs(sxo) * 0.2);
      ctx.lineTo(sx + sxo * 0.5, sy + HH);
      ctx.stroke();
    }
    // wood grain speckle
    specks(ctx, sx, sy, c, r, 55, 18, [shade(wood, 0.14), shade(wood, -0.24), shade(wood, -0.1)], 1, 1.8);
    // nail heads at board ends
    ctx.fillStyle = rgba('#1a120a', 0.55);
    ctx.fillRect(sx - HW * 0.5, sy - HH * 0.2, 1.5, 1.5);
    ctx.fillRect(sx + HW * 0.4, sy + HH * 0.2, 1.5, 1.5);
    ctx.fillRect(sx - HW * 0.1, sy + HH * 0.35, 1.5, 1.5);
    if (id === 'agentcity') {
      ctx.strokeStyle = rgba(R.accent, 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx - HW, sy); ctx.lineTo(sx, sy - HH); ctx.stroke();
    }
    ctx.restore();
    aoEdge(ctx, sx, sy, shade(wood, -0.55));
  }

  function concrete(ctx, R, id, sx, sy, c, r, time) {
    var base = R.concrete;
    baseFill(ctx, sx, sy, base, 0.1, -0.24);
    ctx.save(); clipTile(ctx, sx, sy);
    // panel seams: cross through center along both diagonals sometimes
    ctx.strokeStyle = rgba(shade(base, -0.4), 0.55); ctx.lineWidth = 1;
    if (pick(c, r, 60, 2) === 0) {
      ctx.beginPath(); ctx.moveTo(sx - HW, sy); ctx.lineTo(sx + HW, sy); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(sx, sy - HH); ctx.lineTo(sx, sy + HH); ctx.stroke();
    }
    // large soft stain patches so panels aren't flat grey
    softBlobs(ctx, sx, sy, c, r, 600, 3, ['#5a5d62', '#3a3d42'], 0.18);
    // stain mottle
    specks(ctx, sx, sy, c, r, 62, 26, [shade(base, 0.12), shade(base, -0.16), shade(base, -0.24)], 1, 2.2);
    if (id === 'agentcity') {
      // neon edge glow (tron concrete)
      ctx.strokeStyle = rgba(R.accent, 0.3); ctx.lineWidth = 1;
      diamondPath(ctx, sx, sy); ctx.stroke();
    }
    ctx.restore();
    aoEdge(ctx, sx, sy, shade(base, -0.5));
  }

  function tron(ctx, R, id, sx, sy, c, r, time) {
    var base = R.grass; // very dark base for agentcity
    baseFill(ctx, sx, sy, base, 0.10, -0.5);
    ctx.save(); clipTile(ctx, sx, sy);
    var t = (time || 0) * 0.001;
    var pulse = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.5 + (c + r) * 0.5));
    // subtle central glow so tiles read as lit panels
    var cg = ctx.createRadialGradient(sx, sy, 0, sx, sy, HW * 0.8);
    cg.addColorStop(0, rgba(R.accent, 0.05));
    cg.addColorStop(1, rgba(R.accent, 0));
    ctx.fillStyle = cg; ctx.fillRect(sx - HW, sy - HH, HW * 2, HH * 2);
    // faint inner grid cross
    ctx.strokeStyle = rgba(R.accent, 0.12); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx - HW, sy); ctx.lineTo(sx + HW, sy);
    ctx.moveTo(sx, sy - HH); ctx.lineTo(sx, sy + HH); ctx.stroke();
    // dark speckle for depth
    specks(ctx, sx, sy, c, r, 70, 14, ['#101826', '#050810', '#0e1b2a'], 1, 2);
    ctx.restore();
    // neon-cyan edge glow on the diamond outline (drawn outside clip for crisp rim)
    ctx.save();
    ctx.shadowColor = R.accent;
    ctx.shadowBlur = 7;
    ctx.strokeStyle = rgba(R.accent, pulse);
    ctx.lineWidth = 1.2;
    diamondPath(ctx, sx, sy);
    ctx.stroke();
    // bright node at top vertex
    ctx.fillStyle = rgba(R.accent, pulse);
    ctx.beginPath(); ctx.arc(sx, sy - HH, 1.6, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  function lava(ctx, R, id, sx, sy, c, r, time) {
    var crust = '#1a0d08';
    var glow = R.lava || '#ff6a12';
    baseFill(ctx, sx, sy, crust, 0.1, -0.4);
    ctx.save(); clipTile(ctx, sx, sy);
    var t = (time || 0) * 0.001;
    var pulse = 0.5 + 0.5 * Math.sin(t * 2 + (c * 0.9 + r * 1.4));

    // molten cracks: a branching set of bright orange lines with glow
    ctx.save();
    ctx.shadowColor = glow; ctx.shadowBlur = 8;
    ctx.strokeStyle = rgba(glow, 0.7 + pulse * 0.3);
    ctx.lineWidth = 1.6;
    var seeds = 3;
    for (var s = 0; s < seeds; s++) {
      var ax = sx + (hash2(c, r, 400 + s) * 2 - 1) * HW * 0.5;
      var ay = sy + (hash2(c, r, 410 + s) * 2 - 1) * HH * 0.5;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      var px = ax, py = ay;
      for (var k = 0; k < 3; k++) {
        px += (hash2(c, r, 420 + s * 4 + k) - 0.5) * 22;
        py += (hash2(c, r, 440 + s * 4 + k) - 0.5) * 12;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
    // hot core highlights along cracks (yellow-white, flowing with time)
    for (var h = 0; h < 5; h++) {
      var flow = 0.5 + 0.5 * Math.sin(t * 2.5 + h * 1.3 + (c + r) * 0.4);
      var hx = sx + (hash2(c, r, 460 + h) * 2 - 1) * HW * 0.5;
      var hy = sy + (hash2(c, r, 470 + h) * 2 - 1) * HH * 0.5;
      ctx.fillStyle = rgba('#fff0a0', 0.35 + 0.55 * flow);
      ctx.fillRect(hx, hy, 1.5, 1.5);
    }
    // ember shimmer: tiny rising sparks that blink with time
    for (var e = 0; e < 4; e++) {
      var eb = 0.5 + 0.5 * Math.sin(t * 3.2 + e * 2.1 + c * 0.6 - r * 0.5);
      if (eb < 0.6) continue;
      var ex = sx + (hash2(c, r, 480 + e) * 2 - 1) * HW * 0.6;
      var ey = sy + (hash2(c, r, 490 + e) * 2 - 1) * HH * 0.6;
      ctx.fillStyle = rgba('#ffb04a', 0.3 + 0.5 * eb);
      ctx.fillRect(ex, ey, 1, 1);
    }
    // rising glow bloom in tile center, brighter/pulsing
    var bg = ctx.createRadialGradient(sx, sy, 0, sx, sy, HW * 0.75);
    bg.addColorStop(0, rgba(glow, 0.26 + pulse * 0.20));
    bg.addColorStop(0.5, rgba('#ff3a08', 0.10 + pulse * 0.10));
    bg.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = bg; ctx.fillRect(sx - HW, sy - HH, HW * 2, HH * 2);
    ctx.restore();
    aoEdge(ctx, sx, sy, '#000000');
  }

  // volcano ground (charred obsidian w/ glowing cracks) — used when type==='grass' or 'concrete' in volcano
  function charred(ctx, R, id, sx, sy, c, r, time) {
    var base = id === 'volcano' ? '#26201f' : R.grass;
    baseFill(ctx, sx, sy, base, 0.14, -0.34);
    ctx.save(); clipTile(ctx, sx, sy);
    var t = (time || 0) * 0.001;
    var pulse = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.2 + (c + r) * 0.6));
    // obsidian facets (lighter charcoals so ground reads as solid, not void)
    softBlobs(ctx, sx, sy, c, r, 700, 3, ['#3a2f2c', '#1a1416'], 0.35);
    specks(ctx, sx, sy, c, r, 80, 20, ['#3a2c2a', '#181214', '#443330'], 1, 2.6);
    // faint ember glow underlighting from below
    var eg = ctx.createLinearGradient(sx, sy - HH, sx, sy + HH);
    eg.addColorStop(0, rgba('#ff5a10', 0));
    eg.addColorStop(1, rgba('#ff5a10', 0.10 + pulse * 0.06));
    ctx.fillStyle = eg; ctx.fillRect(sx - HW, sy - HH, HW * 2, HH * 2);
    // glowing orange cracks (more frequent + brighter)
    ctx.save();
    ctx.shadowColor = '#ff5a10'; ctx.shadowBlur = 6;
    ctx.strokeStyle = rgba('#ff7a24', 0.5 + pulse * 0.4);
    ctx.lineWidth = 1.1;
    for (var s = 0; s < 3; s++) {
      if (pick(c, r, 82 + s, 2) !== 0) continue;
      var ax = sx + (hash2(c, r, 84 + s) * 2 - 1) * HW * 0.6;
      var ay = sy + (hash2(c, r, 86 + s) * 2 - 1) * HH * 0.6;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(ax + (hash2(c, r, 88 + s) - 0.5) * 26, ay + (hash2(c, r, 90 + s) - 0.5) * 14);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
    aoEdge(ctx, sx, sy, '#000000');
  }

  // ================= DISPATCH =================
  function tile(ctx, regionId, type, sx, sy, col, row, time) {
    var R = regionOf(regionId);
    var c = col | 0, r = row | 0;

    switch (type) {
      case 'water': return water(ctx, R, regionId, sx, sy, c, r, time);
      case 'sand':  return sand(ctx, R, regionId, sx, sy, c, r, time);
      case 'path':  return pathTile(ctx, R, regionId, sx, sy, c, r, time);
      case 'dock':  return dock(ctx, R, regionId, sx, sy, c, r, time);
      case 'lava':  return lava(ctx, R, regionId, sx, sy, c, r, time);
      case 'tron':  return tron(ctx, R, regionId, sx, sy, c, r, time);
      case 'concrete':
        if (regionId === 'volcano') return charred(ctx, R, regionId, sx, sy, c, r, time);
        return concrete(ctx, R, regionId, sx, sy, c, r, time);
      case 'grass':
      default:
        if (regionId === 'agentcity') return tron(ctx, R, regionId, sx, sy, c, r, time);
        if (regionId === 'volcano') return charred(ctx, R, regionId, sx, sy, c, r, time);
        return grass(ctx, R, regionId, sx, sy, c, r, time);
    }
  }

  window.Terrain = { tile: tile, TW: 84, TH: 42, regions: Object.keys(REGIONS) };
})();
