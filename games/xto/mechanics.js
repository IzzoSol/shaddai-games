/* ═══════════════════════════════════════════════════════════════════════════
   XTO — MECHANICS + HUD   (module #3, built after City, before NPCs/Player)
   window.XTO_Mechanics = { build(ctx) → { update(dt,t), ...helpers } }

   Owns the CORE RPG numbers on ctx.state (hp, stamina, level, xp, coins,
   inventory, character) and registers every shared helper on ctx.helpers so
   the Player + Combat modules (built later) can drive them.

   Mechanics implemented:
     • HEALTH   — regen out of combat, damage()/heal()/onDeath respawn hook
     • STAMINA  — drains on run/attack, regens on walk/idle, "can't run at 0
                  until it climbs back past a threshold" (canRun/tryConsumeStamina)
     • STRENGTH / LEVELING — escalating XP curve, level-up buffs hp/stam/str,
                  attackPower() for combat, neon level-up flourish
     • INVENTORY — stackable items, addItem/removeItem/hasItem, toggleable grid

   HUD: dark-glass neon panels appended to ctx.hud as .panel — health bar,
   stamina bar, XP bar + LEVEL badge, coin counter, inventory grid (I to toggle).
   Pointer-events only on the panels (shell sets #hud .panel{pointer-events:auto}).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Tunables ────────────────────────────────────────────────────────────
  const CFG = {
    HP_REGEN:        4.5,   // hp / sec, out of combat
    HP_REGEN_DELAY:  4.0,   // sec after last damage before hp regen starts
    STAM_REGEN:      22,    // stamina / sec while walking / idle
    STAM_DRAIN_RUN:  16,    // stamina / sec while running (player calls tryConsumeStamina)
    STAM_RUN_GATE:   18,    // once exhausted, must climb back past this to run again
    STAM_EXHAUSTED:  0.5,   // <= this = exhausted flag on
    XP_BASE:         100,   // xp for level 1→2
    XP_GROWTH:       1.35,  // escalating curve multiplier per level
    HP_PER_LEVEL:    18,
    STAM_PER_LEVEL:  10,
    STR_PER_LEVEL:   3,
    STR_BASE:        10,
    INV_SLOTS:       24,    // grid capacity
  };

  // per-character flavour (base strength tilt + accent colour for level-up flourish)
  const CHARS = {
    TURTLE: { accent: '#37f5b0', strBias: 2, name: 'Emerald Enforcer' },
    ORACLE: { accent: '#8a6cff', strBias: 0, name: 'Oracle'          },
    XEROX:  { accent: '#27e0ff', strBias: 1, name: 'ZEROX'           },
    ZEROX:  { accent: '#27e0ff', strBias: 1, name: 'ZEROX'           },
  };

  function XTO_Mechanics_build(ctx) {
    const S = ctx.state;
    const hud = ctx.hud;
    const helpers = ctx.helpers || (ctx.helpers = {});

    // ── Runtime (non-persistent) state ──────────────────────────────────────
    const RT = {
      lastDamageAt: -999,   // ctx.time.t of last damage taken
      exhausted:    false,  // true when stamina bottomed out → no running until gate
      dead:         false,
      onDeath:      null,   // respawn hook (Player sets via helpers.setOnDeath)
      char:         (CHARS[(S.character || ctx.chosen || 'TURTLE').toUpperCase()] ? (S.character || ctx.chosen).toUpperCase() : 'TURTLE'),
    };
    S.character = RT.char;

    // ensure numeric sanity
    S.hp        = clamp(num(S.hp, 100),        0, num(S.hpMax, 100));
    S.hpMax     = num(S.hpMax, 100);
    S.stamina   = clamp(num(S.stamina, 100),   0, num(S.staminaMax, 100));
    S.staminaMax= num(S.staminaMax, 100);
    S.level     = Math.max(1, num(S.level, 1) | 0);
    S.xp        = Math.max(0, num(S.xp, 0));
    S.coins     = Math.max(0, num(S.coins, 0) | 0);
    if (!Array.isArray(S.inventory)) S.inventory = [];

    // ════════════════════════════════════════════════════════════════════════
    //  STYLES  (injected once)
    // ════════════════════════════════════════════════════════════════════════
    injectStyles();

    // ════════════════════════════════════════════════════════════════════════
    //  HUD BUILD
    // ════════════════════════════════════════════════════════════════════════

    // ── Left vitals stack: health + stamina + xp/level ──
    const vitals = el('div', 'panel xto-vitals');
    vitals.innerHTML = `
      <div class="xto-swirl"></div>
      <div class="xto-row">
        <span class="xto-ico xto-heart">❤</span>
        <div class="xto-bar xto-bar-hp"><i class="xto-fill" data-hp></i><span class="xto-barTxt" data-hpTxt></span></div>
      </div>
      <div class="xto-row">
        <span class="xto-ico xto-bolt">⚡</span>
        <div class="xto-bar xto-bar-st"><i class="xto-fill" data-st></i><span class="xto-barTxt" data-stTxt></span></div>
      </div>
      <div class="xto-row xto-xprow">
        <span class="xto-badge" data-lvl>1</span>
        <div class="xto-bar xto-bar-xp"><i class="xto-fill" data-xp></i><span class="xto-barTxt" data-xpTxt></span></div>
      </div>`;
    hud.appendChild(vitals);

    // ── Top-right coin + strength readout ──
    const stats = el('div', 'panel xto-stats');
    stats.innerHTML = `
      <div class="xto-swirl xto-swirl-sm"></div>
      <div class="xto-coin"><span class="xto-coinIco">◈</span><span data-coins>0</span></div>
      <div class="xto-str"><span class="xto-strIco">⚔</span><span data-str>0</span></div>`;
    hud.appendChild(stats);

    // ── Inventory grid (toggle with I) ──
    const inv = el('div', 'panel xto-inv hidden');
    inv.innerHTML = `
      <div class="xto-swirl"></div>
      <div class="xto-invHead"><span class="xto-invTitle">INVENTORY</span><span class="xto-invHint">[ I ]</span></div>
      <div class="xto-grid" data-grid></div>`;
    hud.appendChild(inv);

    // ── Level-up flourish overlay ──
    const flourish = el('div', 'xto-flourish');
    flourish.innerHTML = `<div class="xto-flRing"></div><div class="xto-flTxt">LEVEL UP</div><div class="xto-flSub"></div>`;
    hud.appendChild(flourish);

    // ── Damage / heal floating vignette (screen-edge pulse) ──
    const vignette = el('div', 'xto-vignette');
    hud.appendChild(vignette);

    // cache DOM handles
    const D = {
      hp:    vitals.querySelector('[data-hp]'),
      hpTxt: vitals.querySelector('[data-hpTxt]'),
      st:    vitals.querySelector('[data-st]'),
      stTxt: vitals.querySelector('[data-stTxt]'),
      xp:    vitals.querySelector('[data-xp]'),
      xpTxt: vitals.querySelector('[data-xpTxt]'),
      lvl:   vitals.querySelector('[data-lvl]'),
      coins: stats.querySelector('[data-coins]'),
      str:   stats.querySelector('[data-str]'),
      grid:  inv.querySelector('[data-grid]'),
      flSub: flourish.querySelector('.xto-flSub'),
    };

    // apply character accent to flourish + badge
    applyAccent();
    buildGrid();
    renderInventory();
    // sync displayed numbers once
    let shownHpW = -1, shownStW = -1, shownXpW = -1, shownLvl = -1, shownCoins = -1, shownStr = -1;

    // ════════════════════════════════════════════════════════════════════════
    //  INPUT — inventory toggle (KeyI); shell fills ctx.keys, we edge-detect
    // ════════════════════════════════════════════════════════════════════════
    let invOpen = false, iWasDown = false;
    // also allow direct listener so it works even if player module owns movement keys
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyI') toggleInv(); });

    function toggleInv() {
      invOpen = !invOpen;
      inv.classList.toggle('hidden', !invOpen);
      if (invOpen) inv.classList.add('xto-pop'), setTimeout(() => inv.classList.remove('xto-pop'), 260);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  XP CURVE
    // ════════════════════════════════════════════════════════════════════════
    function xpForLevel(lvl) {
      // escalating: base * growth^(lvl-1), rounded to a clean-ish number
      return Math.round(CFG.XP_BASE * Math.pow(CFG.XP_GROWTH, Math.max(0, lvl - 1)) / 5) * 5;
    }
    function xpNeeded() { return xpForLevel(S.level); }

    // ════════════════════════════════════════════════════════════════════════
    //  HELPERS  (registered on ctx.helpers for other modules)
    // ════════════════════════════════════════════════════════════════════════

    function damage(n) {
      n = Math.max(0, num(n, 0));
      if (!n || RT.dead) return S.hp;
      S.hp = clamp(S.hp - n, 0, S.hpMax);
      RT.lastDamageAt = ctx.time.t;
      pulseVignette('dmg');
      if (S.hp <= 0) die();
      return S.hp;
    }

    function heal(n) {
      n = Math.max(0, num(n, 0));
      if (!n || RT.dead) return S.hp;
      S.hp = clamp(S.hp + n, 0, S.hpMax);
      pulseVignette('heal');
      return S.hp;
    }

    function die() {
      if (RT.dead) return;
      RT.dead = true;
      pulseVignette('dmg');
      // give the respawn hook a beat; if none, self-respawn to full at same spot
      const cb = RT.onDeath;
      setTimeout(() => {
        try { if (typeof cb === 'function') cb(); } catch (_) {}
        respawn();
      }, 60);
    }

    function respawn() {
      S.hp = S.hpMax;
      S.stamina = S.staminaMax;
      RT.exhausted = false;
      RT.dead = false;
      RT.lastDamageAt = -999;
    }

    // STAMINA — returns true if it could pay the cost (used to GATE running/sprint)
    function tryConsumeStamina(n) {
      n = Math.max(0, num(n, 0));
      if (RT.dead) return false;
      if (RT.exhausted) return false;         // locked out until regen passes gate
      if (S.stamina < n) {                    // can't afford → drain to 0, exhaust
        S.stamina = 0;
        RT.exhausted = true;
        return false;
      }
      S.stamina = clamp(S.stamina - n, 0, S.staminaMax);
      if (S.stamina <= CFG.STAM_EXHAUSTED) RT.exhausted = true;
      return true;
    }

    function canRun() {
      return !RT.dead && !RT.exhausted && S.stamina > CFG.STAM_EXHAUSTED;
    }

    function gainXp(n) {
      n = Math.max(0, num(n, 0));
      if (!n) return;
      S.xp += n;
      let leveled = 0;
      while (S.xp >= xpNeeded()) {
        S.xp -= xpNeeded();
        S.level++;
        leveled++;
        S.hpMax     += CFG.HP_PER_LEVEL;
        S.staminaMax+= CFG.STAM_PER_LEVEL;
        S.hp = S.hpMax;              // level-up fully heals
        S.stamina = S.staminaMax;
        RT.exhausted = false;
      }
      if (leveled) showLevelUp();
    }

    function attackPower() {
      // base strength + a bit of scaling from current level; combat multiplies dmg by this
      return strength() + (S.level - 1) * 1.5;
    }

    function strength() {
      const c = CHARS[RT.char] || CHARS.TURTLE;
      return CFG.STR_BASE + (c.strBias || 0) + (S.level - 1) * CFG.STR_PER_LEVEL;
    }

    function setCharacter(code) {
      const k = String(code || '').toUpperCase();
      if (CHARS[k]) { RT.char = k; S.character = k; applyAccent(); }
      return RT.char;
    }

    // INVENTORY ---------------------------------------------------------------
    function addItem(item) {
      if (!item || !item.id) return false;
      const stackable = item.stack !== false;   // default stackable
      const qty = Math.max(1, num(item.qty, 1) | 0);
      if (stackable) {
        const ex = S.inventory.find(x => x.id === item.id);
        if (ex) { ex.qty += qty; renderInventory(); return true; }
      }
      if (S.inventory.length >= CFG.INV_SLOTS) return false;   // full
      S.inventory.push({
        id: item.id,
        name: item.name || item.id,
        qty: qty,
        icon: item.icon || '◆',
        stack: stackable,
      });
      renderInventory();
      return true;
    }

    function removeItem(id, qty) {
      qty = Math.max(1, num(qty, 1) | 0);
      const i = S.inventory.findIndex(x => x.id === id);
      if (i < 0) return false;
      S.inventory[i].qty -= qty;
      if (S.inventory[i].qty <= 0) S.inventory.splice(i, 1);
      renderInventory();
      return true;
    }

    function hasItem(id, qty) {
      qty = Math.max(1, num(qty, 1) | 0);
      const it = S.inventory.find(x => x.id === id);
      return !!it && it.qty >= qty;
    }

    function addCoins(n) { S.coins = Math.max(0, S.coins + (num(n, 0) | 0)); return S.coins; }

    function setOnDeath(fn) { RT.onDeath = (typeof fn === 'function') ? fn : null; }

    // register EVERYTHING others need
    Object.assign(helpers, {
      damage, heal, respawn,
      tryConsumeStamina, canRun,
      gainXp, attackPower, strength, setCharacter,
      addItem, removeItem, hasItem, addCoins,
      onDeath: setOnDeath,          // helpers.onDeath(fn) sets the respawn hook
      setOnDeath,                    // explicit alias
      xpNeeded,
      isDead: () => RT.dead,
      isExhausted: () => RT.exhausted,
      toggleInventory: toggleInv,
    });

    // ════════════════════════════════════════════════════════════════════════
    //  RENDER HELPERS
    // ════════════════════════════════════════════════════════════════════════
    function applyAccent() {
      const c = CHARS[RT.char] || CHARS.TURTLE;
      hud.style.setProperty('--xto-accent', c.accent);
      D.lvl.style.setProperty('--xto-accent', c.accent);
    }

    function buildGrid() {
      D.grid.innerHTML = '';
      for (let i = 0; i < CFG.INV_SLOTS; i++) {
        const slot = el('div', 'xto-slot');
        slot.innerHTML = `<span class="xto-slotIco"></span><span class="xto-slotQty"></span>`;
        D.grid.appendChild(slot);
      }
    }

    function renderInventory() {
      const slots = D.grid.children;
      for (let i = 0; i < slots.length; i++) {
        const it = S.inventory[i];
        const ico = slots[i].querySelector('.xto-slotIco');
        const q   = slots[i].querySelector('.xto-slotQty');
        if (it) {
          slots[i].classList.add('filled');
          slots[i].title = it.name + (it.qty > 1 ? ' ×' + it.qty : '');
          ico.textContent = it.icon || '◆';
          q.textContent   = it.qty > 1 ? it.qty : '';
        } else {
          slots[i].classList.remove('filled');
          slots[i].title = '';
          ico.textContent = '';
          q.textContent   = '';
        }
      }
    }

    function showLevelUp() {
      const c = CHARS[RT.char] || CHARS.TURTLE;
      D.flSub.textContent = 'LV ' + S.level + '  ·  ' + (c.name || RT.char);
      flourish.style.setProperty('--xto-accent', c.accent);
      flourish.classList.remove('go'); void flourish.offsetWidth; // restart anim
      flourish.classList.add('go');
      setTimeout(() => flourish.classList.remove('go'), 1700);
    }

    function pulseVignette(kind) {
      vignette.classList.remove('dmg', 'heal'); void vignette.offsetWidth;
      vignette.classList.add(kind);
      setTimeout(() => vignette.classList.remove(kind), 420);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  UPDATE  — regen + HUD sync (cheap: only touch DOM when values change)
    // ════════════════════════════════════════════════════════════════════════
    function update(dt, t) {
      dt = num(dt, 0);
      if (dt <= 0) return;

      // ── HP regen (out of combat, after delay) ──
      if (!RT.dead && S.hp < S.hpMax && (t - RT.lastDamageAt) >= CFG.HP_REGEN_DELAY) {
        S.hp = clamp(S.hp + CFG.HP_REGEN * dt, 0, S.hpMax);
      }

      // ── Stamina regen — only when NOT actively running.
      //    Player calls tryConsumeStamina() this frame if running; we detect that
      //    the value was consumed via input.run. If running intent isn't set, regen.
      const runningNow = !!(ctx.input && ctx.input.run) && canRun();
      if (!RT.dead && !runningNow && S.stamina < S.staminaMax) {
        S.stamina = clamp(S.stamina + CFG.STAM_REGEN * dt, 0, S.staminaMax);
      }
      // clear exhaustion once we climb back past the run gate
      if (RT.exhausted && S.stamina >= CFG.STAM_RUN_GATE) RT.exhausted = false;

      // ── HUD sync ──
      const hpW = pct(S.hp, S.hpMax);
      if (hpW !== shownHpW) {
        D.hp.style.width = hpW + '%';
        D.hpTxt.textContent = Math.ceil(S.hp) + ' / ' + Math.round(S.hpMax);
        D.hp.classList.toggle('low', hpW < 25);
        shownHpW = hpW;
      }
      const stW = pct(S.stamina, S.staminaMax);
      if (stW !== shownStW) {
        D.st.style.width = stW + '%';
        D.stTxt.textContent = Math.ceil(S.stamina) + ' / ' + Math.round(S.staminaMax);
        D.st.classList.toggle('exhausted', RT.exhausted);
        shownStW = stW;
      }
      const need = xpNeeded();
      const xpW = pct(S.xp, need);
      if (xpW !== shownXpW) {
        D.xp.style.width = xpW + '%';
        D.xpTxt.textContent = Math.floor(S.xp) + ' / ' + need + ' XP';
        shownXpW = xpW;
      }
      if (S.level !== shownLvl)   { D.lvl.textContent = S.level; shownLvl = S.level; }
      if (S.coins !== shownCoins) { D.coins.textContent = S.coins; shownCoins = S.coins; }
      const str = Math.round(strength());
      if (str !== shownStr)       { D.str.textContent = str; shownStr = str; }
    }

    // seed a couple of starter items so the grid isn't empty (food ties to hunting later)
    if (S.inventory.length === 0) {
      addItem({ id: 'ration',  name: 'Field Ration', qty: 3, icon: '🍖' });
      addItem({ id: 'shard',   name: 'Neon Shard',   qty: 5, icon: '◈' });
    }

    // expose helpers on the returned api too (shell keeps update; others read ctx.helpers)
    return Object.assign({ update }, helpers);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  small utils
  // ══════════════════════════════════════════════════════════════════════════
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pct(v, max) { return max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0; }
  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

  // ══════════════════════════════════════════════════════════════════════════
  //  STYLES — dark-glass + neon glow + swirl/swivel flourishes
  // ══════════════════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('xto-mechanics-css')) return;
    const s = document.createElement('style');
    s.id = 'xto-mechanics-css';
    s.textContent = `
    #hud{ --xto-accent:#37f5b0; --xto-hp:#ff3b6b; --xto-st:#27e0ff; --xto-xp:#8a6cff; --xto-coin:#ffd35b;
          font-family:'Segoe UI',system-ui,sans-serif; }
    #hud .panel{ position:fixed; background:linear-gradient(160deg,rgba(10,16,34,.82),rgba(6,9,20,.9));
      border:1px solid rgba(120,180,255,.16); border-radius:14px; backdrop-filter:blur(9px) saturate(1.1);
      box-shadow:0 8px 30px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.02); overflow:hidden; }

    /* ── swirl / swivel accent flourishes ── */
    .xto-swirl{ position:absolute; width:130px; height:130px; right:-46px; top:-46px; pointer-events:none;
      background:conic-gradient(from 0deg, transparent 0 60%, rgba(39,224,255,.18), transparent 78%);
      border-radius:50%; filter:blur(2px); animation:xtoSwivel 9s linear infinite; opacity:.7; }
    .xto-swirl::after{ content:''; position:absolute; inset:20px; border-radius:50%;
      border:1px dashed rgba(138,108,255,.35); animation:xtoSwivel 14s linear infinite reverse; }
    .xto-swirl-sm{ width:88px; height:88px; right:-30px; top:-30px; }
    @keyframes xtoSwivel{ to{ transform:rotate(360deg); } }

    /* ── vitals stack (bottom-left) ── */
    .xto-vitals{ left:16px; bottom:16px; width:min(320px,72vw); padding:12px 14px; display:flex; flex-direction:column; gap:9px; }
    .xto-row{ display:flex; align-items:center; gap:10px; position:relative; z-index:1; }
    .xto-ico{ width:22px; text-align:center; font-size:16px; flex:0 0 auto; }
    .xto-heart{ color:var(--xto-hp); text-shadow:0 0 10px var(--xto-hp); animation:xtoBeat 1.6s ease-in-out infinite; }
    .xto-bolt{ color:var(--xto-st); text-shadow:0 0 10px var(--xto-st); }
    @keyframes xtoBeat{ 0%,100%{transform:scale(1)} 12%{transform:scale(1.22)} 24%{transform:scale(1)} }

    .xto-bar{ position:relative; flex:1; height:15px; border-radius:9px; background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.09); overflow:hidden; box-shadow:inset 0 1px 3px rgba(0,0,0,.5); }
    .xto-fill{ display:block; height:100%; width:50%; border-radius:9px; transition:width .32s cubic-bezier(.2,.8,.2,1);
      position:relative; }
    .xto-fill::after{ content:''; position:absolute; inset:0; border-radius:9px;
      background:linear-gradient(180deg,rgba(255,255,255,.35),transparent 45%); mix-blend-mode:overlay; }
    .xto-barTxt{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      font-size:9.5px; letter-spacing:.06em; color:#eaf3ff; text-shadow:0 1px 3px rgba(0,0,0,.9);
      font-family:'IBM Plex Mono',monospace; z-index:2; pointer-events:none; }

    .xto-bar-hp .xto-fill{ background:linear-gradient(90deg,#ff3b6b,#ff779b); box-shadow:0 0 12px rgba(255,59,107,.6); }
    .xto-bar-hp .xto-fill.low{ animation:xtoPulseLow 0.9s ease-in-out infinite; }
    @keyframes xtoPulseLow{ 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.6)} }
    .xto-bar-st .xto-fill{ background:linear-gradient(90deg,#12b5d8,#27e0ff,#8ff6ff); box-shadow:0 0 12px rgba(39,224,255,.55); }
    .xto-bar-st .xto-fill.exhausted{ filter:grayscale(.6) brightness(.8); box-shadow:none; }
    .xto-bar-xp{ height:11px; }
    .xto-bar-xp .xto-fill{ background:linear-gradient(90deg,#6a4bff,#8a6cff,#c9b8ff); box-shadow:0 0 10px rgba(138,108,255,.5); }
    .xto-xprow{ margin-top:1px; }

    .xto-badge{ flex:0 0 auto; min-width:26px; height:26px; padding:0 5px; display:flex; align-items:center; justify-content:center;
      border-radius:8px; font-weight:800; font-size:13px; color:#04060d;
      background:linear-gradient(135deg,var(--xto-accent),#fff); box-shadow:0 0 14px var(--xto-accent);
      font-family:'IBM Plex Mono',monospace; }

    /* ── stats (top-right): coin + strength ── */
    .xto-stats{ right:16px; top:16px; padding:10px 14px; display:flex; flex-direction:column; gap:7px; align-items:flex-end; min-width:120px; }
    .xto-coin,.xto-str{ position:relative; z-index:1; display:flex; align-items:center; gap:8px; font-family:'IBM Plex Mono',monospace;
      font-weight:700; font-size:15px; }
    .xto-coin{ color:var(--xto-coin); text-shadow:0 0 10px rgba(255,211,91,.5); }
    .xto-str{ color:#ff9d6b; text-shadow:0 0 10px rgba(255,157,107,.45); font-size:14px; }
    .xto-coinIco{ font-size:16px; } .xto-strIco{ font-size:15px; }

    /* ── inventory grid (center, toggle I) ── */
    .xto-inv{ left:50%; top:50%; transform:translate(-50%,-50%); padding:16px 18px 18px; width:min(430px,88vw); }
    .xto-inv.hidden{ display:none; }
    .xto-inv.xto-pop{ animation:xtoPop .26s cubic-bezier(.2,1.3,.4,1); }
    @keyframes xtoPop{ from{ transform:translate(-50%,-50%) scale(.9); opacity:0 } to{ transform:translate(-50%,-50%) scale(1); opacity:1 } }
    .xto-invHead{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom:12px; position:relative; z-index:1; }
    .xto-invTitle{ font-family:'Cinzel','Segoe UI',serif; font-weight:800; letter-spacing:.22em; font-size:15px;
      color:#dbe8ff; text-shadow:0 0 14px var(--xto-accent); }
    .xto-invHint{ font-family:'IBM Plex Mono',monospace; font-size:10px; color:#7f93b8; }
    .xto-grid{ display:grid; grid-template-columns:repeat(6,1fr); gap:8px; position:relative; z-index:1; }
    .xto-slot{ position:relative; aspect-ratio:1; border-radius:10px; background:rgba(255,255,255,.03);
      border:1px solid rgba(120,180,255,.14); display:flex; align-items:center; justify-content:center;
      transition:border-color .2s, box-shadow .2s, transform .12s; }
    .xto-slot.filled{ border-color:var(--xto-accent); box-shadow:0 0 12px -2px var(--xto-accent), inset 0 0 10px -4px var(--xto-accent);
      background:rgba(55,245,176,.06); }
    .xto-slot.filled:hover{ transform:translateY(-2px); }
    .xto-slotIco{ font-size:20px; filter:drop-shadow(0 0 6px rgba(0,0,0,.6)); }
    .xto-slotQty{ position:absolute; right:4px; bottom:2px; font-size:10px; font-weight:800;
      font-family:'IBM Plex Mono',monospace; color:#eaf3ff; text-shadow:0 1px 3px #000; }

    /* ── level-up flourish ── */
    .xto-flourish{ position:fixed; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:8px; pointer-events:none; opacity:0; }
    .xto-flourish.go{ animation:xtoFlFade 1.7s ease-out forwards; }
    @keyframes xtoFlFade{ 0%{opacity:0} 12%{opacity:1} 72%{opacity:1} 100%{opacity:0} }
    .xto-flRing{ position:absolute; width:70px; height:70px; border-radius:50%;
      border:3px solid var(--xto-accent); box-shadow:0 0 40px var(--xto-accent); }
    .xto-flourish.go .xto-flRing{ animation:xtoFlRing 1.7s cubic-bezier(.15,.7,.3,1) forwards; }
    @keyframes xtoFlRing{ 0%{ transform:scale(.3); opacity:.9 } 100%{ transform:scale(7); opacity:0 } }
    .xto-flTxt{ font-family:'Cinzel','Segoe UI',serif; font-weight:900; letter-spacing:.24em; font-size:clamp(28px,6vw,52px);
      color:#fff; text-shadow:0 0 30px var(--xto-accent), 0 0 10px var(--xto-accent); z-index:1; }
    .xto-flourish.go .xto-flTxt{ animation:xtoFlText 1.7s ease-out forwards; }
    @keyframes xtoFlText{ 0%{ transform:translateY(14px) scale(.85); letter-spacing:.05em } 20%{ transform:translateY(0) scale(1) } 100%{ transform:translateY(-8px) } }
    .xto-flSub{ font-family:'IBM Plex Mono',monospace; font-size:12px; letter-spacing:.3em; color:var(--xto-accent);
      text-shadow:0 0 12px var(--xto-accent); z-index:1; }

    /* ── damage / heal screen vignette ── */
    .xto-vignette{ position:fixed; inset:0; pointer-events:none; opacity:0; }
    .xto-vignette.dmg{ box-shadow:inset 0 0 140px 20px rgba(255,40,80,.55); animation:xtoVig .42s ease-out; }
    .xto-vignette.heal{ box-shadow:inset 0 0 140px 20px rgba(55,245,176,.45); animation:xtoVig .42s ease-out; }
    @keyframes xtoVig{ 0%{opacity:0} 30%{opacity:1} 100%{opacity:0} }

    /* ── mobile ── */
    @media (max-width:640px){
      .xto-vitals{ width:min(280px,82vw); left:10px; bottom:10px; padding:10px 12px; }
      .xto-stats{ right:10px; top:10px; padding:8px 11px; }
      .xto-grid{ grid-template-columns:repeat(5,1fr); gap:6px; }
      .xto-slotIco{ font-size:17px; }
    }`;
    document.head.appendChild(s);
  }

  // publish under the exact name the shell boots
  window.XTO_Mechanics = { build: XTO_Mechanics_build };
})();
