/* landmarks.js — procedural isometric landmark buildings for the SHADDAI iso MMO world.
 * CODE-ONLY, HTML5 Canvas 2D. No AI, no image assets, $0.
 * Clean colorful iso voxel style: chunky boxes, single upper-left light
 * (top lightest, left face mid, right face dark, thin dark edges).
 * True 2:1 iso: TW=84, TH=42.
 *
 *   window.Landmarks.draw(ctx, kind, sx, sy [, t])
 *     draws the landmark anchored so its FOOTPRINT CENTER is at screen (sx, sy).
 */
(function () {
  'use strict';

  var TW = 84, TH = 42;      // tile width / tile height (true 2:1 iso)
  var HW = TW / 2, HH = TH / 2;

  // ---- color helper -----------------------------------------------------
  // shade(hex, amt): amt 0..1 darkens, >1 lightens. amt=1 => unchanged.
  function shade(hex, amt) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var r = parseInt(hex.substr(0, 2), 16);
    var g = parseInt(hex.substr(2, 2), 16);
    var b = parseInt(hex.substr(4, 2), 16);
    r = Math.max(0, Math.min(255, Math.round(r * amt)));
    g = Math.max(0, Math.min(255, Math.round(g * amt)));
    b = Math.max(0, Math.min(255, Math.round(b * amt)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // Convert iso tile coords (fx forward-right, fy forward-left) into a screen
  // offset relative to a footprint-center anchor. Positive fx goes down-right,
  // positive fy goes down-left. Height h lifts the point straight up.
  // Here we work directly in pixel-space cuboids for full control.

  // ---- iso cuboid -------------------------------------------------------
  // Draw a cel-shaded iso box whose BOTTOM-CENTER sits at screen (cx, cy).
  //   w = half tile-width span of the footprint (in "tiles", x/right axis)
  //   d = half tile-depth span (in "tiles", y/left axis)
  //   h = pixel height of the box
  // The footprint is a diamond of half-extents (w*HW + d*HW) wide.
  // We treat the box footprint as w tiles along the right axis and d tiles
  // along the left axis, so its top diamond corners are:
  //   top    (cx, cy - (w+d)*HH)
  //   right  (cx + (w)*HW ... ) — computed below.
  function box(ctx, cx, cy, w, d, h, base) {
    // footprint diamond corners at ground level (y = cy)
    // right axis unit: (+HW, +HH); left axis unit: (-HW, +HH)
    // Place footprint so its CENTER is at (cx, cy - centerLift). We anchor by
    // bottom-center = the lowest point of the diamond.
    // Corners of the top face of the box (at height h):
    var topY = cy - h;
    // ground diamond vertices (relative to bottom-center cx,cy):
    // bottom (front) vertex is at (cx, cy)
    // right vertex   (cx + w*HW, cy - w*HH)
    // left  vertex   (cx - d*HW, cy - d*HH)
    // back  vertex   (cx + (w-d)*HW, cy - (w+d)*HH)
    var gB = [cx, cy];
    var gR = [cx + w * HW, cy - w * HH];
    var gL = [cx - d * HW, cy - d * HH];
    var gK = [cx + (w - d) * HW, cy - (w + d) * HH];
    // top face vertices (lifted by h)
    var tB = [gB[0], gB[1] - h];
    var tR = [gR[0], gR[1] - h];
    var tL = [gL[0], gL[1] - h];
    var tK = [gK[0], gK[1] - h];

    var topC = shade(base, 1.0);
    var leftC = shade(base, 0.67);   // right face on screen (down-left side) = darker
    var rightC = shade(base, 0.83);  // left-lit face
    var edge = shade(base, 0.45);

    // RIGHT screen face (from front vertex to right vertex) — mid
    ctx.beginPath();
    ctx.moveTo(gB[0], gB[1]);
    ctx.lineTo(gR[0], gR[1]);
    ctx.lineTo(tR[0], tR[1]);
    ctx.lineTo(tB[0], tB[1]);
    ctx.closePath();
    ctx.fillStyle = rightC;
    ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();

    // LEFT screen face (front vertex to left vertex) — darkest
    ctx.beginPath();
    ctx.moveTo(gB[0], gB[1]);
    ctx.lineTo(gL[0], gL[1]);
    ctx.lineTo(tL[0], tL[1]);
    ctx.lineTo(tB[0], tB[1]);
    ctx.closePath();
    ctx.fillStyle = leftC;
    ctx.fill();
    ctx.strokeStyle = edge; ctx.stroke();

    // TOP face — lightest
    ctx.beginPath();
    ctx.moveTo(tB[0], tB[1]);
    ctx.lineTo(tR[0], tR[1]);
    ctx.lineTo(tK[0], tK[1]);
    ctx.lineTo(tL[0], tL[1]);
    ctx.closePath();
    ctx.fillStyle = topC;
    ctx.fill();
    ctx.strokeStyle = edge; ctx.stroke();

    return { tB: tB, tR: tR, tL: tL, tK: tK, gB: gB, gR: gR, gL: gL, gK: gK, topY: topY };
  }

  // Contact shadow: soft dark ellipse on the ground under the footprint.
  function contactShadow(ctx, cx, cy, w, d) {
    ctx.save();
    var rx = (w + d) * HW * 0.62;
    var ry = (w + d) * HH * 0.62;
    // center of diamond is up from bottom vertex by (w+d)/2 * HH
    var ccy = cy - (w + d) * HH * 0.5;
    var g = ctx.createRadialGradient(cx, ccy, 1, cx, ccy, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(0,0,0,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cx, ccy);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // A flat iso diamond patch (e.g. platform top / ground detail) at height h.
  function diamond(ctx, cx, cy, w, d, h, fill, stroke) {
    var B = [cx, cy - h];
    var R = [cx + w * HW, cy - w * HH - h];
    var L = [cx - d * HW, cy - d * HH - h];
    var K = [cx + (w - d) * HW, cy - (w + d) * HH - h];
    ctx.beginPath();
    ctx.moveTo(B[0], B[1]); ctx.lineTo(R[0], R[1]);
    ctx.lineTo(K[0], K[1]); ctx.lineTo(L[0], L[1]);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  // Helper: bottom-center screen point for a box whose footprint-center is at
  // (sx, sy) with footprint w x d. Footprint center -> bottom vertex is
  // down by (w+d)/2 * HH.
  function footCenterToBottom(sx, sy, w, d) {
    return [sx, sy + (w + d) * HH * 0.5];
  }

  // ======================================================================
  //  LANDMARK DRAWERS  (each anchored at footprint center sx,sy)
  // ======================================================================

  // --- TOWER: stone watchtower / spire with brazier --------------------
  function drawTower(ctx, sx, sy, t) {
    var w = 1.5, d = 1.5;
    var tt = (typeof t === 'number') ? t : 0;
    contactShadow(ctx, sx, sy, w, d);
    var bc = footCenterToBottom(sx, sy, w, d);
    var cx = bc[0], cy = bc[1];

    // battered stone plinth (wider base foot)
    var stone = '#b7a98f';
    box(ctx, cx, cy, w + 0.35, d + 0.35, 16, shade(stone, 0.82));
    var by = cy - 16;

    // tapered stone shaft — stacked stone courses, slowly narrowing
    var segs = 6, segH = 26, top = by, sw = 1.4;
    for (var i = 0; i < segs; i++) {
      var p = i / segs;
      var ww = sw * (1 - p * 0.22);
      var col = (i % 2 === 0) ? stone : shade(stone, 0.93);
      box(ctx, cx, top, ww, ww, segH, col);
      // stone course line + occasional arrow-slit window
      ctx.strokeStyle = shade(stone, 0.62); ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, top); ctx.lineTo(cx + ww * HW, top - ww * HH); ctx.stroke();
      if (i === 2 || i === 4) {
        ctx.fillStyle = '#2a2620';
        var fx = cx + ww * 0.4 * HW, fy = top - ww * 0.4 * HH;
        ctx.fillRect(fx - 2, fy - segH * 0.7, 4, segH * 0.5);
      }
      top -= segH;
    }
    var shaftTop = top; // top face level of the shaft

    // crenellated battlement ring (merlons around the top diamond)
    var bw = sw * (1 - 0.22) + 0.12;
    box(ctx, cx, shaftTop, bw, bw, 10, shade(stone, 1.05));
    var battY = shaftTop - 10;
    // merlon teeth at the four diamond corners + midpoints
    ctx.fillStyle = shade(stone, 1.08);
    ctx.strokeStyle = shade(stone, 0.55); ctx.lineWidth = 1;
    var mpts = [
      [cx, battY], [cx + bw * HW, battY - bw * HH],
      [cx - bw * HW, battY - bw * HH], [cx + (bw - bw) * HW, battY - 2 * bw * HH]
    ];
    for (var m = 0; m < mpts.length; m++) {
      ctx.fillRect(mpts[m][0] - 4, mpts[m][1] - 12, 8, 12);
      ctx.strokeRect(mpts[m][0] - 4, mpts[m][1] - 12, 8, 12);
    }

    // pointed conical spire roof rising from the battlement center
    var roofBase = battY - 6;
    var rw = bw * 0.72;
    var apex = [cx, roofBase - 46];
    var R = [cx + rw * HW, roofBase - rw * HH];
    var L = [cx - rw * HW, roofBase - rw * HH];
    var F = [cx, roofBase];
    var B = [cx, roofBase - 2 * rw * HH];
    var roofC = '#5b6b8a';
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(R[0], R[1]); ctx.lineTo(F[0], F[1]); ctx.closePath();
    ctx.fillStyle = shade(roofC, 0.8); ctx.fill(); ctx.strokeStyle = shade(roofC, 0.5); ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(L[0], L[1]); ctx.lineTo(F[0], F[1]); ctx.closePath();
    ctx.fillStyle = shade(roofC, 0.65); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(L[0], L[1]); ctx.lineTo(B[0], B[1]); ctx.closePath();
    ctx.fillStyle = shade(roofC, 1.05); ctx.fill(); ctx.stroke();

    // pennant banner hanging from the spire, gently waving with time
    var wave = Math.sin(tt * 0.003) * 5;
    ctx.fillStyle = '#c23a4a';
    ctx.beginPath();
    ctx.moveTo(apex[0], apex[1] + 4);
    ctx.lineTo(apex[0] + 22, apex[1] + 8 + wave);
    ctx.lineTo(apex[0] + 14, apex[1] + 14 + wave * 0.5);
    ctx.lineTo(apex[0] + 22, apex[1] + 20 + wave);
    ctx.lineTo(apex[0], apex[1] + 22);
    ctx.closePath();
    ctx.fillStyle = '#d0414f'; ctx.fill();
    ctx.strokeStyle = '#7d1f2b'; ctx.lineWidth = 1; ctx.stroke();

    // brazier fire on the front battlement edge — flickers with time
    var brx = mpts[0][0], bry = mpts[0][1] - 2;
    // iron bowl
    ctx.fillStyle = '#2a2a30';
    ctx.beginPath(); ctx.ellipse(brx, bry, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    var flick = 0.72 + 0.28 * Math.sin(tt * 0.02) * Math.cos(tt * 0.013);
    var fh = 16 * flick;
    var fg = ctx.createRadialGradient(brx, bry - fh * 0.5, 1, brx, bry - fh * 0.5, 22 * flick);
    fg.addColorStop(0, 'rgba(255,240,150,0.95)');
    fg.addColorStop(0.5, 'rgba(255,140,30,0.7)');
    fg.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(brx, bry - fh * 0.5, 22 * flick, 0, Math.PI * 2); ctx.fill();
    // flame tongue
    ctx.fillStyle = 'rgba(255,190,60,0.95)';
    ctx.beginPath();
    ctx.moveTo(brx - 5, bry);
    ctx.quadraticCurveTo(brx - 3, bry - fh, brx + Math.sin(tt * 0.03) * 2, bry - fh - 4);
    ctx.quadraticCurveTo(brx + 3, bry - fh, brx + 5, bry);
    ctx.closePath(); ctx.fill();
  }

  // window grid on the right & left visible faces of a shaft box
  function drawTowerWindows(ctx, cx, byBottom, w, d, h) {
    var cols = 4, rows = Math.max(4, Math.round(h / 22));
    ctx.save();
    // RIGHT face quad: gB(cx,byBottom) -> gR(cx+w*HW, byBottom - w*HH), lifted h
    drawFaceGrid(ctx, [cx, byBottom], [cx + w * HW, byBottom - w * HH], h, cols, rows,
      'rgba(210,240,255,0.55)', 'rgba(20,50,80,0.35)');
    // LEFT face quad: gB -> gL(cx - d*HW, byBottom - d*HH)
    drawFaceGrid(ctx, [cx, byBottom], [cx - d * HW, byBottom - d * HH], h, cols, rows,
      'rgba(150,200,235,0.35)', 'rgba(20,50,80,0.35)');
    ctx.restore();
  }

  // Draw a grid of window rectangles across a vertical iso face.
  // p0 = front-bottom vertex, p1 = far-bottom vertex, h = height up.
  function drawFaceGrid(ctx, p0, p1, h, cols, rows, litColor, lineColor) {
    var ux = (p1[0] - p0[0]), uy = (p1[1] - p0[1]); // along-face vector
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var f0 = (c + 0.14) / cols, f1 = (c + 0.86) / cols;
        var yTop = h * (r + 0.16) / rows, yBot = h * (r + 0.84) / rows;
        var a = [p0[0] + ux * f0, p0[1] + uy * f0 - yTop];
        var b = [p0[0] + ux * f1, p0[1] + uy * f1 - yTop];
        var cc = [p0[0] + ux * f1, p0[1] + uy * f1 - yBot];
        var dd = [p0[0] + ux * f0, p0[1] + uy * f0 - yBot];
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.lineTo(cc[0], cc[1]); ctx.lineTo(dd[0], dd[1]); ctx.closePath();
        // vary lit vs dark for life
        ctx.fillStyle = ((r + c) % 3 === 0) ? 'rgba(255,246,200,0.7)' : litColor;
        ctx.fill();
        ctx.strokeStyle = lineColor; ctx.lineWidth = 0.6; ctx.stroke();
      }
    }
  }

  // --- LIGHTHOUSE -------------------------------------------------------
  function drawLighthouse(ctx, sx, sy, t) {
    var w = 1.6, d = 1.6;
    var tt = (typeof t === 'number') ? t : 0;
    contactShadow(ctx, sx, sy, w, d);
    var bc = footCenterToBottom(sx, sy, w, d);
    var cx = bc[0], cy = bc[1];

    // rocky base — clustered boulders
    var rockCols = ['#6d7a83', '#7d8a93', '#5c6970'];
    var rocks = [[cx, cy + 2, 26, 12], [cx - 26, cy - 2, 16, 9], [cx + 26, cy - 2, 16, 9],
                 [cx - 12, cy + 8, 14, 8], [cx + 14, cy + 8, 14, 8]];
    for (var rk = 0; rk < rocks.length; rk++) {
      var Rk = rocks[rk];
      ctx.fillStyle = rockCols[rk % 3];
      ctx.beginPath(); ctx.ellipse(Rk[0], Rk[1], Rk[2], Rk[3], 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.ellipse(Rk[0] - Rk[2] * 0.2, Rk[1] - Rk[3] * 0.35, Rk[2] * 0.6, Rk[3] * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }
    var by = cy - 12;

    // tapered striped tower drawn as stacked rings
    var segs = 7, segH = 26, r0w = 1.15;
    var top = by;
    for (var i = 0; i < segs; i++) {
      var tp = i / segs;
      var ww = r0w * (1 - tp * 0.45);
      var col = (i % 2 === 0) ? '#f4f4f4' : '#e0433a';
      box(ctx, cx, top, ww, ww, segH, col);
      // small window on some courses
      if (i === 1 || i === 4) {
        ctx.fillStyle = '#2b3540';
        var fx = cx + ww * 0.36 * HW, fy = top - ww * 0.36 * HH;
        ctx.fillRect(fx - 3, fy - segH * 0.6, 6, 8);
      }
      top -= segH;
    }

    // gallery deck (darker ring) with railing
    box(ctx, cx, top, 0.85, 0.85, 8, '#5a6570');
    top -= 8;
    // lamp room — glass box glowing (pulses)
    var pulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(tt * 0.004));
    box(ctx, cx, top, 0.6, 0.6, 20, '#ffe58a');
    // lantern glow — pulsing radial
    var ly = top - 10;
    var gr = 40 + 14 * pulse;
    var g = ctx.createRadialGradient(cx, ly, 2, cx, ly, gr);
    g.addColorStop(0, 'rgba(255,246,180,' + (0.7 + 0.25 * pulse) + ')');
    g.addColorStop(0.5, 'rgba(255,230,140,' + (0.35 * pulse) + ')');
    g.addColorStop(1, 'rgba(255,240,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, ly, gr, 0, Math.PI * 2); ctx.fill();

    // sweeping rotating light BEAM — a wide cone rotating with time
    var beamAng = tt * 0.0015;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var bcnt = 0; bcnt < 2; bcnt++) {
      var a = beamAng + bcnt * Math.PI; // two opposing beams
      var len = 140, spread = 0.16;
      var bg = ctx.createLinearGradient(cx, ly, cx + Math.cos(a) * len, ly + Math.sin(a) * len * 0.5);
      bg.addColorStop(0, 'rgba(255,248,200,0.55)');
      bg.addColorStop(1, 'rgba(255,248,200,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(cx, ly);
      ctx.lineTo(cx + Math.cos(a - spread) * len, ly + Math.sin(a - spread) * len * 0.5);
      ctx.lineTo(cx + Math.cos(a + spread) * len, ly + Math.sin(a + spread) * len * 0.5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    top -= 20;
    // dome cap (red cone)
    ctx.beginPath();
    ctx.moveTo(cx, top - 22);
    ctx.lineTo(cx - 0.6 * HW, top - 0.6 * HH);
    ctx.lineTo(cx, top + 0.6 * HH);
    ctx.lineTo(cx + 0.6 * HW, top - 0.6 * HH);
    ctx.closePath();
    ctx.fillStyle = '#c23a32'; ctx.fill();
    ctx.strokeStyle = shade('#c23a32', 0.5); ctx.stroke();
    // finial
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, top - 22); ctx.lineTo(cx, top - 34); ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(cx, top - 36, 3, 0, Math.PI * 2); ctx.fill();
  }

  // --- PYRAMID: sandstone stepped ---------------------------------------
  function drawPyramid(ctx, sx, sy) {
    var w = 3.2, d = 3.2;
    contactShadow(ctx, sx, sy, w, d);
    var bc = footCenterToBottom(sx, sy, w, d);
    var cx = bc[0], cy = bc[1];

    var steps = 6, stepH = 20;
    var top = cy;
    for (var i = 0; i < steps; i++) {
      var t = i / steps;
      var ww = w * (1 - t * 0.82);
      // alternate sandstone tone per course for a banded look
      var base = (i % 2 === 0) ? '#e2b976' : '#d8ad68';
      box(ctx, cx, top, ww, ww, stepH, base);
      top -= stepH;
    }
    // capstone (gilded)
    var cap = w * 0.14;
    box(ctx, cx, top, cap, cap, 16, '#f0d27a');
    // subtle entrance shadow on the front-right face at base
    ctx.fillStyle = 'rgba(60,40,15,0.6)';
    var ex = cx + w * 0.34 * HW, ey = cy - w * 0.34 * HH;
    ctx.beginPath();
    ctx.moveTo(ex - 6, ey - 4);
    ctx.lineTo(ex + 6, ey - 8);
    ctx.lineTo(ex + 6, ey - 26);
    ctx.lineTo(ex - 6, ey - 22);
    ctx.closePath();
    ctx.fill();
  }

  // --- FORGE: stone-and-iron building with glowing furnace bay ---------
  function drawForge(ctx, sx, sy, t) {
    var w = 2.4, d = 2.4;
    var tt = (typeof t === 'number') ? t : 0;
    contactShadow(ctx, sx, sy, w, d);
    var bc = footCenterToBottom(sx, sy, w, d);
    var cx = bc[0], cy = bc[1];

    // heavy stone base course, then dark iron-timber block
    var stone = '#5a5348';
    box(ctx, cx, cy, w, d, 20, stone);
    var obs = '#2b2f3a';
    box(ctx, cx, cy - 20, w * 0.96, d * 0.96, 52, obs);
    var by = cy - 72;
    // iron banding on the front-right face
    ctx.strokeStyle = shade(obs, 1.6); ctx.lineWidth = 1.4;
    for (var ib = 1; ib < 3; ib++) {
      var yy = cy - 20 - ib * 16;
      ctx.beginPath();
      ctx.moveTo(cx, yy); ctx.lineTo(cx + w * 0.96 * HW, yy - w * 0.96 * HH); ctx.stroke();
    }

    // furnace bay glow — pulses with time (bellows breathing)
    var pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(tt * 0.006));
    var mx = cx + w * 0.30 * HW, my = cy - w * 0.30 * HH;
    var mg = ctx.createRadialGradient(mx, my - 26, 2, mx, my - 26, 34 + 8 * pulse);
    mg.addColorStop(0, 'rgba(255,240,140,' + (0.85 + 0.12 * pulse) + ')');
    mg.addColorStop(0.4, 'rgba(255,120,20,' + (0.7 * pulse) + ')');
    mg.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my - 26, 34 + 8 * pulse, 0, Math.PI * 2); ctx.fill();
    // arched mouth shape
    ctx.fillStyle = '#ff8a1e';
    ctx.beginPath();
    ctx.moveTo(mx - 12, my - 6);
    ctx.lineTo(mx - 12, my - 30);
    ctx.quadraticCurveTo(mx, my - 46, mx + 12, my - 30);
    ctx.lineTo(mx + 12, my - 12);
    ctx.closePath();
    ctx.fillStyle = '#ffb43a'; ctx.fill();
    ctx.fillStyle = '#ff6a12';
    ctx.beginPath();
    ctx.moveTo(mx - 7, my - 8); ctx.lineTo(mx - 7, my - 28);
    ctx.quadraticCurveTo(mx, my - 40, mx + 7, my - 28);
    ctx.lineTo(mx + 7, my - 10); ctx.closePath(); ctx.fill();

    // lava cracks glow on the left face (thin orange lines)
    ctx.strokeStyle = 'rgba(255,120,30,0.75)'; ctx.lineWidth = 2;
    var lx = cx - d * 0.4 * HW, ly = cy - d * 0.4 * HH;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 8); ctx.lineTo(lx + 4, ly - 26);
    ctx.lineTo(lx - 3, ly - 40); ctx.lineTo(lx + 5, ly - 58); ctx.stroke();

    // anvil hint sitting just outside the furnace bay
    var ax = cx + w * 0.5 * HW + 6, ay = cy + 6;
    ctx.fillStyle = '#3a3f47';
    ctx.beginPath();
    ctx.moveTo(ax - 10, ay - 8); ctx.lineTo(ax + 12, ay - 8);
    ctx.lineTo(ax + 8, ay - 4); ctx.lineTo(ax + 3, ay - 4);
    ctx.lineTo(ax + 3, ay); ctx.lineTo(ax - 3, ay);
    ctx.lineTo(ax - 3, ay - 4); ctx.lineTo(ax - 6, ay - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1c2026'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(ax - 8, ay - 8, 18, 1.5);

    // roof — stone chimney stacks with rising smoke/ember puffs
    box(ctx, cx, by, w * 0.85, d * 0.85, 10, shade(obs, 1.15));
    var ry = by - 10;
    var ch = [[cx - 18, ry - 6], [cx + 20, ry - 12]];
    for (var i = 0; i < ch.length; i++) {
      box(ctx, ch[i][0], ch[i][1] + 6, 0.42, 0.42, 30, '#33251c');
      var topX = ch[i][0], topY = ch[i][1] - 26;
      // ember glow at chimney mouth (pulses)
      var eg = ctx.createRadialGradient(topX, topY, 1, topX, topY, 14 + 4 * pulse);
      eg.addColorStop(0, 'rgba(255,160,50,' + (0.8 + 0.15 * pulse) + ')');
      eg.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(topX, topY, 14 + 4 * pulse, 0, Math.PI * 2); ctx.fill();
      // rising smoke puffs — 4 particles cycling upward with time
      for (var s = 0; s < 4; s++) {
        var phase = ((tt * 0.00025) + i * 0.3 + s * 0.25) % 1;
        var rise = phase * 56;
        var drift = Math.sin(phase * 6 + i) * 8;
        var alpha = (1 - phase) * 0.35;
        var pr = 5 + phase * 12;
        ctx.fillStyle = 'rgba(120,124,132,' + alpha + ')';
        ctx.beginPath();
        ctx.arc(topX + drift, topY - 6 - rise, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      // a couple of floating embers
      for (var e = 0; e < 3; e++) {
        var ep = ((tt * 0.0006) + i * 0.4 + e * 0.33) % 1;
        var ealpha = (1 - ep) * 0.9;
        ctx.fillStyle = 'rgba(255,' + Math.round(150 - ep * 80) + ',40,' + ealpha + ')';
        ctx.beginPath();
        ctx.arc(topX + Math.sin(ep * 9 + e) * 6, topY - 4 - ep * 40, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- TREEHOUSE: giant tree + wooden platforms/huts --------------------
  function drawTreehouse(ctx, sx, sy, t) {
    var w = 2.6, d = 2.6;
    var tt = (typeof t === 'number') ? t : 0;
    contactShadow(ctx, sx, sy, w, d);
    var bc = footCenterToBottom(sx, sy, w, d);
    var cx = bc[0], cy = bc[1];

    // gnarled root flare — rounded lobes at the base (not a box)
    var bark = '#7a5a3a';
    var rootY = cy - 6;
    var lobes = [[cx, cy, 30, 16], [cx - 30, cy - 4, 22, 12], [cx + 30, cy - 4, 22, 12],
                 [cx - 14, cy + 6, 18, 10], [cx + 14, cy + 6, 18, 10]];
    for (var rl = 0; rl < lobes.length; rl++) {
      var L = lobes[rl];
      ctx.fillStyle = shade('#5f4a34', 0.8);
      ctx.beginPath(); ctx.ellipse(L[0], L[1] + 2, L[2], L[3], 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b5238';
      ctx.beginPath(); ctx.ellipse(L[0], L[1] - 2, L[2] * 0.9, L[3] * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    }

    // trunk — tapered chunky column going up
    var ty = cy - 10;
    box(ctx, cx, ty, 0.85, 0.85, 150, bark);
    // bark texture lines
    ctx.strokeStyle = shade(bark, 0.7); ctx.lineWidth = 1.5;
    for (var i = 0; i < 3; i++) {
      var fx = cx - 10 + i * 8;
      ctx.beginPath(); ctx.moveTo(fx, ty - 14); ctx.lineTo(fx + 2, ty - 134); ctx.stroke();
    }
    var trunkTop = ty - 150;

    // wooden platform ring around mid-trunk
    var platY = ty - 78;
    diamond(ctx, cx, platY, 1.8, 1.8, 0, '#a9793f', shade('#a9793f', 0.55));
    // railing posts
    ctx.strokeStyle = '#6d4c26'; ctx.lineWidth = 2;
    var posts = [[cx + 1.8 * HW, platY - 1.8 * HH], [cx - 1.8 * HW, platY - 1.8 * HH],
                 [cx, platY], [cx + (1.8 - 1.8) * HW, platY - 3.6 * HH]];
    for (var p = 0; p < posts.length; p++) {
      ctx.beginPath(); ctx.moveTo(posts[p][0], posts[p][1]); ctx.lineTo(posts[p][0], posts[p][1] - 10); ctx.stroke();
    }

    // little huts on the platform, with cozy glowing windows
    var flick1 = 0.8 + 0.2 * Math.sin(tt * 0.005);
    var flick2 = 0.8 + 0.2 * Math.sin(tt * 0.005 + 2);
    box(ctx, cx - 26, platY - 4, 0.7, 0.7, 20, '#b7863f');
    litWindow(ctx, cx - 26 + 0.7 * 0.34 * HW, platY - 4 - 0.7 * 0.34 * HH - 8, flick1);
    drawHutRoof(ctx, cx - 26, platY - 24, 0.7, 0.7, '#8a4b2c');
    box(ctx, cx + 30, platY - 10, 0.6, 0.6, 18, '#b7863f');
    litWindow(ctx, cx + 30 + 0.6 * 0.34 * HW, platY - 10 - 0.6 * 0.34 * HH - 7, flick2);
    drawHutRoof(ctx, cx + 30, platY - 28, 0.6, 0.6, '#8a4b2c');

    // canopy — layered green blobs (chunky, cel style)
    var canopy = [
      [cx, trunkTop - 10, 70, '#3f8f4a'],
      [cx - 40, trunkTop + 20, 52, '#4fa657'],
      [cx + 42, trunkTop + 14, 56, '#357f41'],
      [cx - 10, trunkTop - 40, 58, '#57b061'],
      [cx + 18, trunkTop - 20, 48, '#4fa657']
    ];
    for (var c = 0; c < canopy.length; c++) {
      var b = canopy[c];
      // cel: main + top-lit highlight
      ctx.fillStyle = shade(b[3], 0.85);
      ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b[3];
      ctx.beginPath(); ctx.arc(b[0] - b[2] * 0.18, b[1] - b[2] * 0.22, b[2] * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(b[3], 1.18);
      ctx.beginPath(); ctx.arc(b[0] - b[2] * 0.3, b[1] - b[2] * 0.36, b[2] * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    // top hut peeking out of the canopy crown
    box(ctx, cx + 2, trunkTop - 44, 0.62, 0.62, 20, '#c9924a');
    litWindow(ctx, cx + 2 + 0.62 * 0.34 * HW, trunkTop - 44 - 0.62 * 0.34 * HH - 8, 0.8 + 0.2 * Math.sin(tt * 0.005 + 4));
    drawHutRoof(ctx, cx + 2, trunkTop - 64, 0.7, 0.7, '#7d4326');
  }

  // small warm glowing window (flicker = 0..1 brightness)
  function litWindow(ctx, x, y, flick) {
    flick = (typeof flick === 'number') ? flick : 1;
    var g = ctx.createRadialGradient(x, y, 0.5, x, y, 9);
    g.addColorStop(0, 'rgba(255,214,120,' + (0.85 * flick) + ')');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,228,150,' + (0.9 * flick) + ')';
    ctx.fillRect(x - 3, y - 4, 6, 8);
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 3, y - 4, 6, 8);
  }

  function drawHutRoof(ctx, cx, byTop, w, d, col) {
    // simple iso pyramid roof: apex above center of diamond
    var apex = [cx, byTop - 20];
    var R = [cx + w * HW, byTop - w * HH];
    var L = [cx - d * HW, byTop - d * HH];
    var F = [cx, byTop + Math.min(w, d) * 0 ]; // front vertex ~ byTop
    var B = [cx + (w - d) * HW, byTop - (w + d) * HH];
    // front-right slope
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(R[0], R[1]); ctx.lineTo(F[0], byTop); ctx.closePath();
    ctx.fillStyle = shade(col, 0.83); ctx.fill(); ctx.strokeStyle = shade(col, 0.5); ctx.lineWidth = 1; ctx.stroke();
    // front-left slope
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(L[0], L[1]); ctx.lineTo(F[0], byTop); ctx.closePath();
    ctx.fillStyle = shade(col, 0.67); ctx.fill(); ctx.stroke();
    // back-left slope (lit)
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(L[0], L[1]); ctx.lineTo(B[0], B[1]); ctx.closePath();
    ctx.fillStyle = shade(col, 1.0); ctx.fill(); ctx.stroke();
  }

  // --- WINDMILL ---------------------------------------------------------
  function drawWindmill(ctx, sx, sy, t) {
    var w = 1.8, d = 1.8;
    contactShadow(ctx, sx, sy, w, d);
    var bc = footCenterToBottom(sx, sy, w, d);
    var cx = bc[0], cy = bc[1];

    // stone tapered tower (stacked shrinking boxes)
    var stone = '#cbb79a';
    var segs = 5, segH = 24, top = cy;
    for (var i = 0; i < segs; i++) {
      var tt = i / segs;
      var ww = w * (1 - tt * 0.4);
      box(ctx, cx, top, ww, ww, segH, i % 2 ? shade(stone, 0.94) : stone);
      top -= segH;
    }
    // little door + window
    ctx.fillStyle = '#5a4630';
    var dx = cx + w * 0.32 * HW, dy = cy - w * 0.32 * HH;
    ctx.fillRect(dx - 5, dy - 22, 10, 20);
    ctx.fillStyle = '#7fa8c0';
    ctx.fillRect(cx - 4, top + segH - 8, 8, 8);

    // domed conical cap — taller, clearly a windmill cap
    var capW = w * 0.66;
    var apex = [cx, top - 40];
    var R = [cx + capW * HW, top - capW * HH];
    var L = [cx - capW * HW, top - capW * HH];
    var F = [cx, top];
    var B = [cx, top - 2 * capW * HH];
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(R[0], R[1]); ctx.lineTo(F[0], F[1]); ctx.closePath();
    ctx.fillStyle = '#9c5340'; ctx.fill(); ctx.strokeStyle = shade('#9c5340', 0.5); ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(L[0], L[1]); ctx.lineTo(F[0], F[1]); ctx.closePath();
    ctx.fillStyle = shade('#9c5340', 0.7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(L[0], L[1]); ctx.lineTo(B[0], B[1]); ctx.closePath();
    ctx.fillStyle = shade('#9c5340', 1.08); ctx.fill(); ctx.stroke();

    // rotating blades — 4 fat lattice sails on the front-right plane
    var hubX = cx + capW * 0.5 * HW, hubY = top - capW * 0.5 * HH - 8;
    var ang = (typeof t === 'number') ? t * 0.8 : 0.5;
    ctx.save();
    ctx.translate(hubX, hubY);
    for (var bld = 0; bld < 4; bld++) {
      var a = ang + bld * Math.PI / 2;
      ctx.save();
      ctx.rotate(a);
      // blade arm (wooden spar)
      ctx.strokeStyle = '#5c3f22'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -60); ctx.stroke();
      // sail — full canvas trapezoid on one side of the spar
      ctx.fillStyle = '#f4ecd6';
      ctx.beginPath();
      ctx.moveTo(3, -10); ctx.lineTo(20, -14); ctx.lineTo(16, -58); ctx.lineTo(3, -58);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c2b393'; ctx.lineWidth = 1; ctx.stroke();
      // lattice ribs
      ctx.strokeStyle = '#8a4b3a'; ctx.lineWidth = 0.8;
      for (var rb = 1; rb < 4; rb++) {
        var yy = -10 - rb * 12;
        ctx.beginPath(); ctx.moveTo(3, yy); ctx.lineTo(18 - rb * 1.2, yy); ctx.stroke();
      }
      ctx.restore();
    }
    // hub
    ctx.fillStyle = '#3a2a18';
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6d4c26'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // --- AIRPORT: curved-roof terminal + control tower + parked plane -----
  function drawAirport(ctx, sx, sy, t) {
    var w = 3.6, d = 2.6;
    var tt = (typeof t === 'number') ? t : 0;
    contactShadow(ctx, sx, sy, w, d);
    var bc = footCenterToBottom(sx, sy, w, d);
    var cx = bc[0], cy = bc[1];

    // apron / tarmac patch
    diamond(ctx, cx, cy + 4, w + 0.8, d + 0.8, 0, '#3a4048', '#2c3238');

    // landing pad ring with blinking perimeter lights (front-right of apron)
    var padX = cx + w * 0.42 * HW + 30, padY = cy + 20;
    var padRx = 34, padRy = 17;
    // ring markings
    ctx.strokeStyle = 'rgba(230,236,242,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(padX, padY, padRx, padRy, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(230,236,242,0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(padX, padY, padRx * 0.5, padRy * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    // 'H' pad marking
    ctx.strokeStyle = 'rgba(240,244,248,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padX - 6, padY - 5); ctx.lineTo(padX - 6, padY + 5);
    ctx.moveTo(padX + 6, padY - 5); ctx.lineTo(padX + 6, padY + 5);
    ctx.moveTo(padX - 6, padY); ctx.lineTo(padX + 6, padY);
    ctx.stroke();
    // 8 perimeter lights blinking in sequence
    for (var pl = 0; pl < 8; pl++) {
      var pa = (pl / 8) * Math.PI * 2;
      var lxp = padX + Math.cos(pa) * padRx, lyp = padY + Math.sin(pa) * padRy;
      var on = ((Math.floor(tt * 0.004) + pl) % 8) < 4; // chasing blink
      var lit = 0.4 + (on ? 0.6 : 0) * (0.6 + 0.4 * Math.sin(tt * 0.01));
      ctx.fillStyle = 'rgba(255,210,80,' + lit + ')';
      ctx.beginPath(); ctx.arc(lxp, lyp, on ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();
      if (on) {
        var lg = ctx.createRadialGradient(lxp, lyp, 1, lxp, lyp, 8);
        lg.addColorStop(0, 'rgba(255,220,120,0.6)');
        lg.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(lxp, lyp, 8, 0, Math.PI * 2); ctx.fill();
      }
    }

    // terminal body — long low box, light
    box(ctx, cx, cy, w, d, 34, '#dfe6ec');
    var by = cy - 34;

    // curved white roof — draw as a rounded shell over the top diamond
    drawCurvedRoof(ctx, cx, by, w, d);

    // glass frontage (blue strip on front-right face)
    drawFaceGrid(ctx, [cx, cy], [cx + w * HW, cy - w * HH], 24, 8, 2,
      'rgba(120,190,230,0.7)', 'rgba(40,70,100,0.4)');

    // control tower (back-left of terminal)
    var tx = cx - w * 0.55 * HW - 6, ty = cy - w * 0.55 * HH - 20;
    box(ctx, tx, ty, 0.7, 0.7, 70, '#c7ced5');
    var tby = ty - 70;
    // control cab (angled glass)
    box(ctx, tx, tby, 0.95, 0.95, 20, '#3d5b70');
    // glass shine
    ctx.fillStyle = 'rgba(150,210,240,0.6)';
    ctx.fillRect(tx - 12, tby - 16, 24, 8);
    // roof + antenna
    box(ctx, tx, tby - 20, 0.7, 0.7, 6, '#9aa3ad');
    ctx.strokeStyle = '#cfd6dd'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, tby - 26); ctx.lineTo(tx, tby - 44); ctx.stroke();
    // blinking red aviation beacon
    var beaconOn = (Math.floor(tt * 0.003) % 2) === 0;
    ctx.fillStyle = beaconOn ? '#ff5a5a' : '#7a2a2a';
    ctx.beginPath(); ctx.arc(tx, tby - 46, 3, 0, Math.PI * 2); ctx.fill();
    if (beaconOn) {
      var bg2 = ctx.createRadialGradient(tx, tby - 46, 1, tx, tby - 46, 10);
      bg2.addColorStop(0, 'rgba(255,90,90,0.7)');
      bg2.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = bg2;
      ctx.beginPath(); ctx.arc(tx, tby - 46, 10, 0, Math.PI * 2); ctx.fill();
    }

    // parked plane silhouette (front-right of apron)
    drawPlane(ctx, cx + w * 0.34 * HW + 26, cy + 18);
  }

  function drawCurvedRoof(ctx, cx, by, w, d) {
    // top diamond corners
    var Bt = [cx, by];
    var Rt = [cx + w * HW, by - w * HH];
    var Lt = [cx - d * HW, by - d * HH];
    var Kt = [cx + (w - d) * HW, by - (w + d) * HH];
    var lift = 42;
    // barrel-vault roof: the curved cross-section runs along the LEFT (d) axis,
    // sweeping the whole length of the RIGHT (w) axis. Build it as a series of
    // arched ribs so it reads as a smooth curved shell, not a tent.
    // Endpoints of the ridge (crown) at front and back along the w-axis:
    var frontMid = [(Bt[0] + Lt[0]) / 2, (Bt[1] + Lt[1]) / 2 - lift];
    var backMid = [(Rt[0] + Kt[0]) / 2, (Rt[1] + Kt[1]) / 2 - lift];

    // shell filled: front arch (B->crownFront->L) swept to back arch (R->crownBack->K)
    // Right-facing curved surface (Bt..Rt eaves up to crown)
    ctx.beginPath();
    ctx.moveTo(Bt[0], Bt[1]);
    ctx.quadraticCurveTo(frontMid[0], frontMid[1], Lt[0], Lt[1]);
    ctx.lineTo(Kt[0], Kt[1]);
    ctx.quadraticCurveTo(backMid[0], backMid[1], Rt[0], Rt[1]);
    ctx.closePath();
    ctx.fillStyle = '#e7edf2'; ctx.fill();
    ctx.strokeStyle = '#b9c4cc'; ctx.lineWidth = 1; ctx.stroke();

    // curved ribs across the length for a corrugated shell look + shading
    var ribs = 7;
    for (var i = 0; i <= ribs; i++) {
      var f = i / ribs;
      // eave near-B interpolated toward eave near-R (along w axis)
      var e0 = [Bt[0] + (Rt[0] - Bt[0]) * f, Bt[1] + (Rt[1] - Bt[1]) * f];
      var e1 = [Lt[0] + (Kt[0] - Lt[0]) * f, Lt[1] + (Kt[1] - Lt[1]) * f];
      var cm = [frontMid[0] + (backMid[0] - frontMid[0]) * f, frontMid[1] + (backMid[1] - frontMid[1]) * f];
      ctx.beginPath();
      ctx.moveTo(e0[0], e0[1]);
      ctx.quadraticCurveTo(cm[0], cm[1], e1[0], e1[1]);
      // shade darker toward front-right eaves for roundness
      ctx.strokeStyle = 'rgba(150,168,180,' + (0.25 + 0.06 * (i % 2)) + ')';
      ctx.lineWidth = 1; ctx.stroke();
    }
    // crown ridge highlight
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(frontMid[0], frontMid[1]); ctx.lineTo(backMid[0], backMid[1]); ctx.stroke();
    // eave shadow on the right (down-right) edge
    ctx.strokeStyle = 'rgba(120,138,150,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(Bt[0], Bt[1]); ctx.lineTo(Rt[0], Rt[1]); ctx.stroke();
  }

  function drawPlane(ctx, px, py) {
    // parked airliner, nose pointing down-right, sitting flat on the apron
    ctx.save();
    ctx.translate(px, py);
    var S = 1.35;
    ctx.scale(S, S);
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 10, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
    // far wing (behind fuselage)
    ctx.fillStyle = '#cdd6dd';
    ctx.beginPath();
    ctx.moveTo(2, -6); ctx.lineTo(30, -26); ctx.lineTo(20, -6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#aeb8c0'; ctx.lineWidth = 1; ctx.stroke();
    // fuselage (long tube nose down-right, tail up-left)
    ctx.fillStyle = '#f6f8fa';
    ctx.beginPath();
    ctx.ellipse(0, -8, 46, 10, -0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c3ccd2'; ctx.lineWidth = 1.2; ctx.stroke();
    // window stripe
    ctx.strokeStyle = '#9fb6c8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-30, -10); ctx.lineTo(26, -16); ctx.stroke();
    // nose cockpit
    ctx.fillStyle = '#3d5b70';
    ctx.beginPath(); ctx.ellipse(38, -14, 7, 4.5, -0.25, 0, Math.PI * 2); ctx.fill();
    // tail fin (up-left)
    ctx.fillStyle = '#4aa3d8';
    ctx.beginPath();
    ctx.moveTo(-42, -12); ctx.lineTo(-58, -40); ctx.lineTo(-46, -40); ctx.lineTo(-38, -16);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade('#4aa3d8', 0.6); ctx.stroke();
    // horizontal stabilizer
    ctx.fillStyle = '#dfe6ec';
    ctx.beginPath(); ctx.moveTo(-40, -12); ctx.lineTo(-56, -20); ctx.lineTo(-44, -12); ctx.closePath(); ctx.fill();
    // near wing (in front)
    ctx.fillStyle = '#e6edf2';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(-30, 22); ctx.lineTo(-8, -2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c3ccd2'; ctx.stroke();
    // engine pod under near wing
    ctx.fillStyle = '#9aa3ad';
    ctx.beginPath(); ctx.ellipse(-14, 8, 8, 4.5, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6f7a82'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  // Symmetric iso gable roof over a w x d footprint whose top-diamond front
  // vertex is at (cx, byTop). Ridge runs along the RIGHT (w) axis.
  function drawGableRoof(ctx, cx, byTop, w, d, col, oh) {
    oh = oh || 0.15; // overhang
    var w2 = w + oh, d2 = d + oh;
    // eave diamond corners (slightly overhung)
    var F = [cx, byTop + oh * HH];
    var R = [cx + w2 * HW, byTop - w2 * HH + oh * HH];
    var L = [cx - d2 * HW, byTop - d2 * HH + oh * HH];
    var K = [cx + (w2 - d2) * HW, byTop - (w2 + d2) * HH + oh * HH];
    var rise = 26;
    // ridge endpoints: above the midpoints of the two short (d-axis) eaves
    var ridgeF = [(F[0] + L[0]) / 2, (F[1] + L[1]) / 2 - rise]; // front-left short edge mid
    var ridgeB = [(R[0] + K[0]) / 2, (R[1] + K[1]) / 2 - rise]; // back-right short edge mid
    // right (down-right) roof slope: F-R eave up to ridge
    ctx.beginPath();
    ctx.moveTo(F[0], F[1]); ctx.lineTo(R[0], R[1]);
    ctx.lineTo(ridgeB[0], ridgeB[1]); ctx.lineTo(ridgeF[0], ridgeF[1]);
    ctx.closePath();
    ctx.fillStyle = shade(col, 0.72); ctx.fill();
    ctx.strokeStyle = shade(col, 0.45); ctx.lineWidth = 1; ctx.stroke();
    // left (down-left) roof slope: F-L eave up to ridge (lit)
    ctx.beginPath();
    ctx.moveTo(F[0], F[1]); ctx.lineTo(L[0], L[1]);
    ctx.lineTo(ridgeB[0], ridgeB[1]); ctx.lineTo(ridgeF[0], ridgeF[1]);
    ctx.closePath();
    ctx.fillStyle = shade(col, 0.95); ctx.fill(); ctx.stroke();
    // front gable triangle (fills the F-corner gap)
    ctx.beginPath();
    ctx.moveTo(F[0], F[1]); ctx.lineTo(ridgeF[0], ridgeF[1]);
    ctx.lineTo(F[0], F[1] - 2); ctx.closePath();
    // ridge highlight
    ctx.strokeStyle = shade(col, 1.15); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ridgeF[0], ridgeF[1]); ctx.lineTo(ridgeB[0], ridgeB[1]); ctx.stroke();
  }

  // --- STATION: train station + platform + train car --------------------
  function drawStation(ctx, sx, sy) {
    var w = 3.2, d = 2.4;
    contactShadow(ctx, sx, sy, w, d);
    var bc = footCenterToBottom(sx, sy, w, d);
    var cx = bc[0], cy = bc[1];

    // brick station building (back-left of the plot)
    var bx = cx - 44, byo = cy - 22;
    var bw = 2.0, bd = 1.6;
    var brick = '#b56a4a';
    box(ctx, bx, byo, bw, bd, 46, brick);
    var by = byo - 46;
    // brick course lines on front-right face
    ctx.strokeStyle = shade(brick, 0.6); ctx.lineWidth = 0.8;
    for (var r = 1; r < 4; r++) {
      var yy = byo - r * 11;
      ctx.beginPath();
      ctx.moveTo(bx, yy); ctx.lineTo(bx + bw * HW, yy - bw * HH); ctx.stroke();
    }
    // arched windows on front-right face
    ctx.fillStyle = '#3d5b70';
    for (var wi = 0; wi < 2; wi++) {
      var f = 0.3 + wi * 0.42;
      var fx = bx + f * bw * HW;
      var fy = byo - f * bw * HH;
      ctx.beginPath();
      ctx.moveTo(fx - 6, fy - 12); ctx.lineTo(fx - 6, fy - 26);
      ctx.quadraticCurveTo(fx, fy - 34, fx + 6, fy - 26);
      ctx.lineTo(fx + 6, fy - 14); ctx.closePath(); ctx.fill();
    }
    // clock roundel high on the gable end
    var clkx = bx - bd * 0.5 * HW, clky = by - bd * 0.5 * HH + 14;
    ctx.fillStyle = '#f4ead0';
    ctx.beginPath(); ctx.arc(clkx, clky, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(clkx, clky); ctx.lineTo(clkx, clky - 5);
    ctx.moveTo(clkx, clky); ctx.lineTo(clkx + 4, clky); ctx.stroke();

    // symmetric gable roof
    drawGableRoof(ctx, bx, by, bw, bd, '#7a5334', 0.22);

    // ---- platform slab (front-right, lower than building) ----
    var pxc = cx - 2, pyc = cy + 8;
    var pw = 2.2, pd = 1.3;
    // slab side (thin extrusion)
    box(ctx, pxc, pyc, pw, pd, 8, '#9aa0a6');
    var pTop = pyc - 8;
    // canopy posts + red canopy roof over the platform
    ctx.strokeStyle = '#4a5058'; ctx.lineWidth = 3;
    var posts = [
      [pxc, pTop], [pxc + pw * HW, pTop - pw * HH],
      [pxc - pd * HW, pTop - pd * HH], [pxc + (pw - pd) * HW, pTop - (pw + pd) * HH]
    ];
    for (var pp = 0; pp < posts.length; pp++) {
      ctx.beginPath(); ctx.moveTo(posts[pp][0], posts[pp][1]); ctx.lineTo(posts[pp][0], posts[pp][1] - 30); ctx.stroke();
    }
    diamond(ctx, pxc, pTop - 30, pw + 0.2, pd + 0.2, 0, '#c9584a', shade('#c9584a', 0.55));
    // canopy underside shading strip
    ctx.strokeStyle = shade('#c9584a', 0.5); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pxc, pTop - 30); ctx.lineTo(pxc + pw * HW, pTop - pw * HH - 30); ctx.stroke();

    // ---- train car on the near track (in front of platform) ----
    drawTrain(ctx, cx - 26, cy + 34);
  }

  function drawTrain(ctx, tx, ty) {
    // iso train car aligned along the right axis (down-right)
    var carLen = 1.7, carW = 0.85, carH = 28;
    var col = '#2f6f4f';
    // body
    box(ctx, tx, ty, carLen, carW, carH, col);
    var by = ty - carH;
    // roof rounded
    diamond(ctx, tx, by, carLen * 0.95, carW * 0.95, 0, shade(col, 1.1), shade(col, 0.6));
    // windows band on the right face
    drawFaceGrid(ctx, [tx, ty], [tx + carLen * HW, ty - carLen * HH], carH * 0.7, 5, 1,
      'rgba(180,220,240,0.85)', 'rgba(30,60,50,0.5)');
    // front (cab) — nose down-right, add a yellow face
    var nx = tx + carLen * HW, ny = ty - carLen * HH;
    ctx.fillStyle = '#e8c45c';
    ctx.beginPath();
    ctx.moveTo(nx, ny); ctx.lineTo(nx + 6, ny - 6);
    ctx.lineTo(nx + 6, ny - carH + 6); ctx.lineTo(nx, ny - carH); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade('#e8c45c', 0.6); ctx.stroke();
    // wheels
    ctx.fillStyle = '#222';
    for (var wf = 0; wf < 3; wf++) {
      var f = (wf + 0.5) / 3;
      var wx = tx + carLen * HW * f, wy = ty - carLen * HH * f + 3;
      ctx.beginPath(); ctx.arc(wx, wy, 4, 0, Math.PI * 2); ctx.fill();
    }
    // rails
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx - 10, ty + 6); ctx.lineTo(tx + carLen * HW + 16, ty - carLen * HH + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx - 4, ty + 12); ctx.lineTo(tx + carLen * HW + 22, ty - carLen * HH + 12); ctx.stroke();
  }

  // ======================================================================
  // --- CASTLE: fortified keep with curtain wall, corner towers, gatehouse ---
  function drawCastle(ctx, sx, sy, t) {
    var tt = (typeof t === 'number') ? t : 0;
    var w = 3.2, d = 3.2, stone = '#8f9298';
    contactShadow(ctx, sx, sy, w + 0.5, d + 0.5);
    var bc = footCenterToBottom(sx, sy, w, d), cx = bc[0], cy = bc[1];
    // curtain wall mass
    var wall = box(ctx, cx, cy, w, d, 28, stone);
    // gatehouse arch (dark) on the front
    ctx.fillStyle = shade(stone, 0.30);
    var gy = cy - 2;
    ctx.beginPath(); ctx.moveTo(cx - 7, gy); ctx.lineTo(cx - 7, gy - 14);
    ctx.arc(cx, gy - 14, 7, Math.PI, 0, false); ctx.lineTo(cx + 7, gy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(stone, 0.5); ctx.lineWidth = 1; ctx.stroke();
    // battlements along the two visible top edges
    function merlonsEdge(a, b) { var n = 5; for (var i = 0; i < n; i++) { var f = (i + 0.5) / n;
      box(ctx, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0.26, 0.26, 8, '#818389'); } }
    merlonsEdge(wall.tB, wall.tR); merlonsEdge(wall.tB, wall.tL);
    // four corner towers with conical caps + pennants
    var corners = [wall.tB, wall.tR, wall.tK, wall.tL], flag = ['#c0392b', '#e8c45c', '#00ff9c', '#5fe0ff'];
    for (var c = 0; c < 4; c++) { var p = corners[c];
      box(ctx, p[0], p[1] + 2, 0.55, 0.55, 30, '#898c92');
      var capY = p[1] + 2 - 30;
      ctx.fillStyle = '#3a4a6a'; ctx.beginPath(); ctx.moveTo(p[0], capY - 15); ctx.lineTo(p[0] + 10, capY + 2); ctx.lineTo(p[0] - 10, capY + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5a5a5a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p[0], capY - 15); ctx.lineTo(p[0], capY - 25); ctx.stroke();
      var fl = Math.sin(tt / 320 + c) * 2; ctx.fillStyle = flag[c];
      ctx.beginPath(); ctx.moveTo(p[0], capY - 25); ctx.lineTo(p[0] + 8 + fl, capY - 22); ctx.lineTo(p[0], capY - 19); ctx.closePath(); ctx.fill(); }
    // central keep (taller) + battlements + gold Tree-of-Life banner
    var kc = [(wall.tB[0] + wall.tK[0]) / 2, (wall.tB[1] + wall.tK[1]) / 2];
    var keep = box(ctx, kc[0], kc[1] + 2, 1.3, 1.3, 46, '#93969d');
    merlonsEdge(keep.tB, keep.tR); merlonsEdge(keep.tB, keep.tL);
    var bx = kc[0], byy = keep.tB[1] - 6;
    ctx.fillStyle = '#1a1420'; ctx.fillRect(bx - 6, byy, 12, 20);
    ctx.strokeStyle = '#e8c45c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, byy + 4); ctx.lineTo(bx, byy + 17);
    ctx.moveTo(bx - 4, byy + 8); ctx.lineTo(bx + 4, byy + 8); ctx.moveTo(bx - 3, byy + 13); ctx.lineTo(bx + 3, byy + 13); ctx.stroke();
    ctx.fillStyle = '#e8c45c'; ctx.beginPath(); ctx.arc(bx, byy + 4, 2, 0, Math.PI * 2); ctx.fill();
  }

  var DRAWERS = {
    tower: drawTower,
    castle: drawCastle,
    lighthouse: drawLighthouse,
    pyramid: drawPyramid,
    forge: drawForge,
    treehouse: drawTreehouse,
    windmill: drawWindmill,
    airport: drawAirport,
    station: drawStation
  };

  window.Landmarks = {
    KINDS: ['tower', 'castle', 'lighthouse', 'pyramid', 'forge', 'treehouse', 'windmill', 'airport', 'station'],
    shade: shade,
    box: box,
    draw: function (ctx, kind, sx, sy, t) {
      var fn = DRAWERS[kind];
      if (!fn) return;
      ctx.save();
      fn(ctx, sx, sy, t);
      ctx.restore();
    }
  };
})();
