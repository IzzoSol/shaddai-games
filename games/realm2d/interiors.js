/* ============================================================================
 * SHADDAI · interiors.js — reusable isometric room interiors (code-only, $0)
 * ----------------------------------------------------------------------------
 * Clean beige iso rooms you see when you ENTER a building. Chunky voxel
 * furniture, checkered floor, two low back walls, depth-sorted props, and a
 * PixelPeople character or two placed in the scene.
 *
 * Single upper-left light: TOP lightest, LEFT mid, RIGHT dark, thin dark edge.
 * No AI, no image assets. Matches world tile size TW=84, TH=42.
 *
 * API:
 *   window.Interiors = {
 *     TYPES: ['home','shop','office','agent'],
 *     draw(ctx, type, W, H, PP, t)   // fill W×H canvas with a centered iso room
 *   }
 *   ctx is already DPR-scaled by the caller (logical W×H).
 *   PP = window.PixelPeople (PP.draw, PP.shade, PP.PRESETS).
 * ==========================================================================*/
window.Interiors = (function () {
  'use strict';

  const TW = 84, TH = 42;          // iso tile (matches world)
  const COLS = 9, ROWS = 7;        // room footprint in tiles
  const WALL_H = 80;               // back-wall height (px)

  // scene-local origin, set per draw()
  let OX = 0, OY = 0;

  /* ---- shading (self-contained; PP.shade used when available) ------------- */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, tt = Math.abs(amt);
    r = Math.round((f - r) * tt + r);
    g = Math.round((f - g) * tt + g);
    b = Math.round((f - b) * tt + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function iso(col, row) { return [OX + (col - row) * TW / 2, OY + (col + row) * TH / 2]; }

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(Math.round(pts[0][0]), Math.round(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(Math.round(pts[i][0]), Math.round(pts[i][1]));
    ctx.closePath();
  }

  /* ---- chunky iso box: top lightest, left mid, right dark, dark edge ------ */
  function box(ctx, col, row, w, d, h, top, opt) {
    opt = opt || {};
    const cx = OX + (col - row) * TW / 2, cy = OY + (col + row) * TH / 2;
    const dx = (dc, dr) => (dc - dr) * TW / 2, dy = (dc, dr) => (dc + dr) * TH / 2;
    const hw = w / 2, hd = d / 2;
    const back = [cx + dx(-hw, -hd), cy + dy(-hw, -hd)],
          right = [cx + dx(hw, -hd), cy + dy(hw, -hd)],
          front = [cx + dx(hw, hd), cy + dy(hw, hd)],
          left = [cx + dx(-hw, hd), cy + dy(-hw, hd)];
    const up = p => [p[0], p[1] - h];
    const tB = up(back), tR = up(right), tF = up(front), tL = up(left);
    // contact shadow (2026-11-22): every stacked piece grounds into the room —
    // soft ellipse at the footprint, offset away from the key light (top-left).
    if (opt.shadow !== false && h > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(8,6,4,0.30)';
      ctx.beginPath();
      ctx.ellipse(cx + 2, cy + 2, (w + d) * TW * 0.30, (w + d) * TH * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // LEFT face (mid) — faces down-left
    ctx.fillStyle = opt.left || shade(top, -0.17); poly(ctx, [left, front, tF, tL]); ctx.fill();
    // RIGHT face (dark) — faces down-right
    ctx.fillStyle = opt.right || shade(top, -0.34); poly(ctx, [front, right, tR, tF]); ctx.fill();
    // TOP (lightest)
    ctx.fillStyle = opt.topC || top; poly(ctx, [tB, tR, tF, tL]); ctx.fill();
    // stacked rim light (2026-11-22): bright key edge around the top face
    ctx.strokeStyle = shade(opt.topC || top, 0.38); ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
    poly(ctx, [tB, tR, tF, tL]); ctx.stroke();
    if (opt.edge !== false) {
      ctx.strokeStyle = opt.edgeC || 'rgba(20,16,10,0.30)';
      ctx.lineWidth = 1; ctx.lineJoin = 'round';
      poly(ctx, [tB, tR, right, front, left, tL]); ctx.stroke();
    }
  }
  const E = { edge: true };

  /* ---- flat iso quad (rug / mat / screen) on the floor -------------------- */
  function quad(ctx, col, row, w, d, color, lift) {
    lift = lift || 0;
    const cx = OX + (col - row) * TW / 2, cy = OY + (col + row) * TH / 2 - lift;
    const dx = (dc, dr) => (dc - dr) * TW / 2, dy = (dc, dr) => (dc + dr) * TH / 2;
    const hw = w / 2, hd = d / 2;
    ctx.fillStyle = color;
    poly(ctx, [
      [cx + dx(-hw, -hd), cy + dy(-hw, -hd)],
      [cx + dx(hw, -hd), cy + dy(hw, -hd)],
      [cx + dx(hw, hd), cy + dy(hw, hd)],
      [cx + dx(-hw, hd), cy + dy(-hw, hd)]
    ]);
    ctx.fill();
  }

  /* ---- floor: checkered iso tiles ---------------------------------------- */
  function floor(ctx, palA, palB) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const [x, y] = iso(c, r);
        const col = ((c + r) & 1) ? palA : palB;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(Math.round(x), Math.round(y));
        ctx.lineTo(Math.round(x + TW / 2), Math.round(y + TH / 2));
        ctx.lineTo(Math.round(x), Math.round(y + TH));
        ctx.lineTo(Math.round(x - TW / 2), Math.round(y + TH / 2));
        ctx.closePath();
        ctx.fill();
      }
    }
    // subtle floor border seam
    ctx.strokeStyle = 'rgba(20,16,10,0.06)'; ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
      const [x0, y0] = iso(0, r), [x1, y1] = iso(COLS, r);
      ctx.beginPath(); ctx.moveTo(Math.round(x0), Math.round(y0)); ctx.lineTo(Math.round(x1), Math.round(y1)); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      const [x0, y0] = iso(c, 0), [x1, y1] = iso(c, ROWS);
      ctx.beginPath(); ctx.moveTo(Math.round(x0), Math.round(y0)); ctx.lineTo(Math.round(x1), Math.round(y1)); ctx.stroke();
    }
  }

  /* ---- two back walls (left edge col=0, right edge row=0) ------------------ */
  // Left wall runs along col=0 (the up-left edge); right wall along row=0 (up-right edge).
  function wallStrip(ctx, a, b, h, faceCol, capCol, opt) {
    // a,b are [col,row] endpoints of the base line (top of floor). Wall rises by h.
    const [ax, ay] = iso(a[0], a[1]), [bx, by] = iso(b[0], b[1]);
    // base points sit at the "top vertex" of each tile row; shift to tile top corner
    const A = [ax, ay], B = [bx, by];
    const At = [ax, ay - h], Bt = [bx, by - h];
    ctx.fillStyle = faceCol;
    poly(ctx, [A, B, Bt, At]); ctx.fill();
    // window band + baseboard for readability
    if (opt && opt.trim) {
      ctx.fillStyle = opt.trim;
      const bandY = h * 0.42;
      poly(ctx, [[ax, ay - bandY], [bx, by - bandY], [bx, by - bandY - 4], [ax, ay - bandY - 4]]); ctx.fill();
      ctx.fillStyle = opt.base || shade(faceCol, -0.18);
      poly(ctx, [A, B, [bx, by - 6], [ax, ay - 6]]); ctx.fill();
    }
    // top cap
    ctx.strokeStyle = capCol; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(Math.round(At[0]), Math.round(At[1])); ctx.lineTo(Math.round(Bt[0]), Math.round(Bt[1])); ctx.stroke();
  }

  function backWalls(ctx, theme) {
    // LEFT wall — along col=0 from row=0 to row=ROWS (down-left slope), lighter (faces light)
    wallStrip(ctx, [0, 0], [0, ROWS], WALL_H, theme.wallL, theme.wallCap, { trim: theme.wallTrim, base: theme.wallBase });
    // RIGHT wall — along row=0 from col=0 to col=COLS (down-right slope), darker
    wallStrip(ctx, [0, 0], [COLS, 0], WALL_H, theme.wallR, theme.wallCap, { trim: theme.wallTrim, base: theme.wallBase });
    // corner post to hide the seam
    const [cx, cy] = iso(0, 0);
    ctx.fillStyle = shade(theme.wallL, 0.05);
    ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - WALL_H, 4, WALL_H);
  }

  /* ---- little decorative helpers ------------------------------------------ */
  function plant(ctx, c, r) {
    box(ctx, c, r, 0.30, 0.30, 12, '#c8895a', E);                 // terracotta pot
    box(ctx, c, r, 0.34, 0.34, 4, '#d99a68', { edge: true, topC: '#3f2a1a' }); // soil rim
    // leafy blob
    const [x, y] = iso(c, r);
    const g = ['#2f7d3a', '#3f9e4d', '#59b862'];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.fillStyle = g[i % 3];
      const px = x + Math.cos(a) * 7, py = y - 18 - Math.sin(a) * 9;
      ctx.beginPath(); ctx.ellipse(px, py, 6, 8, a, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#59b862';
    ctx.beginPath(); ctx.ellipse(x, y - 24, 7, 9, 0, 0, 7); ctx.fill();
  }

  function screen(ctx, c, r, w, h, glow, t) {
    // a wall-ish upright screen sitting on a tile
    box(ctx, c, r, 0.5, 0.14, 4, '#2a2f36', E);                  // base
    const [x, y] = iso(c, r);
    const sw = w, sh = h, bx = Math.round(x - sw / 2), by = Math.round(y - 4 - sh);
    ctx.fillStyle = '#14181d'; ctx.fillRect(bx - 2, by - 2, sw + 4, sh + 4); // bezel
    // glowing face
    const gg = ctx.createLinearGradient(bx, by, bx, by + sh);
    gg.addColorStop(0, shade(glow, 0.35)); gg.addColorStop(1, glow);
    ctx.fillStyle = gg; ctx.fillRect(bx, by, sw, sh);
    // scanline shimmer
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    const ly = by + ((Math.sin(t / 600) * 0.5 + 0.5) * (sh - 3)) | 0;
    ctx.fillRect(bx, ly, sw, 2);
    return { by, bx, sw, sh };
  }

  function pedestal(ctx, c, r, color) {
    box(ctx, c, r, 0.7, 0.7, 6, shade(color, -0.1), E);
    box(ctx, c, r, 0.5, 0.5, 14, color, E);
    box(ctx, c, r, 0.62, 0.62, 3, shade(color, 0.15), E);
  }

  /* ---- THEMES ------------------------------------------------------------- */
  const THEMES = {
    home: {
      floorA: '#e8d3ad', floorB: '#d8bd8f',
      wallL: '#efe0c2', wallR: '#dcc79f', wallCap: '#c9ad7e',
      wallTrim: '#c98f5a', wallBase: '#b89463',
    },
    shop: {
      floorA: '#e6e2d6', floorB: '#d2ccbb',
      wallL: '#f0ead9', wallR: '#ddd4bf', wallCap: '#c7b98f',
      wallTrim: '#3f9e8f', wallBase: '#c0b596',
    },
    office: {
      floorA: '#ece4d2', floorB: '#ddd2ba',   // beige office
      wallL: '#f2ecdd', wallR: '#e0d7c2', wallCap: '#cabfa0',
      wallTrim: '#7fa9c9', wallBase: '#c3b899',
    },
    agent: {
      floorA: '#1a2230', floorB: '#141b26',
      wallL: '#1e2836', wallR: '#161e29', wallCap: '#2f8fff',
      wallTrim: '#00e0b0', wallBase: '#0e141d',
    },
  };

  /* ======================================================================== */
  /*  ROOM BUILDERS — each pushes {y, fn} props, then we depth-sort by y       */
  /* ======================================================================== */

  function drawRoom(ctx, type, W, H, PP, t) {
    const theme = THEMES[type] || THEMES.office;
    const S = shade;

  // --- center the room --------------------------------------------------
  // room spans cols/rows; its pixel bbox: width = (COLS+ROWS)*TW/2, and we
  // want the whole thing centered with a little headroom for walls.
  OX = 0; OY = 0;
  // compute geometric center of floor at (COLS/2, ROWS/2)
  const [midX, midY] = iso(COLS / 2, ROWS / 2);
  OX = W / 2 - midX;
  OY = H / 2 - midY - WALL_H * 0.40;   // lift room up so it reads centered with walls above

    // --- floor + walls ----------------------------------------------------
    // soft ambient background so nothing floats on pure black
    ctx.fillStyle = type === 'agent' ? '#0a0e14' : '#c9b58c';
    ctx.fillRect(0, 0, W, H);
    // vignette-ish floor drop shadow
    const [fx, fy] = iso(COLS / 2, ROWS / 2);
    const rg = ctx.createRadialGradient(fx, fy, 40, fx, fy, Math.max(W, H) * 0.6);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, type === 'agent' ? 'rgba(0,0,0,0.55)' : 'rgba(80,60,30,0.28)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    backWalls(ctx, theme);
    floor(ctx, theme.floorA, theme.floorB);

    // props buffer: each = { c, r, draw } sorted by (c+r) then draw back→front
    const props = [];
    const add = (c, r, fn) => props.push({ k: c + r, c, r, fn });

    if (type === 'home') buildHome(ctx, add, t, PP);
    else if (type === 'shop') buildShop(ctx, add, t, PP);
    else if (type === 'office') buildOffice(ctx, add, t, PP);
    else buildAgent(ctx, add, t, PP);

    props.sort((a, b) => a.k - b.k);
    for (const p of props) p.fn(ctx);

    // --- title ribbon -----------------------------------------------------
    const titles = { home: 'Home Sweet Home', shop: 'The Shop', office: 'Reception', agent: 'Agent Chamber' };
    ctx.save();
    ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = titles[type] || type;
    const tw = ctx.measureText(label).width;
    const ty = H - 46;
    ctx.fillStyle = type === 'agent' ? 'rgba(0,224,176,0.16)' : 'rgba(60,40,20,0.16)';
    ctx.fillRect(W / 2 - tw / 2 - 14, ty, tw + 28, 30);
    ctx.fillStyle = type === 'agent' ? '#7ff5da' : '#5a4326';
    ctx.fillText(label, W / 2, ty + 21);
    ctx.restore();
  }

  /* --- HOME: bed, rug, sofa, TV, table+chair, plant ----------------------- */
  function buildHome(ctx, add, t, PP) {
    // rug (flat, drawn under everything — small k)
    add(2.4, 4.2, () => {
      quad(ctx, 4.5, 4.5, 3.0, 2.2, '#b8503f');
      quad(ctx, 4.5, 4.5, 2.4, 1.6, '#d47a63');
      quad(ctx, 4.5, 4.5, 1.4, 0.9, '#e8a48c');
    });
    // BED (back-left corner)
    add(1.4, 1.4, () => {
      box(ctx, 1.6, 1.6, 1.5, 2.1, 10, '#9a6238', E);            // warm wood frame
        box(ctx, 1.6, 1.7, 1.35, 1.7, 8, '#f4efe4', { edge: true, topC: '#fdfaf2' }); // mattress
      box(ctx, 1.6, 2.05, 1.35, 0.9, 10, '#d97a8a', { edge: true, topC: '#e89aa6' }); // duvet
      box(ctx, 1.05, 1.0, 0.55, 0.4, 7, '#ffffff', E);          // pillow
    });
    // nightstand + lamp
    add(2.7, 1.1, () => {
      box(ctx, 2.9, 1.1, 0.5, 0.5, 11, '#9a6a44', E);
      box(ctx, 2.9, 1.1, 0.14, 0.14, 9, '#caa06a', { edge: false });
      const [x, y] = iso(2.9, 1.1);
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.ellipse(x, y - 22, 7, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,233,168,0.25)'; ctx.beginPath(); ctx.ellipse(x, y - 18, 14, 11, 0, 0, 7); ctx.fill();
    });
    // SOFA (right side, facing in)
    add(5.6, 5.2, () => {
      box(ctx, 6.2, 5.2, 0.9, 2.0, 8, '#3f7a8a', E);            // seat base
        box(ctx, 6.7, 5.2, 0.4, 1.5, 12, '#4a8a9a', E);          // backrest
        box(ctx, 6.2, 4.1, 0.5, 0.4, 10, '#4a8a9a', E);         // arm
      box(ctx, 6.2, 6.3, 0.5, 0.4, 13, '#4a8a9a', E);         // arm
      box(ctx, 6.05, 4.8, 0.6, 0.6, 3, '#e8b04a', E);        // cushion
      box(ctx, 6.05, 5.7, 0.6, 0.6, 3, '#d47a63', E);       // cushion
    });
    // TV / screen on far-left wall area
    add(1.2, 4.2, () => {
      box(ctx, 1.4, 4.6, 0.9, 0.5, 8, '#5a3f2a', E);           // media console
      const [x, y] = iso(1.4, 4.6);
      const w = 58, h = 30, bx = Math.round(x - w / 2), by = Math.round(y - 8 - h);
      ctx.fillStyle = '#14181d'; ctx.fillRect(bx - 3, by - 3, w + 6, h + 6);
      const gg = ctx.createLinearGradient(bx, by, bx, by + h);
      gg.addColorStop(0, '#6fb7ff'); gg.addColorStop(1, '#2f6fe8');
      ctx.fillStyle = gg; ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by + (Math.sin(t / 500) * 0.5 + 0.5) * (h - 3), w, 2);
    });
    // coffee table (center on rug)
    add(4.3, 4.3, () => {
      box(ctx, 4.5, 4.5, 1.0, 0.7, 8, '#7a5238', E);
      box(ctx, 4.5, 4.5, 0.8, 0.5, 2, '#9a6e4a', { edge: true, topC: '#b0855f' });
      box(ctx, 4.4, 4.4, 0.18, 0.18, 3, '#e8433a', { edge: false }); // mug
    });
    // dining chair
    add(3.4, 5.7, () => {
      box(ctx, 3.6, 5.9, 0.4, 0.4, 9, '#8a5a3a', E);
      box(ctx, 3.6, 6.1, 0.4, 0.12, 16, '#9a6a44', E);
    });
    // plant (back-right)
    add(6.6, 1.2, () => plant(ctx, 6.8, 1.2));
    // resident — stand in the open near the sofa, not on the table
    add(4.9, 6.0, () => place(ctx, PP, homeRig(PP), 4.9, 6.0, t));
  }

  /* --- SHOP: counter, shelves w/ goods, shopkeeper ------------------------ */
  function buildShop(ctx, add, t, PP) {
    // shelves along the left wall (back) — tall unit with goods sitting on ledges
    const goods = ['#e8433a', '#2f6fe8', '#3f9e4d', '#f2a01e', '#8b5cf6', '#00a3a3', '#d94f8f'];
    for (let i = 0; i < 3; i++) {
      const r = 1.0 + i * 1.6;
      add(0.9, r, () => {
        box(ctx, 1.0, r, 0.5, 1.2, 36, '#b98a54', E);           // shelf carcass
        const [x, y] = iso(1.0, r);
        // three ledges (dark strips) + goods sitting ON each ledge as small bright boxes
        for (let s = 0; s < 3; s++) {
          const ly = y - 8 - s * 11;                            // ledge y (up the face)
          ctx.fillStyle = '#7a5636';
          ctx.fillRect(Math.round(x) - 22, Math.round(ly), 44, 3); // ledge
          for (let n = 0; n < 4; n++) {
            const gx = Math.round(x) - 18 + n * 11;
            const g = goods[(i * 4 + s + n) % goods.length];
            const gh = 7 + ((i + s + n) % 3) * 2;
            ctx.fillStyle = shade(g, -0.28); ctx.fillRect(gx, ly - gh, 8, gh);      // side
            ctx.fillStyle = g; ctx.fillRect(gx, ly - gh, 6, gh);                     // face
            ctx.fillStyle = shade(g, 0.35); ctx.fillRect(gx, ly - gh, 6, 2);         // top light
          }
        }
      });
    }
    // wall goods (bright bottles) on the right wall
    add(3.2, 0.6, () => {
      for (let i = 0; i < 5; i++) {
        box(ctx, 2.0 + i * 0.9, 0.55, 0.16, 0.16, 8 + (i % 3) * 4,
          ['#e8433a', '#f2c84a', '#3f9e4d', '#2f6fe8', '#8b5cf6'][i], E);
      }
    });
    // COUNTER (center-front)
    add(4.6, 4.6, () => {
      box(ctx, 5.0, 5.0, 2.6, 1.0, 20, '#8a5a3a', E);           // counter body
      box(ctx, 5.0, 5.0, 2.75, 1.15, 4, '#b0855f', { edge: true, topC: '#c69a6e' }); // counter top
      // register
      box(ctx, 5.6, 4.7, 0.4, 0.4, 8, '#2a2f36', E);
      const [x, y] = iso(5.6, 4.7);
      ctx.fillStyle = '#3f9e8f'; ctx.fillRect(Math.round(x) - 6, Math.round(y) - 20, 12, 7);
      // a couple goods on the counter
      box(ctx, 4.4, 4.9, 0.2, 0.2, 5, '#e8433a', E);
      box(ctx, 4.7, 5.2, 0.2, 0.2, 5, '#f2a01e', E);
    });
    // hanging sign
    add(4.6, 2.0, () => {
      const [x, y] = iso(4.6, 2.0);
      ctx.fillStyle = '#3f9e8f'; ctx.fillRect(Math.round(x) - 34, Math.round(y) - WALL_H + 8, 68, 20);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(Math.round(x) - 34, Math.round(y) - WALL_H + 8, 68, 20);
      ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('★ SHOP ★', Math.round(x), Math.round(y) - WALL_H + 22);
      ctx.textAlign = 'left';
    });
    // plant
    add(6.6, 5.6, () => plant(ctx, 6.7, 5.7));
    // SHOPKEEPER behind counter
    add(5.4, 3.6, () => place(ctx, PP, pick(PP, ['Casual', 'Worker', 'Suit']), 5.4, 3.6, t));
    // a customer
    add(3.6, 5.6, () => place(ctx, PP, pick(PP, ['Hoodie', 'Athlete', 'Dress']), 3.6, 5.6, t));
  }

  /* --- OFFICE: reception desk, computers, chairs, plant (beige) ----------- */
  function buildOffice(ctx, add, t, PP) {
    // logo strip on right wall
    add(3.0, 0.4, () => {
      const [x, y] = iso(3.0, 0.4);
      ctx.fillStyle = '#7fa9c9'; ctx.fillRect(Math.round(x) - 40, Math.round(y) - WALL_H + 20, 80, 6);
      ctx.fillStyle = '#5a4326'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('SHADDAI', Math.round(x), Math.round(y) - WALL_H + 14);
      ctx.textAlign = 'left';
    });
    // RECEPTION DESK — big L-ish counter center
    add(4.4, 4.4, () => {
      box(ctx, 4.6, 4.6, 3.0, 1.2, 20, '#c9b48c', E);           // desk body
      box(ctx, 4.6, 4.6, 3.2, 1.35, 4, '#e2d4b2', { edge: true, topC: '#efe3c6' }); // desktop
      // front kick-panel accent
      box(ctx, 4.6, 5.15, 3.0, 0.12, 12, '#7fa9c9', { edge: true, topC: '#9fc3dd' });
      // two monitors
      const mon = (cc, rr) => {
        const [x, y] = iso(cc, rr);
        ctx.fillStyle = '#2a2f36'; ctx.fillRect(Math.round(x) - 13, Math.round(y) - 24, 26, 16);
        const gg = ctx.createLinearGradient(0, Math.round(y) - 24, 0, Math.round(y) - 8);
        gg.addColorStop(0, '#8fd0ff'); gg.addColorStop(1, '#3f8fd0');
        ctx.fillStyle = gg; ctx.fillRect(Math.round(x) - 11, Math.round(y) - 22, 22, 12);
        ctx.fillStyle = '#3a4048'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 8, 4, 4);
      };
      mon(4.0, 4.5); mon(5.1, 4.5);
    });
    // office chairs
    add(4.2, 5.6, () => {
      box(ctx, 4.4, 5.8, 0.5, 0.5, 8, '#3a4048', E);
        box(ctx, 4.4, 6.0, 0.5, 0.14, 12, '#4a5058', E);
      box(ctx, 4.4, 5.8, 0.14, 0.14, 8, '#2a2f36', { edge: false });
    });
    // waiting bench (front-left)
    add(1.4, 5.2, () => {
      box(ctx, 1.6, 5.4, 0.7, 2.0, 7, '#6a8fb0', E);
      box(ctx, 1.2, 5.4, 0.4, 2.0, 15, '#7a9fc0', E);
    });
    // filing / printer
    add(6.2, 1.4, () => {
      box(ctx, 6.4, 1.6, 0.6, 0.6, 22, '#b8ad92', E);
      box(ctx, 6.4, 1.6, 0.5, 0.5, 3, '#2a2f36', { edge: false });
    });
    // wall clock on the right wall
    add(5.4, 0.4, () => {
      const [x, y] = iso(5.4, 0.4);
      const cx = Math.round(x), cy = Math.round(y) - WALL_H + 30;
      ctx.fillStyle = '#efe3c6'; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a7550'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#5a4326'; ctx.lineWidth = 1.5;
      const a = t / 4000;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a * 12) * 5, cy + Math.sin(a * 12) * 5); ctx.stroke();
    });
    // plants both back corners
    add(0.6, 0.6, () => plant(ctx, 0.7, 0.7));
    add(6.7, 6.5, () => plant(ctx, 6.8, 6.6));
    // receptionist behind desk — lifted so head/shoulders clear the desktop
    add(4.4, 3.6, () => {
      const [x, y] = iso(4.5, 3.6);
      if (PP && PP.draw) PP.draw(ctx, pick(PP, ['Suit', 'Casual']), Math.round(x), Math.round(y + TH * 0.5), 0.95, t);
    });
    // a visitor
    add(2.2, 5.4, () => place(ctx, PP, pick(PP, ['Hoodie', 'Elder', 'Athlete']), 2.2, 5.4, t));
  }

  /* --- AGENT: pedestal/throne, glowing terminal, wall of screens, robot --- */
  function buildAgent(ctx, add, t, PP) {
    // WALL OF SCREENS (both back walls)
    add(0.2, 0.2, () => {
      // left wall grid
      for (let i = 0; i < 4; i++) {
        const [x, y] = iso(0, 0.9 + i * 1.5);
        const hue = ['#00e0b0', '#2f8fff', '#c9a6ff', '#00e0b0'][i];
        ctx.fillStyle = '#0c1420'; ctx.fillRect(Math.round(x) - 40, Math.round(y) - WALL_H + 10, 34, 26);
        ctx.fillStyle = shade(hue, 0.1 + 0.15 * (Math.sin(t / 400 + i) * 0.5 + 0.5));
        ctx.fillRect(Math.round(x) - 37, Math.round(y) - WALL_H + 13, 28, 20);
        // fake bars
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        for (let b = 0; b < 3; b++) ctx.fillRect(Math.round(x) - 35, Math.round(y) - WALL_H + 16 + b * 6, 24 * (0.4 + 0.6 * ((i + b) % 3) / 2), 3);
      }
      // right wall grid
      for (let i = 0; i < 4; i++) {
        const [x, y] = iso(0.9 + i * 1.5, 0);
        const hue = ['#2f8fff', '#00e0b0', '#2f8fff', '#c9a6ff'][i];
        ctx.fillStyle = '#0c1420'; ctx.fillRect(Math.round(x) + 6, Math.round(y) - WALL_H + 10, 34, 26);
        ctx.fillStyle = shade(hue, 0.1 + 0.15 * (Math.cos(t / 400 + i) * 0.5 + 0.5));
        ctx.fillRect(Math.round(x) + 9, Math.round(y) - WALL_H + 13, 28, 20);
        ctx.strokeStyle = 'rgba(0,224,176,0.5)'; ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x) + 9, Math.round(y) - WALL_H + 13, 28, 20);
      }
    });
    // glowing floor ring under pedestal
    add(3.9, 3.9, () => {
      const [x, y] = iso(4.5, 4.5);
      for (let ri = 3; ri >= 0; ri--) {
        ctx.strokeStyle = `rgba(0,224,176,${0.10 + ri * 0.06})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y + 6, 70 - ri * 12 + Math.sin(t / 700) * 3, (70 - ri * 12) * 0.5, 0, 0, 7); ctx.stroke();
      }
    });
    // PEDESTAL + THRONE + terminal (center)
    add(4.4, 4.4, () => {
      pedestal(ctx, 4.5, 4.5, '#22303f');
      // throne back
      box(ctx, 4.5, 4.0, 0.7, 0.3, 24, '#2a3a4c', E);
      box(ctx, 4.5, 4.0, 0.55, 0.2, 26, '#1c2a38', { edge: true, topC: '#324458' });
      // glowing terminal / monitor on a stalk
      box(ctx, 4.5, 4.9, 0.2, 0.2, 14, '#1a2430', E);
      const [x, y] = iso(4.5, 4.9);
      const w = 46, h = 30, bx = Math.round(x - w / 2), by = Math.round(y - 26 - h);
      ctx.fillStyle = '#0a1018'; ctx.fillRect(bx - 3, by - 3, w + 6, h + 6);
      const gg = ctx.createLinearGradient(bx, by, bx, by + h);
      gg.addColorStop(0, '#7ff5da'); gg.addColorStop(1, '#00c090');
      ctx.fillStyle = gg; ctx.fillRect(bx, by, w, h);
      // terminal text lines
      ctx.fillStyle = 'rgba(4,20,14,0.55)';
      for (let l = 0; l < 4; l++) ctx.fillRect(bx + 4, by + 4 + l * 6, (w - 8) * (0.5 + 0.5 * Math.abs(Math.sin(t / 500 + l))), 3);
      // glow halo
      ctx.fillStyle = 'rgba(0,224,176,0.14)';
      ctx.beginPath(); ctx.ellipse(x, by + h / 2, w, h, 0, 0, 7); ctx.fill();
    });
    // side data plinths — taller, with a bright holo panel on top
    add(2.0, 2.0, () => { pedestal(ctx, 2.2, 2.2, '#22303f'); holoPanel(ctx, 2.2, 2.2, '#2f8fff', t); });
    add(6.6, 2.0, () => { pedestal(ctx, 6.6, 2.2, '#22303f'); holoPanel(ctx, 6.6, 2.2, '#c9a6ff', t); });
    // THE AGENT — a robot rig, standing before the throne
    add(4.4, 5.6, () => place(ctx, PP, agentRig(PP), 4.5, 5.6, t));
  }

  function holoPanel(ctx, c, r, glow, t) {
    const [x, y] = iso(c, r);
    const px = Math.round(x), py = Math.round(y) - 42;
    // glow halo
    ctx.fillStyle = 'rgba(120,200,255,0.10)';
    ctx.beginPath(); ctx.ellipse(px, py + 9, 20, 14, 0, 0, 7); ctx.fill();
    // panel
    ctx.fillStyle = '#0a1420'; ctx.fillRect(px - 13, py, 26, 20);
    ctx.fillStyle = shade(glow, 0.18 + 0.16 * (Math.sin(t / 450) * 0.5 + 0.5));
    ctx.fillRect(px - 11, py + 2, 22, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let b = 0; b < 3; b++) ctx.fillRect(px - 9, py + 4 + b * 5, 18 * (0.4 + 0.5 * Math.abs(Math.sin(t / 400 + b))), 3);
    ctx.strokeStyle = glow; ctx.lineWidth = 1; ctx.strokeRect(px - 13, py, 26, 20);
  }

  /* ---- placing a PixelPeople character at a tile ------------------------- */
  function place(ctx, PP, rig, col, row, t) {
    if (!PP || !PP.draw) return;
    const [x, y] = iso(col, row);
    // shadow already drawn by PP; scale ~0.9 reads well at this tile size
    PP.draw(ctx, rig, Math.round(x), Math.round(y + TH * 0.5), 0.95, t);
  }
  function pick(PP, names) {
    if (!PP || !PP.PRESETS) return {};
    for (const nm of names) {
      const hit = PP.PRESETS.find(p => p.name === nm);
      if (hit) return Object.assign({ __phase: Math.random() * 6 }, hit.rig);
    }
    return Object.assign({}, PP.PRESETS[0].rig);
  }
  function homeRig(PP) {
    const r = pick(PP, ['Casual', 'Hoodie', 'Elder']);
    r.anim = 'idle'; return r;
  }
  function agentRig(PP) {
    // grab a robot preset (last 10 are robots)
    if (PP && PP.PRESETS) {
      const bots = PP.PRESETS.filter(p => p.rig && p.rig.robot);
      if (bots.length) return Object.assign({ anim: 'idle', __phase: 1.3 }, bots[3 % bots.length].rig);
    }
    return { robot: true, skin: '#8a9199', cap: '#8a9199', shirt: '#2a3a5a', pants: '#2a3a5a', led: '#00e0b0', emblem: '#00e0b0' };
  }

  return {
    TYPES: ['home', 'shop', 'office', 'agent'],
    draw: drawRoom,
    shade,
  };
})();
