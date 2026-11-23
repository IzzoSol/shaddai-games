/* game-fun.js — gameplay upgrade layer for game.html (loaded via defer before </body></html>).
   Adds: real stat points (HP/Attack/Speed/Charm), a pet companion, kill-combo XP,
   a working restHere (full heal + XP), and a togglable world minimap.
   Persistence: localStorage "shaddai.progression".
   Everything is additive + defensive — if any part fails it degrades silently.
   The user's forged pixel character finally matters: stats change how the game plays. */
(function () {
  if (window.__gfLoaded) return; window.__gfLoaded = true;
  var PET_EMOJI = ['🦊', '🌙', '💎', '✨'];
  var PET_COLOR = ['#ffcf5a', '#7fe0ff', '#7fffd0', '#ff9ad5'];
  var PET_NAME = ['Fennec', 'Moth', 'Gemkin', 'Starlit'];
  var STAT_LABEL = {
    hp: ['❤', 'Vitality', '+15 max HP'],
    atk: ['⚔️', 'Might', '+12% attack power'],
    spd: ['💨', 'Swiftness', '+8% move speed'],
    chr: ['✨', 'Charm', '+10% XP earned']
  };
  var PROG_KEY = 'shaddai.progression';
  var PROG = readProg();
  var G_PET = { col: 0, row: 0 };
  var BRIDGE_KEY = 'shaddai.bridge';
  var MONO = null;
  var gfGateNear = false;
  var HUNT = { n: 5, cells: null, used: 0 };

  // ---- persistence ----
  function readProg() {
    var base = { stats: { hp: 0, atk: 0, spd: 0, chr: 0 }, pts: 0, pet: -1, bestCombo: 0, map: false, adopted: false, hunt: null, ctr: null, buffs: {} };
    try {
      var r = JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
      Object.keys(base).forEach(function (k) { if (r[k] !== undefined) base[k] = r[k]; });
      if (!base.stats || typeof base.stats !== 'object') base.stats = { hp: 0, atk: 0, spd: 0, chr: 0 };
      ['hp', 'atk', 'spd', 'chr'].forEach(function (k) { if (typeof base.stats[k] !== 'number' || base.stats[k] < 0) base.stats[k] = 0; });
    } catch (_) {}
    return base;
  }
  function persistProg() {
    try {
      localStorage.setItem(PROG_KEY, JSON.stringify({ stats: PROG.stats, pts: PROG.pts || 0, pet: PROG.pet, map: PROG.map, bestCombo: PROG.bestCombo || 0, adopted: PROG.adopted, hunt: PROG.hunt || null, ctr: PROG.ctr || null, buffs: PROG.buffs || {} }));
    } catch (_) {}
  }
  function applyStats() {
    try {
      if (typeof playerMaxHP === 'undefined') return;
      playerMaxHP = 100 + 15 * (PROG.stats.hp || 0);
      if (playerHP > playerMaxHP) playerHP = playerMaxHP;
      if (typeof updateHP === 'function') updateHP();
    } catch (_) {}
  }

  // ---- speed hook used by game.html movement lines ----
  window.__spdMult = function () { return 1 + 0.08 * (PROG.stats.spd || 0); };

  // ---- pet ----
  function adoptPet() {
    if (PROG.pet >= 0) return;
    PROG.pet = (Math.random() * PET_EMOJI.length) | 0;
    PROG.adopted = true;
    G_PET.col = (player ? player.col : 25) - 1;
    G_PET.row = (player ? player.row : 25) + 1;
    persistProg();
    try { toast('🐾 A tiny ' + PET_NAME[PROG.pet] + ' joins you — +10% XP on everything!'); } catch (_) {}
  }

  // ---- mini-map (screen space, drawn after world renders) ----
  function gfRR(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawMiniMap(time) {
    if (state !== 'world' || spectate) return;
    if (typeof tiles === 'undefined' || typeof GW === 'undefined') return;
    var MS = 104, MPX = 16, MPY = 132, t = MS / GW;
    var low = (typeof LOW !== 'undefined' && LOW);
    var st = low ? 2 : 1, ts = t * st;
    ctx.save();
    gfRR(MPX - 4, MPY - 4, MS + 8, MS + 8, 10);
    ctx.fillStyle = 'rgba(6,9,14,0.84)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,229,160,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,233,168,0.92)';
    ctx.font = '700 9px "Chakra Petch",system-ui,sans-serif';
    ctx.fillText('◉ MINI', MPX + 2, MPY - 8);
    ctx.fillText('[M]', MPX + MS - 20, MPY - 8);
    // terrain
    for (var r = 0; r < GH; r += st) {
      for (var c = 0; c < GW; c += st) {
        var v = (tiles[r] || [])[c];
        var col = 'rgba(255,255,255,0.03)';
        if (v === 1) col = '#1f4f8a';            // WATER
        else if (v === 2) col = '#8a7847';       // SAND
        else if (v === 3) col = '#5c5a48';       // PATH
        else if (v === 4) col = '#5c4632';       // DOCK
        else if (v === 5) col = '#7a3010';       // LAVA
        ctx.fillStyle = col; ctx.fillRect(MPX + c * t, MPY + r * t, ts, ts);
      }
    }
    // buildings / offices / transit
    if (props) for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p.type === 'building' || p.__source || p.kind === 'transit') {
        ctx.fillStyle = (p.__source && p.__office) ? '#e8c45c' : '#4a5a7a';
        ctx.fillRect(MPX + p.col * t - t / 2, MPY + p.row * t - t / 2, t, t);
      }
    }
    // wandering npcs
    if (npcs) { ctx.fillStyle = '#8fa6bf'; for (var n = 0; n < npcs.length; n++) ctx.fillRect(MPX + npcs[n].col * t - 1, MPY + npcs[n].row * t - 1, 2, 2); }
    // enemies
    if (enemies && enemies.length) { ctx.fillStyle = '#ff4f5a'; for (var e = 0; e < enemies.length; e++) ctx.fillRect(MPX + enemies[e].col * t - 1.5, MPY + enemies[e].row * t - 1.5, 3, 3); }
    // player pulse
    var pp = (Math.sin(time / 180) + 1) / 2;
    ctx.fillStyle = 'rgba(0,229,160,' + (0.35 + pp * 0.6).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(MPX + player.col * t, MPY + player.row * t, 2 + pp, 0, 7); ctx.fill();
    ctx.fillStyle = '#00e5a0';
    ctx.fillRect(MPX + player.col * t - 1, MPY + player.row * t - 1, 2, 2);
    ctx.restore();
  }

  // ---- pet companion (world space, below the player draw order) ----
  function drawPet(time) {
    if (state !== 'world' || spectate || PROG.pet < 0) return;
    if (typeof player === 'undefined' || typeof w2s === 'undefined') return;
    // ease toward a spot just behind/left of the player
    G_PET.col += ((player.col - 1) - G_PET.col) * 0.08;
    G_PET.row += ((player.row + 1) - G_PET.row) * 0.08;
    var col = G_PET.col, row = G_PET.row;
    ctx.save();
    ctx.translate(Math.round(W / 2), Math.round(H * 0.42)); ctx.scale(zoom, zoom);
    var pt = w2s(col, row);
    var bob = Math.sin(time / 260 + 2) * 3;
    var x = pt[0], y = pt[1] + bob;
    var petCol = PET_COLOR[PROG.pet];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = petCol;
    ctx.beginPath(); ctx.arc(x, y - 12, 16, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '600 22px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(PET_EMOJI[PROG.pet], x, y + 6);
    ctx.textAlign = 'start';
    ctx.font = '700 9px "Chakra Petch",system-ui,sans-serif';
    ctx.fillStyle = 'rgba(255,233,168,0.85)';
    ctx.fillText(PET_NAME[PROG.pet], x, y - 16);
    // occasional sparkle
    if (Math.random() < 0.03) { try { addChips(col, row, petCol); } catch (_) {} }
    ctx.restore();
  }

  // ---- stat panel ----
  function gfStyle() {
    if (document.getElementById('gfStyle')) return;
    var st = document.createElement('style'); st.id = 'gfStyle';
    st.textContent = '.gfbar{height:6px;background:rgba(255,255,255,.12);border-radius:4px;overflow:hidden;margin-bottom:4px}.gffill{height:100%;background:linear-gradient(90deg,#5fe0ff,#00e5a0);border-radius:4px}';
    document.head.appendChild(st);
  }
  function gfRowHTML(k) {
    var l = STAT_LABEL[k], v = PROG.stats[k] || 0;
    return '<div style="background:#0d1420;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:7px 9px;margin-bottom:6px;display:flex;align-items:center;gap:8px">' +
      '<div style="font-size:18px">' + l[0] + '</div>' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:700">' + l[1] + '</div><div style="font-size:10px;color:#5a6a7a">' + l[2] + '</div></div>' +
      '<div style="text-align:center"><div style="font-size:15px;color:#5fe0ff;font-weight:800">' + v + '</div>' +
      '<button onclick="gfAlloc(\'' + k + '\')" style="margin-top:2px;width:26px;height:22px;background:' + (PROG.pts > 0 ? '#00e5a0;color:#06080b' : 'rgba(255,255,255,.12);color:#5a6a7a') + ';border:none;border-radius:5px;font-weight:800;cursor:' + (PROG.pts > 0 ? 'pointer' : 'default') + '">+</button></div></div>';
  }
  function gfBuild() {
    var el = document.getElementById('gfPanel'); if (!el) return;
    var L = levelFor(credits), cur = 45 * (L - 1) * (L - 1), next = 45 * L * L, into = credits - cur, pct = Math.max(0, Math.min(100, into / (next - cur) * 100));
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:15px;letter-spacing:.06em">✨ STATS</b><button onclick="gfClose()" style="background:none;border:1px solid rgba(255,255,255,.2);color:#9fb2c4;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:12px">✕</button></div>';
    h += '<div class="gfbar"><div class="gffill" style="width:' + pct.toFixed(0) + '%"></div></div>';
    h += '<div style="font-size:11px;color:#9fb2c4;margin:2px 0 8px">Lv ' + L + ' · <span style="color:#5fe0ff">' + into + '</span>/' + next + ' XP · <b style="color:#ffe9a8">🎯 ' + (PROG.pts || 0) + ' pt</b></div>';
    ['hp', 'atk', 'spd', 'chr'].forEach(function (k) { h += gfRowHTML(k); });
    if (PROG.pet >= 0) {
      h += '<div style="display:flex;align-items:center;gap:8px;background:#10241c;border:1px solid rgba(0,229,160,.2);border-radius:8px;padding:7px 9px;margin-top:8px">' +
        '<div style="font-size:20px">' + PET_EMOJI[PROG.pet] + '</div>' +
        '<div style="flex:1"><div style="font-size:12px;font-weight:700">' + PET_NAME[PROG.pet] + '</div><div style="font-size:10px;color:#5a8a72">+10% XP on everything</div></div>' +
        '<button onclick="gfPet()" style="background:none;border:1px solid rgba(0,229,160,.4);color:#00e5a0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px">Switch</button></div>';
    } else {
      h += '<div style="background:#141a26;border:1px dashed rgba(255,255,255,.14);border-radius:8px;padding:7px 9px;margin-top:8px;font-size:11px;color:#5a6a7a">🐾 Reach <b style="color:#9fb2c4">Level 2</b> and a wild companion will adopt you (+10% XP).</div>';
    }
    h += '<div style="font-size:10px;color:#5a6a7a;margin-top:8px;line-height:1.5">⚡ Best combo: <span style="color:#ffe14a;font-weight:700">' + (PROG.bestCombo || 0) + '×</span><br>Press <b style="color:#9fb2c4">P</b> to toggle · <b style="color:#9fb2c4">M</b> for the map</div>';
    el.innerHTML = h;
  }
  function gfPanelEl() {
    var el = document.getElementById('gfPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gfPanel'; el.className = 'panel hide';
      el.style.cssText = 'position:fixed;right:16px;top:64px;width:min(300px,calc(100vw - 32px));max-height:72vh;overflow:auto;padding:14px 16px;z-index:60';
      document.body.appendChild(el);
    }
    return el;
  }
  function gfToggle() { gfStyle(); var el = gfPanelEl(); el.classList.toggle('hide'); gfBuild(); }
  function gfClose() { var el = document.getElementById('gfPanel'); if (el) el.classList.add('hide'); }
  function gfAlloc(k) {
    if (!PROG.pts || PROG.pts < 1) { try { toast('🎯 No stat points yet — earn XP to level up!'); } catch (_) {} return; }
    if (!PROG.stats[k] && PROG.stats[k] !== 0) return;
    PROG.pts -= 1; PROG.stats[k] = (PROG.stats[k] || 0) + 1;
    persistProg(); applyStats();
    try { toast(STAT_LABEL[k][0] + ' ' + STAT_LABEL[k][1] + ' +1'); } catch (_) {}
    gfBuild();
  }
  function gfPet() {
    if (PROG.pet < 0) return;
    PROG.pet = (PROG.pet + 1) % PET_EMOJI.length;
    persistProg();
    try { toast('🐾 Your companion is now a ' + PET_NAME[PROG.pet] + '!'); } catch (_) {}
    gfBuild();
  }

  // ---- global entry points for inline onclick ----
  window.gfAlloc = gfAlloc; window.gfPet = gfPet; window.gfToggle = gfToggle; window.gfClose = gfClose;

  // ---- key bindings (P / M), guarded against typing ----
  function gfKeys(e) {
    if (!window.state) return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    var k = (e.key || '').toLowerCase();
    if (k === 'p') { e.preventDefault(); gfToggle(); }
    else if (k === 'm') {
      PROG.map = !PROG.map; persistProg();
      try { toast(PROG.map ? '🗺 World map on (M to hide)' : '🗺 World map off'); } catch (_) {}
    }
    else if (k === 'g') { gfWarp(); }
    else if (k === 'h') { gfHuntToggle(); }
    else if (k === 'v') { gfVaultToggle(); }
    else if (k === 'q') { gfMerchToggle(); }
    else if (k === 'f') {
      if (window.DarkRealm && window.DarkRealm.campToggle) {
        e.preventDefault();
        DarkRealm.campToggle();
      }
    }
  }

  // ---- wrap core functions (game.html top-level function declarations = window props) ----
  var _axRaw = null, _rawSave = null, _rawWeapon = null, _rawAttack = null, _rawRest = null, _rawUpdate = null, _rawRW = null, _rawWallet = null, _rawDoJob = null, _rawMarket = null, _rawSellFish = null, _rawBuyW = null;
  function wire() {
    if (window.__gfWired) return; window.__gfWired = true;

    _axRaw = window.addXP;
    window.addXP = function (n) {
      if (typeof n !== 'number' || !(n > 0)) { if (_axRaw) _axRaw(n); return; }
      var b = levelFor(credits);
      var charm = ((PROG.buffs || {}).charm || 0) > Date.now();
      var mult = (1 + 0.10 * (PROG.stats.chr || 0)) * (PROG.pet >= 0 ? 1.10 : 1) * (charm ? 1.2 : 1);
      if (_axRaw) _axRaw(Math.round(n * mult));
      var nl = levelFor(credits);
      var gained = nl - b;
      if (gained > 0) {
        PROG.pts = (PROG.pts || 0) + gained;
        persistProg(); applyStats();
        try { toast('⭐ Level ' + nl + '! +' + gained + ' stat point' + (gained > 1 ? 's' : '') + ' — press P to spend.'); } catch (_) {}
      }
      if (PROG.pet < 0 && nl >= 2) adoptPet();
      gfBuild();
    };

    _rawSave = window.saveEcon;
    window.saveEcon = function () { if (_rawSave) _rawSave(); persistProg(); };

    _rawWeapon = window.weaponPower;
    window.weaponPower = function () { var w = _rawWeapon ? _rawWeapon() : 1; return w * (1 + 0.12 * (PROG.stats.atk || 0)); };

    _rawAttack = window.doAttack;
    window.doAttack = function () {
      var before = (enemies && enemies.length) || 0;
      try { if (_rawAttack) _rawAttack(); } catch (_) {}
      var after = (enemies && enemies.length) || 0;
      var killed = before - after;
      if (killed > 0) {
        PROG.combo = (PROG.combo || 0) + killed;
        PROG.cbt = 6;
        PROG.bestCombo = Math.max(PROG.bestCombo || 0, PROG.combo);
        var bonus = Math.min(PROG.combo, 10) * 2;
        if (bonus > 0 && _axRaw) {
          _axRaw(bonus);
          try { if (state === 'world') addFloat(player.col, player.row, '⚡ ' + PROG.combo + '× COMBO +' + bonus + ' XP', '#ffe14a'); } catch (_) {}
        }
        try { gfCnt('kills'); } catch (_) {}
        try { if ((PROG.buffs || {}).ember > 0) { var paid = Math.min(PROG.buffs.ember, killed); PROG.buffs.ember -= paid; gfSparkAdd('ember', paid, 'ember sigil burns'); try { addFloat(player.col, player.row, '🔥 +' + paid + '⚡', '#ffb06a'); } catch (_) {} } } catch (_) {}
        persistProg();
      } else {
        PROG.combo = 0;
      }
    };

    _rawRest = window.restHere;
    window.restHere = function () {
      if (_rawRest) _rawRest();
      try {
        playerHP = playerMaxHP;
        updateHP();
        if (_axRaw) _axRaw(5);
        if (state === 'world') {
          addFloat(player.col, player.row, '+5 XP', '#4fe07a');
          addChips(player.col, player.row, '#4fe07a');
        }
        toast('😴 You rest a while… fully healed. (+5 XP)');
      } catch (_) {}
    };

    _rawUpdate = window.update;
    window.update = function (dt) {
      try { if (_rawUpdate) _rawUpdate(dt); } catch (_) {}
      if (PROG.cbt > 0) { PROG.cbt -= dt; if (PROG.cbt <= 0) PROG.combo = 0; }
      var bu = PROG.buffs;
      if (bu && bu.charm && bu.charm <= Date.now()) { delete bu.charm; persistProg(); }
    };

    _rawRW = window.renderWorld;
    window.renderWorld = function (time) {
      try { if (_rawRW) _rawRW(time); } catch (_) {}
      try { drawPet(time); } catch (_) {}
      try { gfDrawMonolith(time); } catch (_) {}
      try { gfDrawAstra(time); } catch (_) {}
      try { if (PROG.map) drawMiniMap(time); } catch (_) {}
    };

    _rawWallet = window.updateWallet;
    window.updateWallet = function () {
      try { if (_rawWallet) _rawWallet(); } catch (_) {}
      var el = document.getElementById('wallet'); if (!el) return;
      var bits = [];
      if (PROG.pet >= 0) bits.push('🐾 +10% XP');
      if (PROG.pts && PROG.pts > 0) bits.push('🎯 ' + PROG.pts + ' pt');
      if (PROG.combo && PROG.combo >= 2) bits.push('⚡' + PROG.combo + '×');
      var bu = PROG.buffs || {};
      if (bu.charm && bu.charm > Date.now()) bits.push('✨ XP×1.2');
      if (bu.ember > 0) bits.push('🔥+' + bu.ember + '⚡');
      if (bits.length) el.innerHTML += '<span style="font-size:10px;color:#ffe9a8">' + bits.join(' · ') + '</span>';
      el.innerHTML += '<div style="font-size:11px;color:#e8c45c;font-weight:700;margin-top:2px">⚡ ' + gfSparkBal() + ' sparks</div>';
    };

    _rawDoJob = window.doJob;
    window.doJob = function () { try { if (_rawDoJob) _rawDoJob(); } catch (_) {} try { gfCnt('jobs'); } catch (_) {} };

    _rawMarket = window.openMarket;
    window.openMarket = function () { try { if (_rawMarket) _rawMarket(); } catch (_) {} try { gfCnt('market'); } catch (_) {} };

    _rawSellFish = window.sellFish;
    window.sellFish = function () { try { if (_rawSellFish) _rawSellFish(); } catch (_) {} try { gfCnt('fish'); } catch (_) {} };

    _rawBuyW = window.buy;
    window.buy = function (id) { try { if (_rawBuyW) _rawBuyW(id); } catch (_) {} try { gfCnt('shop'); } catch (_) {} };

    addEventListener('keydown', gfKeys);
  }

  // ============ 2D⇄3D REALM GATE ============
  function gfReadTicket() { try { return JSON.parse(localStorage.getItem(BRIDGE_KEY) || 'null'); } catch (_) { return null; } }
  function gfWriteTicket(t) { try { localStorage.setItem(BRIDGE_KEY, JSON.stringify(t)); } catch (_) {} }
  function gfClearTicket() { try { localStorage.removeItem(BRIDGE_KEY); } catch (_) {} }
  function gfRegionId() { try { return (typeof region !== 'undefined' && region && region.id) ? region.id : (localStorage.getItem('shaddai.region') || 'agentcity'); } catch (_) { return 'agentcity'; } }
  function gfCharName() { try { if (typeof player !== 'undefined' && player && player.name) return player.name; var p = JSON.parse(localStorage.getItem('shaddai.player') || 'null'); return (p && p.name) || 'Wanderer'; } catch (_) { return 'Wanderer'; } }

  function gfTo3D() {
    var c = -1, r = -1;
    try { if (typeof player !== 'undefined' && player) { c = Math.round(player.col); r = Math.round(player.row); } } catch (_) {}
    gfWriteTicket({ from: '2d', region: gfRegionId(), col: c, row: r, name: gfCharName(), ts: Date.now() });
    try { toast('⛩ Opening the realm gate…'); } catch (_) {}
    setTimeout(function () { location.href = '/world3d'; }, 350);
  }

  function gfGateBtn() {
    try {
      var tb = document.getElementById('topbtns'); if (!tb || tb.querySelector('#gfGate3d')) return;
      var b = document.createElement('button');
      b.id = 'gfGate3d';
      b.className = 'panel';
      b.style.cssText = 'padding:9px 13px;border-color:rgba(95,224,255,.45);color:#5fe0ff;font-weight:700';
      b.textContent = '⛩ 3D Realm';
      b.onclick = gfTo3D;
      tb.appendChild(b);
    } catch (_) {}
  }

  function gfFindMonolith() {
    try {
      if (typeof props === 'undefined' || typeof tiles === 'undefined' || typeof GW === 'undefined' || typeof GH === 'undefined') return null;
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p && p.landmark) return { col: Math.round(p.col + ((p.w || 1) / 2) + 2), row: Math.round(p.row + ((p.d || 1) / 2) - 2) };
      }
      if (typeof walkable !== 'function') return null;
      var cx = (GW / 2) | 0, cy = (GH / 2) | 0;
      for (var d = 3; d < 16; d++) for (var a = 0; a < 24; a++) {
        var c = Math.round(cx + Math.sin(a * Math.PI / 12) * d), rr = Math.round(cy + Math.cos(a * Math.PI / 12) * d);
        if (walkable(c, rr)) return { col: c, row: rr };
      }
      return null;
    } catch (_) { return null; }
  }

  function gfDrawMonolith(time) {
    try {
      if (state !== 'world' || spectate) { gfGateNear = false; return; }
      if (typeof walkable === 'function') {
        if (MONO && !walkable(MONO.col, MONO.row)) MONO = null;
        if (!MONO) MONO = gfFindMonolith();
      }
      if (!MONO) return;
      var pt; try { pt = w2s(MONO.col, MONO.row); } catch (_) { return; }
      var x = pt[0], y = pt[1];
      var pulse = (Math.sin(time / 420) + 1) / 2;
      ctx.save();
      ctx.translate(Math.round(W / 2), Math.round(H * 0.42)); ctx.scale(zoom, zoom);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 + pulse * 0.28;
      ctx.fillStyle = '#5fe0ff';
      ctx.beginPath(); ctx.arc(x, y - 6, 26 + pulse * 10, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0e1a2a';
      ctx.fillRect(x - 7, y - 27, 14, 35);
      ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = 2;
      ctx.strokeRect(x - 7, y - 27, 14, 35);
      ctx.fillStyle = '#5fe0ff';
      ctx.font = '600 11px "Chakra Petch",system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('3D', x, y - 13);
      ctx.globalAlpha = 0.55 + pulse * 0.45;
      ctx.font = '700 8px "Chakra Petch",system-ui,sans-serif';
      ctx.fillText('GATE', x, y - 3);
      ctx.globalAlpha = 1; ctx.fillStyle = '#00e5a0';
      ctx.font = '600 9px "Chakra Petch",system-ui,sans-serif';
      ctx.fillText('⛩ G', x, y + 11);
      ctx.textAlign = 'start';
      ctx.restore();
      gfGateNear = (typeof player !== 'undefined' && player) ? Math.hypot(player.col - MONO.col, player.row - MONO.row) < 2.4 : false;
      if (gfGateNear && Math.random() < 0.05) { try { addChips(MONO.col, MONO.row, '#5fe0ff'); } catch (_) {} }
    } catch (_) {}
  }

  function gfWarp() {
    try {
      if (typeof player === 'undefined' || !player) { gfTo3D(); return; }
      if (!gfGateNear) { toast('The ⛩ 3D Gate glows somewhere out there — find the blue pillar!'); return; }
      gfTo3D();
    } catch (_) {}
  }

  function gfRestoreFrom3D() {
    var t = gfReadTicket();
    if (!t || t.from !== '3d') return;
    gfClearTicket();
    var apply = function () {
      try {
        if (!player) return false;
        var c = Math.round(t.col), r = Math.round(t.row);
        if (c > 0 && r > 0 && typeof walkable === 'function' && walkable(c, r)) {
          player.col = c; player.row = r;
          try { if (typeof cam !== 'undefined' && cam) { cam.col = c; cam.row = r; } } catch (_) {}
        }
        toast('⛩ Back from the 3D realm!' + (t.name ? ' (' + t.name + ')' : ''));
        try { addFloat(player.col, player.row, '⛩ 3D → 2D', '#5fe0ff'); } catch (_) {}
        return true;
      } catch (_) { return false; }
    };
    if (apply()) return;
    var tt = 0; var iv = setInterval(function () { tt++; if (apply() || tt > 40) clearInterval(iv); }, 300);
  }

  // ============ HUNT GRID (TURTLE #2) ============
  var HUNT_ICON = { empty: '·', gold: '💵', xp: '✦', hide: '🟫', chest: '🏆' };
  var HUNT_COLOR = { empty: '#5a6a7a', gold: '#ffe9a8', xp: '#7ffcd0', hide: '#e8c45c', chest: '#ffe14a' };
  function gfHuntSeed(silent) {
    var arr = [];
    for (var i = 0; i < 25; i++) {
      var roll = Math.random(), kind = 'empty';
      if (roll >= 0.55 && roll < 0.73) kind = 'gold';
      else if (roll >= 0.73 && roll < 0.85) kind = 'xp';
      else if (roll >= 0.85 && roll < 0.93) kind = 'hide';
      else if (roll >= 0.93) kind = 'chest';
      arr.push({ k: kind, done: false });
    }
    HUNT.cells = arr; HUNT.used = 0;
    PROG.hunt = arr.map(function (c) { return { k: c.k, done: c.done }; });
    persistProg();
    if (!silent) { try { toast('🗺 A fresh hunting ground takes root!'); } catch (_) {} }
  }
  function gfHuntEnsure() {
    if (HUNT.cells && HUNT.cells.length === 25) return;
    if (PROG.hunt && Array.isArray(PROG.hunt) && PROG.hunt.length === 25) {
      HUNT.cells = PROG.hunt.map(function (c) { return { k: c.k, done: !!c.done }; });
      HUNT.used = HUNT.cells.filter(function (c) { return c.done; }).length;
      return;
    }
    gfHuntSeed(true);
  }
  function gfHuntReveal(i) {
    try {
      if (state !== 'world') { toast('Enter the world to hunt'); return; }
      gfHuntEnsure();
      var c = HUNT.cells[i]; if (!c || c.done) return;
      c.done = true; HUNT.used++;
      var got = '', col = '#7ffcd0';
      if (c.k === 'gold') { var g = 5 + ((Math.random() * 12) | 0); var lucky = (PROG.buffs || {}).lucky > 0; if (lucky) { g *= 2; PROG.buffs.lucky--; } money = (money || 0) + g; got = '+💵' + g + (lucky ? ' LUCKY!' : ''); col = '#ffe9a8'; }
      else if (c.k === 'xp') { var x = 8 + ((Math.random() * 16) | 0); addXP(x); got = '+' + x + ' XP'; }
      else if (c.k === 'hide') { inv.hide = (inv.hide || 0) + 1; got = '+1 🟫 hide'; col = '#e8c45c'; }
      else if (c.k === 'chest') { var g2 = 12 + ((Math.random() * 16) | 0), x2 = 15 + ((Math.random() * 20) | 0); money = (money || 0) + g2; addXP(x2); got = '🏆 +💵' + g2 + ' · +' + x2 + ' XP'; col = '#ffe14a'; }
      else got = 'just shrubbery…';
      try { saveEcon(); persistProg(); } catch (_) {}
      try { if (player) addFloat(player.col, player.row, got, col); } catch (_) {}
      if (c.k !== 'empty') toast('🌿 ' + got);
      gfHuntBuild();
      if (HUNT.used >= 25) setTimeout(function () { toast('🗺 Ground cleared — reseed the hunt!'); }, 600);
    } catch (_) {}
  }
  function gfHuntCell(i) {
    var c = HUNT.cells[i];
    var ico = HUNT_ICON[c.k], col = HUNT_COLOR[c.k];
    var box = 'width:46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:17px';
    if (c.done) return '<div style="' + box + ';background:#0f1826;border:1px solid rgba(255,255,255,.06);color:' + col + '">' + ico + '</div>';
    return '<button onclick="gfHunt(\'' + i + '\')" style="' + box + ';background:linear-gradient(160deg,#12202f,#0c1420);border:1px solid rgba(0,229,160,.25);color:#7ffcd0;font-weight:800;cursor:pointer">?</button>';
  }
  function gfHuntBuild() {
    var el = document.getElementById('gfHunt'); if (!el) return;
    gfHuntEnsure();
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:14px;letter-spacing:.06em">🗺 HUNT GROUND</b><button onclick="gfHunt(\'close\')" style="background:none;border:1px solid rgba(255,255,255,.2);color:#9fb2c4;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:12px">✕</button></div>';
    h += '<div style="font-size:11px;color:#9fb2c4;margin-bottom:8px">Tap a tile to see what the wilds hid · <b style="color:#00e5a0">' + HUNT.used + '</b>/25 cleared</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;justify-content:center">';
    for (var i = 0; i < 25; i++) h += gfHuntCell(i);
    h += '</div>';
    h += '<button onclick="gfHunt(\'seed\')" style="margin-top:9px;width:100%;padding:7px;background:rgba(18,32,47,.8);border:1px solid rgba(0,229,160,.35);color:#00e5a0;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer">🌱 Reseed hunting ground</button>';
    el.innerHTML = h;
  }
  function gfHuntToggle() {
    var el = document.getElementById('gfHunt');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gfHunt'; el.className = 'panel';
      el.style.cssText = 'position:fixed;left:16px;top:200px;width:264px;max-height:82vh;overflow:auto;padding:14px 16px;z-index:60';
      document.body.appendChild(el);
    }
    el.classList.toggle('hide');
    gfHuntBuild();
  }
  window.gfHunt = function (arg) {
    if (arg === 'close') { var el = document.getElementById('gfHunt'); if (el) el.classList.add('hide'); }
    else if (arg === 'seed') { gfHuntSeed(false); gfHuntBuild(); }
    else gfHuntReveal(parseInt(arg, 10));
  };

  // ============ ⚡ SPARK ECONOMY (reserve currency, 1⚡ ≈ $1) ============
  // Shared wallet across realms + a real ledger so fees, subscriptions, asset
  // equity and a future token all have one auditable source of truth.
  var SPARK_KEY = 'shaddai.sparks';
  var LOG_KEY = 'shaddai.sparklog';
  var META_KEY = 'shaddai.sparkmeta';
  var ASSET_KEY = 'shaddai.sparkassets';
  var ASSET_DEF = {
    den: ['🛖', 'Studio Den', 6],
    office: ['🏢', 'Workspace Office', 10],
    house: ['🏡', 'Hearth House', 16],
    villa: ['⚜️', 'Lantern Villa', 25]
  };
  var ASTRA = null;
  var gfMerchNear = false;

  function gfDayNum() { return Math.floor(Date.now() / 86400000); }
  function gfRng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gfVar(seedKey, lo, hi) { var r = gfRng(gfDayNum() * 7919 + seedKey)(); return lo + Math.floor(r * (hi - lo + 1)); }

  // ---- wallet / ledger ----
    // ============================================================
  //  ACHIEVEMENTS — one ledger, everywhere (Sparks economy)
  //  every 2D count feeds gfAchTrack → threshold unlock → gfSparkAdd
  //  → gfLog → shd_tx_history + shd_sparks mirror (same wallet).
  // ============================================================
  var ACH_KEY = 'shaddai.ach';
  var ACH_CAPS = { kills: 4, jobs: 7, market: 4, shop: 1, fish: 3, yarn: 1, mine: 3, forge: 1 };

  function gfAchLoad() { try { var a = JSON.parse(localStorage.getItem(ACH_KEY) || 'null'); if (a && a.u && a.c) return { u: a.u, c: a.c, l: a.c || {} }; } catch (_) {} return { u: {}, c: { kills: 0, jobs: 0, market: 0, shop: 0, fish: 0, yarn: 0, mine: 0, forge: 0 }, l: {} }; }
  function gfAchSave(a) { try { localStorage.setItem(ACH_KEY, JSON.stringify(a)); } catch (_) {} }

  function gfAchTrack(key, n) {
    try {
      var a = gfAchLoad(); if (!a.c) a.c = {};
      a.c[key] = Math.min((a.c[key] || 0) + (n || 0), (ACH_CAPS[key] || 999) * 20);
      gfAchSave(a); persistProg();
      // tiered unlock scan
      var tiers = {
        kills: [1, 25, 75], jobs: [10, 50, 130], market: [5, 30, 80],
        shop: [1, 4, 8], fish: [10, 30, 50], yarn: [1, 4, 8],
        mine: [20, 50, 60], forge: [1, 3, 6]
      };
      var tArr = tiers[key] || [];
      for (var ti = 0; ti < tArr.length; ti++) {
        if ((a.c[key] || 0) >= tArr[ti]) {
          var bid = key + '_' + (ti + 1);
          if (a.u && !a.u[bid]) { a.u[bid] = { ts: Date.now(), tier: ti + 1, key: key }; gfSparkAdd('ach', 5 + ti * 5, '🏅 ' + bid); }
        }
      }
      gfAchSave(a);
    } catch (_) {}
  }

  function gfAchUnlock(bid, note) {
    try {
      var a = gfAchLoad(); if (a.u && a.u[bid]) return;
      a.u[bid] = { ts: Date.now(), note: note || '' }; gfAchSave(a);
      gfSparkAdd('ach', 25, '🏅 ' + bid + (note ? ' — ' + note : ''));
    } catch (_) {}
  }

  function gfAchList() { try { var a = gfAchLoad(); return Object.keys(a.u || {}).map(function (k) { return { id: k, ts: a.u[k].ts, tier: a.u[k].tier, key: a.u[k].key }; }); } catch (_) { return []; } }
  function gfAchCount() { try { return gfAchList().length; } catch (_) { return 0; } }

  // dashboard mirror — achievements count + last unlock written to the
  // single wallet keys the dashboard economy tab already reads
  function gfMirror() {
    try {
      var a = gfAchList();
      localStorage.setItem('shd_achievements', JSON.stringify(a));
      localStorage.setItem('shd_ach_count', String(a.length));
    } catch (_) {}
  }
  // wire mirror into the spark ledger so balance + history + ach all align
  var __gfMirrorWired = false;
  function gfWireMirror() {
    if (__gfMirrorWired) return; __gfMirrorWired = true;
    // nothing heavy, mirror is invoked from gfLog/gfSparkSet below via commit hook
  }

  function gfSparkBal() { try { var n = parseInt(localStorage.getItem(SPARK_KEY), 10); if (isFinite(n) && n > 0) { return n; } } catch (_) {} return 0; }

  function gfSparkSet(n) { try { localStorage.setItem(SPARK_KEY, String(Math.max(0, Math.round(n) || 0)));
    // mirror to dashboard single-wallet keys so the SAME ledger shows everywhere
    try { localStorage.setItem('shd_sparks', String(Math.max(0, Math.round(n) || 0))); } catch (_) {}
    try { localStorage.setItem('shd_max_sparks', String(Math.max(Number(localStorage.getItem('shd_max_sparks') || 0), Math.max(0, Math.round(n) || 0)))); } catch (_) {}
  } catch (_) {} }
  function gfMeta() { var m = { issued: 0, burned: 0, fee: 0, footprint: 0, daily: -1, sub: false, subMonth: 0 }; try { var r = JSON.parse(localStorage.getItem(META_KEY) || '{}'); for (var k in m) if (typeof r[k] === 'number' || typeof r[k] === 'boolean') m[k] = r[k]; } catch (_) {} return m; }
  function gfMetaSave(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (_) {} }
  function gfLog(kind, amt, note) { try { var a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); a.push({ t: Date.now(), k: kind, a: Math.round(amt) || 0, n: note || '' }); if (a.length > 200) a = a.slice(-200); localStorage.setItem(LOG_KEY, JSON.stringify(a));
    // mirror the SAME ledger row into the dashboard single-wallet key
    try { var h = JSON.parse(localStorage.getItem('shd_tx_history') || '[]'); h.push({ t: Date.now(), type: kind, amount: Math.round(amt) || 0, note: note || '' }); if (h.length > 200) h = h.slice(-200); localStorage.setItem('shd_tx_history', JSON.stringify(h)); } catch (_) {}
    try { gfMirror(); } catch (_) {}
  } catch (_) {} }
  function gfSparkAdd(kind, n, note) {
    if (!(n > 0)) return;
    gfSparkSet(gfSparkBal() + n);
    var m = gfMeta(); m.issued += n; m.footprint += n; gfMetaSave(m);
    gfLog(kind, n, note);
    try { if (window.__w3 && window.__w3.save && window.__w3.hud) { window.__w3.save.sparks = gfSparkBal(); window.__w3.hud(); } } catch (_) {}
  }
  function gfSparkSpend(kind, n, note) {
    if (!(n > 0)) return false;
    if (gfSparkBal() < n) { try { toast('Not enough ⚡ sparks'); } catch (_) {} return false; }
    gfSparkSet(gfSparkBal() - n);
    var m = gfMeta(); m.burned += n; m.footprint += n; if (kind === 'fee') m.fee += n; gfMetaSave(m);
    gfLog(kind, -n, note);
    try { if (window.__w3 && window.__w3.save && window.__w3.hud) { window.__w3.save.sparks = gfSparkBal(); window.__w3.hud(); } } catch (_) {}
    return true;
  }

  // ---- exchange (gold ⇄ sparks) ----
  function gfRate() { return gfVar(101, 19, 23); }
  function gfExchange(kind, amt) {
    try {
      if (typeof money === 'undefined') return;
      if (kind === 'buy') {
        amt = amt === 'max' ? Math.floor(money / gfRate()) : amt;
        amt = Math.max(0, Math.floor(amt)); if (!amt) { toast('Need gold to mint sparks'); return; }
        var cost = amt * gfRate(); if (money < cost) { amt = Math.floor(money / gfRate()); if (!amt) { toast('Not enough gold'); return; } cost = amt * gfRate(); }
        money -= cost; gfSparkAdd('xbuy', Math.floor(amt * 0.99), 'mint ' + amt + '⚡ @ ' + gfRate() + '💵/⚡'); gfSparkSpend('fee', Math.ceil(amt * 0.01), 'mint fee');
        saveEcon(); toast('⛏ Minted ⚡' + Math.floor(amt * 0.99) + ' for 💵' + cost);
      } else {
        amt = amt === 'max' ? gfSparkBal() : amt;
        amt = Math.max(0, Math.floor(amt)); if (!amt) { toast('No sparks to sell'); return; }
        var g = amt * Math.max(8, gfRate() - 3);
        if (gfSparkSpend('xsell', amt, 'sell to gold @ ' + g + '💵')) { money = (money || 0) + g; saveEcon(); toast('💰 Sold ⚡' + amt + ' for 💵' + g); }
      }
      gfVaultBuild();
    } catch (_) {}
  }

  // ---- travel merchant ASTRA ----
  function gfPlaceAstra() {
    try {
      if (typeof tiles === 'undefined' || typeof walkable !== 'function') return null;
      if (!MONO) MONO = gfFindMonolith();
      if (MONO) {
        if (walkable(MONO.col + 2, MONO.row + 3)) return { col: MONO.col + 2, row: MONO.row + 3 };
        if (walkable(MONO.col - 3, MONO.row + 2)) return { col: MONO.col - 3, row: MONO.row + 2 };
      }
      var cx = (typeof GW !== 'undefined' ? GW / 2 : 40) | 0, cy = (typeof GH !== 'undefined' ? GH / 2 : 40) | 0;
      for (var d = 4; d < 18; d++) for (var a = 0; a < 24; a++) { var c = Math.round(cx + Math.sin(a) * d), r = Math.round(cy + Math.cos(a) * d); if (walkable(c, r)) return { col: c, row: r }; }
      return null;
    } catch (_) { return null; }
  }
  function gfAstraStock() {
    var pool = [
      ['ember', '🔥 Ember Sigil', 8, 'next kills pay ⚡ per kill'],
      ['lucky', '🍀 Lucky Coin', 10, 'next hunt gold doubled'],
      ['charm', '✨ Moonglass Charm', 15, '+20% XP for 15 min'],
      ['dust', '🌟 Glimmer Dust', 6, 'instantly earns ⚡6']
    ];
    var s = [], used = {};
    for (var i = 0; i < 4; i++) { var j = gfVar(202 + i, 0, 100) % pool.length; if (used[j]) continue; used[j] = 1; s.push(pool[j]); }
    return s.slice(0, 3);
  }
  function gfAstraGoods() {
    var rep = [];
    try {
      var invv = typeof inv !== 'undefined' ? inv : {};
      var fishObj = typeof fish !== 'undefined' ? fish : {};
      var push = function (k, ico, n, unit) { n = parseFloat(n) || 0; if (n > 0) rep.push({ k: k, ico: ico, n: n, unit: unit }); };
      push('wood', '🪵', invv.wood, 0.3);
      push('stone', '🪨', invv.stone, 0.45);
      push('hide', '🟫', invv.hide, 0.9);
      if (FISH) for (var i = 0; i < FISH.length; i++) { var f = FISH[i]; var cnt = fishObj[f.id] || 0; if (cnt > 0) push(f.id, f.ico, cnt, Math.max(0.4, f.val / 14)); }
      var fb = (typeof fishBonus === 'number') ? fishBonus : 0; if (fb > 0) push('bonus', '🔥', fb, 0.04);
    } catch (_) {}
    return rep;
  }
  function gfMerchSell(k) {
    try {
      var rep = gfAstraGoods(); var it = null; for (var i = 0; i < rep.length; i++) if (rep[i].k === k) it = rep[i];
      if (!it) return;
      var gain = Math.floor(it.n * it.unit * 10) / 10; if (gain < 1) gain = 1; gain = Math.floor(gain);
      if (k === 'wood') inv.wood = 0; else if (k === 'stone') inv.stone = 0; else if (k === 'hide') inv.hide = 0;
      else if (k === 'bonus') fishBonus = 0; else if (FISH) { fish[k] = 0; }
      gfSparkAdd('merchant', gain, 'sold to ASTRA @' + k);
      saveEcon(); toast('⚖️ ASTRA pays ⚡' + gain + ' for your goods');
      gfMerchBuild();
    } catch (_) {}
  }
  function gfMerchBuy(id) {
    try {
      var s = gfAstraStock(); var it = null; for (var i = 0; i < s.length; i++) if (s[i][0] === id) it = s[i];
      if (!it) return;
      if (!gfSparkSpend('merchant', it[2], 'bought ' + it[1])) return;
      PROG.buffs = PROG.buffs || {};
      if (id === 'ember') PROG.buffs.ember = (PROG.buffs.ember || 0) + 10;
      else if (id === 'lucky') PROG.buffs.lucky = (PROG.buffs.lucky || 0) + 6;
      else if (id === 'charm') PROG.buffs.charm = Date.now() + 15 * 60000;
      else if (id === 'dust') gfSparkAdd('dust', 6, 'glimmer dust');
      persistProg();
      toast('🛍 ' + it[1] + ' — ' + it[3]);
      gfMerchBuild(); gfVaultBuild();
    } catch (_) {}
  }
  function gfDrawAstra(time) {
    try {
      if (state !== 'world' || spectate) { gfMerchNear = false; return; }
      if (typeof w2s === 'undefined' || typeof walkable !== 'function') return;
      if (!ASTRA && !(ASTRA = gfPlaceAstra())) return;
      if (!walkable(ASTRA.col, ASTRA.row)) ASTRA = gfPlaceAstra();
      if (!ASTRA) return;
      var pt; try { pt = w2s(ASTRA.col, ASTRA.row); } catch (_) { return; }
      var x = pt[0], y = pt[1], pulse = (Math.sin(time / 240) + 1) / 2;
      ctx.save();
      ctx.translate(Math.round(W / 2), Math.round(H * 0.42)); ctx.scale(zoom, zoom);
      ctx.fillStyle = 'rgba(14,21,35,.55)';
      ctx.fillRect(x - 13, y - 4, 26, 12);
      ctx.strokeStyle = '#e8c45c'; ctx.lineWidth = 2; ctx.strokeRect(x - 13, y - 4, 26, 12);
      ctx.fillStyle = '#e8c45c'; ctx.beginPath();
      ctx.moveTo(x - 13, y - 4); ctx.lineTo(x - 8, y - 9); ctx.lineTo(x - 2, y - 4); ctx.fill();
      ctx.fillStyle = '#5fe0ff'; ctx.beginPath();
      ctx.moveTo(x + 13, y - 4); ctx.lineTo(x + 8, y - 9); ctx.lineTo(x + 2, y - 4); ctx.fill();
      ctx.font = '600 19px "Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⚖️', x, y + 8);
      ctx.fillStyle = 'rgba(232,196,92,' + (0.5 + pulse * 0.5).toFixed(2) + ')';
      ctx.font = '700 9px "Chakra Petch",system-ui,sans-serif';
      ctx.fillText('ASTRA · SPARK MERCHANT', x, y - 13);
      ctx.fillText('⚡' + gfRate() + '💵/⚡', x, y + 22);
      ctx.textAlign = 'start';
      ctx.restore();
      gfMerchNear = (typeof player !== 'undefined' && player) ? Math.hypot(player.col - ASTRA.col, player.row - ASTRA.row) < 3 : false;
      if (gfMerchNear && Math.random() < 0.04) { try { addChips(ASTRA.col, ASTRA.row, '#e8c45c'); } catch (_) {} }
    } catch (_) {}
  }
  function gfMerchToggle() {
    if (!gfMerchNear) { try { toast('Find ASTRA — the fiery merchant pavilion with the ⚖️ banner'); } catch (_) {} return; }
    gfStyle();
    var el = document.getElementById('gfMerch');
    if (!el) { el = document.createElement('div'); el.id = 'gfMerch'; el.className = 'panel'; el.style.cssText = 'position:fixed;left:16px;top:88px;width:min(320px,calc(100vw - 32px));max-height:76vh;overflow:auto;padding:14px 16px;z-index:60'; document.body.appendChild(el); }
    el.classList.toggle('hide');
    gfMerchBuild();
  }
  function gfMerchBuild() {
    var el = document.getElementById('gfMerch'); if (!el) return;
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:15px;letter-spacing:.06em">⚖️ ASTRA · SPARK MERCHANT</b><button onclick="gfMerchToggle()" style="background:none;border:1px solid rgba(255,255,255,.2);color:#9fb2c4;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:12px">✕</button></div>';
    h += '<div style="font-size:11px;color:#9fb2c4;margin-bottom:6px">Rate today: <b style="color:#e8c45c">1⚡ ≈ ' + gfRate() + '💵</b> · 1⚡ ≈ $1 reserve</div>';
    h += '<div style="font-size:12px;font-weight:700;color:#e8c45c;margin:8px 0 6px">FOR SALE (⚡ sparks)</div>';
    var s = gfAstraStock();
    for (var i = 0; i < s.length; i++) h += '<div style="display:flex;align-items:center;gap:8px;background:#101826;border:1px solid rgba(232,196,92,.18);border-radius:8px;padding:7px 9px;margin-bottom:6px">' +
      '<div style="font-size:18px">' + s[i][1].charAt(0) + '</div>' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:700">' + s[i][1] + '</div><div style="font-size:10px;color:#5a6a7a">' + s[i][3] + '</div></div>' +
      '<button onclick="gfMerchBuy(\'' + s[i][0] + '\')" style="background:rgba(12,28,20,.8);border:1px solid rgba(0,229,160,.4);color:#00e5a0;border-radius:7px;padding:5px 9px;font-weight:800;cursor:pointer">⚡' + s[i][2] + '</button></div>';
    h += '<div style="font-size:12px;font-weight:700;color:#e8c45c;margin:10px 0 6px">SHE BUYS (for ⚡)</div>';
    var g = gfAstraGoods();
    if (!g.length) h += '<div style="font-size:11px;color:#5a6a7a">Nothing to sell — gather wood 🪵, stone 🪨, pelts 🟫 or fish 🎣.</div>';
    for (var j = 0; j < g.length; j++) { var gg = Math.floor(g[j].n * g[j].unit); if (gg < 1) gg = 1; h += '<div style="display:flex;align-items:center;gap:8px;background:#0d1420;border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:6px 9px;margin-bottom:5px">' + '<div style="font-size:15px">' + g[j].ico + '</div><div style="flex:1;font-size:12px">' + g[j].n + '×</div><button onclick="gfMerchSell(\'' + g[j].k + '\')" style="background:rgba(18,26,38,.8);border:1px solid rgba(95,224,255,.35);color:#5fe0ff;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer">⚡' + gg + '</button></div>'; }
    h += '<div style="font-size:10px;color:#5a6a7a;margin-top:8px">Walking within range unlocks her trade — press <b style="color:#9fb2c4">Q</b>.</div>';
    el.innerHTML = h;
  }

  // ---- contracts (tasks → earn sparks) ----
  var CONTRACT_DEF = { jobs: ['Work 2 job shifts', 2], kills: ['Defeat 4 enemies', 4], fish: ['Sell 5 fish', 5], shop: ['Buy 3 items at the Store', 3], market: ['Visit the 🤝 market', 1] };
  var CONTRACT_KEYS = ['jobs', 'kills', 'fish', 'shop', 'market'];
  function gfCtr() {
    if (PROG.ctr && PROG.ctr.d === gfDayNum()) return PROG.ctr;
    PROG.ctr = { d: gfDayNum(), k: { jobs: 0, kills: 0, fish: 0, shop: 0, market: 0 }, claimed: {} };
    return PROG.ctr;
  }
  function gfCnt(k) { try { var c = gfCtr(); c.k[k] = (c.k[k] || 0) + 1; persistProg();
    try { gfAchTrack('kills', k === 'kills' ? 1 : 0); gfAchTrack('jobs', k === 'jobs' ? 1 : 0); gfAchTrack('market', k === 'market' ? 1 : 0); gfAchTrack('fish', k === 'fish' ? 1 : 0); gfAchTrack('shop', k === 'shop' ? 1 : 0); } catch (_) {}
  } catch (_) {} }
  function gfContracts() {
    var out = [], seen = {};
    for (var i = 0; i < 3; i++) { var s = gfVar(300 + i, 0, 100); var k = CONTRACT_KEYS[s % CONTRACT_KEYS.length]; while (seen[k]) { s = (s + 7) % 100; k = CONTRACT_KEYS[s % CONTRACT_KEYS.length]; } seen[k] = 1; out.push({ id: k, pay: 25 + gfVar(400 + i, 0, 4) * 10 }); }
    return out;
  }
  function gfClaim(i) {
    try {
      var c = gfCtr(); var cs = gfContracts(); var con = cs[i]; if (!con) return;
      if (c.claimed[con.id]) { toast('Already claimed'); return; }
      var goal = CONTRACT_DEF[con.id][1]; if ((c.k[con.id] || 0) < goal) { toast('Task not complete yet'); return; }
      c.claimed[con.id] = 1; persistProg();
      gfSparkAdd('contract', con.pay, 'task: ' + CONTRACT_DEF[con.id][0]);
      toast('⚡ +' + con.pay + ' sparks for ' + CONTRACT_DEF[con.id][0] + '!');
      gfVaultBuild();
    } catch (_) {}
  }
  function gfDaily() {
    var m = gfMeta(); if (m.daily === gfDayNum()) { toast('☀ Daily bonus claimed'); return; }
    var amt = 5 + (m.sub ? 2 : 0); m.daily = gfDayNum(); gfMetaSave(m);
    gfSparkAdd('daily', amt, 'daily bonus');
    toast('☀ +' + amt + '⚡ daily bonus' + (m.sub ? ' (Prime ×)' : ''));
    gfVaultBuild();
  }
  function gfSub() {
    var m = gfMeta(); if (m.sub) { toast('🎖 Prime already active'); return; }
    if (!gfSparkSpend('sub', 15, 'SHADDAI Prime 1mo')) return;
    m.sub = true; m.subMonth = (new Date().getMonth() + 1); gfMetaSave(m);
    toast('🎖 SHADDAI Prime active — +2 daily ⚡, yield ×1.25');
    gfVaultBuild();
  }

  // ---- spark assets (10⚡ = an office) ----
  function gfAssets() { try { var a = JSON.parse(localStorage.getItem(ASSET_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function gfAssetSave(a) { try { localStorage.setItem(ASSET_KEY, JSON.stringify(a)); } catch (_) {} }
  function gfFootprint() { return gfMeta().footprint || 0; }
  function gfTier() { return Math.min(6, Math.floor(gfFootprint() / 400)); }
  function gfAppraise(deed) { var met = gfMeta(); var mult = 1 + Math.min(1.5, (met.footprint || 0) / 600) + (gfTier() * 0.05); return Math.max(deed.base, Math.round(deed.base * mult)); }
  function gfAssetMint(type) {
    try {
      var def = ASSET_DEF[type]; if (!def) return;
      if (!gfSparkSpend('asset', def[2], 'mint ' + def[1])) return;
      var a = gfAssets();
      a.push({ id: type, ico: def[0], name: def[1], base: def[2], minted: Date.now(), lastYield: Date.now() });
      gfAssetSave(a);
      toast(def[0] + ' Deed minted — ' + def[1] + ' now yields ⚡ while you play');
      gfVaultBuild();
    } catch (_) {}
  }
  function gfAssetClaim(i) {
    try {
      var a = gfAssets(); var d = a[i]; if (!d) return;
      var hrs = (Date.now() - d.lastYield) / 3600000; if (hrs > 24) hrs = 24; if (hrs < 0) hrs = 0;
      var yph = d.base * (0.015 + 0.004 * gfTier()) * (gfMeta().sub ? 1.25 : 1);
      var gain = Math.floor(hrs * yph);
      if (gain > 0) { d.lastYield = Date.now(); gfAssetSave(a); gfSparkAdd('yield', gain, d.name + ' yield'); toast('⚡+' + gain + ' from ' + d.name); }
      else toast('No yield accrued yet — come back in a while');
      gfVaultBuild();
    } catch (_) {}
  }
  function gfAssetLiquidate(i) {
    try {
      var a = gfAssets(); var d = a[i]; if (!d) return;
      var val = Math.round(gfAppraise(d) * 0.8); var cut = Math.round(val * 0.1);
      a.splice(i, 1); gfAssetSave(a);
      gfSparkAdd('liquidate', val - cut, d.name + ' sold');
      gfSparkSpend('fee', cut, 'liquidity fee');
      toast('💰 ' + d.name + ' liquidated · +⚡' + (val - cut) + ' (fee ⚡' + cut + ')');
      gfVaultBuild();
    } catch (_) {}
  }

  // ---- vault panel ----
  function gfVaultBtn() {
    try {
      var tb = document.getElementById('topbtns'); if (!tb || tb.querySelector('#gfVault')) return;
      var b = document.createElement('button');
      b.id = 'gfVault'; b.className = 'panel';
      b.style.cssText = 'padding:9px 13px;border-color:rgba(232,196,92,.45);color:#e8c45c;font-weight:700';
      b.textContent = '⚡ Vault';
      b.onclick = gfVaultToggle;
      tb.appendChild(b);
      gfGateBtn();
    } catch (_) {}
  }
  function gfVaultToggle() {
    gfStyle(); gfVaultBtn();
    var el = document.getElementById('gfVaultPanel');
    if (!el) { el = document.createElement('div'); el.id = 'gfVaultPanel'; el.className = 'panel'; el.style.cssText = 'position:fixed;right:16px;top:120px;width:min(340px,calc(100vw - 32px));max-height:76vh;overflow:auto;padding:14px 16px;z-index:60'; document.body.appendChild(el); }
    el.classList.toggle('hide');
    gfVaultBuild();
  }
  function gfVaultBuild() {
    try {
      var el = document.getElementById('gfVaultPanel'); if (!el) return;
      gfCtr();
      var bal = gfSparkBal(), m = gfMeta(), rate = gfRate(), tier = gfTier();
      var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b style="font-size:15px;letter-spacing:.06em">⚡ SPARK VAULT</b><button onclick="gfVaultToggle()" style="background:none;border:1px solid rgba(255,255,255,.2);color:#9fb2c4;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:12px">✕</button></div>';
      h += '<div style="font-size:22px;font-weight:800;color:#e8c45c;margin:2px 0">⚡ ' + bal + '<span style="font-size:11px;color:#5a6a7a;font-weight:400"> reserve · 1⚡ ≈ $1</span></div>';
      h += '<div style="font-size:10px;color:#5a6a7a;line-height:1.5;margin-bottom:6px">Supply: issued ' + m.issued + ' · burned ' + m.burned + ' · fees ' + m.fee + ' · your footprint ' + (m.footprint || 0) + ' · tier ' + tier + '</div>';
      h += '<button onclick="gfDaily()" style="width:100%;padding:7px;background:rgba(18,26,38,.8);border:1px solid rgba(232,196,92,.35);color:#e8c45c;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;margin-bottom:4px">☀ Daily bonus +' + (5 + (m.sub ? 2 : 0)) + '⚡</button>';
      h += '<button onclick="gfSub()" style="width:100%;padding:7px;background:rgba(24,16,40,.8);border:1px solid rgba(204,68,255,.4);color:#d0a0ff;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;margin-bottom:8px">🎖 SHADDAI Prime · 15⚡/mo ' + (m.sub ? '· ACTIVE' : '') + '</button>';
      h += '<div style="font-size:12px;font-weight:700;color:#7ffcd0;margin:8px 0 6px">⇄ EXCHANGE · 1⚡ ≈ ' + rate + '💵 <span style="font-size:10px;color:#5a6a7a">(fee 1% burned)</span></div>';
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button onclick="gfExchange(\'buy\',10)" style="flex:1;min-width:86px;padding:7px;background:rgba(12,28,20,.8);border:1px solid rgba(0,229,160,.35);color:#00e5a0;border-radius:7px;font-weight:700;font-size:11px;cursor:pointer">⛏ Mint ⚡10</button>' +
        '<button onclick="gfExchange(\'buy\',\'max\')" style="flex:1;min-width:86px;padding:7px;background:rgba(12,28,20,.8);border:1px solid rgba(0,229,160,.35);color:#00e5a0;border-radius:7px;font-weight:700;font-size:11px;cursor:pointer">⛏ Mint Max</button>' +
        '<button onclick="gfExchange(\'sell\',5)" style="flex:1;min-width:86px;padding:7px;background:rgba(40,26,16,.8);border:1px solid rgba(255,154,60,.4);color:#ff9a3c;border-radius:7px;font-weight:700;font-size:11px;cursor:pointer">Sell ⚡5</button>' +
        '<button onclick="gfExchange(\'sell\',\'max\')" style="flex:1;min-width:86px;padding:7px;background:rgba(40,26,16,.8);border:1px solid rgba(255,154,60,.4);color:#ff9a3c;border-radius:7px;font-weight:700;font-size:11px;cursor:pointer">Sell Max</button></div>';
      h += '<div style="font-size:12px;font-weight:700;color:#ffe9a8;margin:10px 0 6px">🏛 SPARK ASSETS <span style="font-size:10px;color:#5a6a7a">(10⚡ = an office)</span></div>';
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
      for (var t in ASSET_DEF) { var d = ASSET_DEF[t]; h += '<button onclick="gfAssetMint(\'' + t + '\')" style="flex:1;min-width:64px;padding:7px;background:rgba(18,26,38,.9);border:1px solid rgba(95,224,255,.3);color:#5fe0ff;border-radius:7px;font-weight:700;font-size:10px;cursor:pointer">' + d[0] + ' ' + d[1] + '<br><span style="color:#e8c45c">⚡' + d[2] + '</span></button>'; }
      h += '</div>';
      var a = gfAssets();
      if (a.length) { h += '<div style="font-size:11px;color:#9fb2c4;margin:6px 0 4px">Owned — yield while you play↑</div>'; for (var i = 0; i < a.length; i++) { var dd = a[i]; var appr = gfAppraise(dd); var yph = dd.base * (0.015 + 0.004 * tier) * (m.sub ? 1.25 : 1); h += '<div style="display:flex;align-items:center;gap:7px;background:#0d1420;border:1px solid rgba(95,224,255,.15);border-radius:8px;padding:6px 8px;margin-bottom:5px"><div style="font-size:16px">' + dd.ico + '</div><div style="flex:1"><div style="font-size:12px;font-weight:700">' + dd.name + '</div><div style="font-size:10px;color:#5a6a7a">worth ⚡' + appr + ' · +' + Math.floor(yph * 10) / 10 + '⚡/h</div></div><button onclick="gfAssetClaim(' + i + ')" style="background:rgba(12,28,20,.8);border:1px solid rgba(0,229,160,.35);color:#00e5a0;border-radius:6px;padding:4px 7px;font-size:10px;font-weight:700;cursor:pointer">Claim</button><button onclick="gfAssetLiquidate(' + i + ')" style="background:rgba(40,26,16,.8);border:1px solid rgba(255,154,60,.35);color:#ff9a3c;border-radius:6px;padding:4px 7px;font-size:10px;font-weight:700;cursor:pointer">Sell</button></div>'; } }
      h += '<div style="font-size:12px;font-weight:700;color:#7ffcd0;margin:10px 0 6px">📜 DAILY TASKS <span style="font-size:10px;color:#5a6a7a">(grind to earn ⚡)</span></div>';
      var cs = gfContracts(), c = gfCtr();
      for (var j = 0; j < cs.length; j++) { var con = cs[j]; var done = (c.k[con.id] || 0) >= CONTRACT_DEF[con.id][1]; h += '<div style="display:flex;align-items:center;gap:8px;background:#0d1420;border:1px solid ' + (c.claimed[con.id] ? 'rgba(0,229,160,.2)' : (done ? 'rgba(0,229,160,.5)' : 'rgba(255,255,255,.07)')) + ';border-radius:8px;padding:6px 8px;margin-bottom:5px"><div style="flex:1"><div style="font-size:12px">' + CONTRACT_DEF[con.id][0] + '</div><div style="font-size:10px;color:#5a6a7a">' + Math.min(c.k[con.id] || 0, CONTRACT_DEF[con.id][1]) + '/' + CONTRACT_DEF[con.id][1] + (c.claimed[con.id] ? ' ✓ claimed' : '') + '</div></div><button onclick="gfClaim(' + j + ')" style="background:rgba(12,28,20,.85);border:1px solid ' + (c.claimed[con.id] ? 'rgba(255,255,255,.15)' : 'rgba(0,229,160,.4)') + ';color:' + (c.claimed[con.id] ? '#5a6a7a' : '#00e5a0') + ';border-radius:6px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer">⚡' + con.pay + '</button></div>'; }
      h += '<div style="font-size:10px;color:#5a6a7a;margin-top:8px;line-height:1.5">⚖️ ASTRA trades with you when you walk to her (press <b style="color:#9fb2c4">Q</b>). ⚡ is the shared wallet — spend it in the 3D realm too. A ledger + supply math already exist for future token/fees/subscriptions.</div>';
      el.innerHTML = h;
    } catch (_) {}
  }

  // ---- platform API surface (for dashboards / future billing / token rail) ----
  window.__sparks = {
    bal: gfSparkBal, add: gfSparkAdd, spend: gfSparkSpend, ledger: function () { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (_) { return []; } }, meta: gfMeta,
    assets: gfAssets, appraise: gfAppraise, claimYield: gfAssetClaim, liquidate: gfAssetLiquidate, mint: gfAssetMint, rates: gfRate, contracts: gfContracts, daily: gfDaily
  };

  // ---- init ----
  function init() {
    try { wire(); } catch (_) {}
    try { gfGateBtn(); } catch (_) {}
    try { gfRestoreFrom3D(); } catch (_) {}
    if (typeof levelFor === 'function' && typeof credits !== 'undefined') {
      var L = levelFor(credits);
      try { applyStats(); } catch (_) {}
      if (PROG.pet >= 0) {
        G_PET.col = (player ? player.col : 25) - 1;
        G_PET.row = (player ? player.row : 25) + 1;
      } else if (L >= 2) {
        adoptPet();
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();