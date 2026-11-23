/* ═══════════════════════════════════════════════════════════════════════
   SHADDAI TACTICS v2 — Full FFTA Runtime Engine
   • Elevation grid (0-4) + terrain types (plains/forest/water/etc.)
   • FFTA damage formula: WAtk - WDef/2 × Power/100 × modifiers
   • Status ailments apply from spells with chance checks
   • Job-specific AI (mages cast, healers heal, thieves steal, etc.)
   • Canvas attack animations (slash, fireball, heal, jump, thunder)
   • Shop buy/sell interface
   • Equipment change panel (weapon + armor swap)
   • AP tracking + ability mastery (permanent after threshold)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const T = window.tactics;
  if (!T) { document.body.innerHTML = '<h1>Missing tactics-engine.js</h1>'; return; }

  const { RACES, JOBS, JOB_LIST, ABILS, ABILITIES, ABILITY_BY_NAME, ABILITY_CAT,
          EQUIP, AILMENTS, LAW_POOL, STORY_MISSIONS, DISPATCH, ENCOUNTERS,
          ENEMY_CLANS, CLAN_NAMES } = T;

  const SAVE_KEY = 'shaddai_tactics_save';
  const COLS = 16, ROWS = 12;
  const TILE = 48;
  const GRID_W = COLS * TILE, GRID_H = ROWS * TILE;
  const ISO_TW = 64, ISO_TH = 32;
  const ISO_HW = ISO_TW / 2, ISO_HH = ISO_TH / 2;
  const ISO_OFFSET_X = ROWS * ISO_HW;
  const ISO_OFFSET_Y = 16;
  const ISO_W = (COLS + ROWS) * ISO_HW;
  const ISO_H = (COLS + ROWS) * ISO_HH + 24;

  const TERRAIN = {
    plains:  { name:'Plains',  color:'#6a8a5a', altColor:'#5e7e4e', moveCost:1, defBonus:0,  evadeBonus:0,  healPct:0 },
    forest:  { name:'Forest',  color:'#3a6a3a', altColor:'#2e5e2e', moveCost:2, defBonus:1,  evadeBonus:10, healPct:0 },
    water:   { name:'Water',   color:'#4a7aaa', altColor:'#3e6e9e', moveCost:3, defBonus:0,  evadeBonus:0,  healPct:0.05 },
    sand:    { name:'Sand',    color:'#c8b878', altColor:'#baaa6a', moveCost:2, defBonus:0,  evadeBonus:-5, healPct:0 },
    stone:   { name:'Stone',   color:'#8a8a9a', altColor:'#7a7a8a', moveCost:1, defBonus:2,  evadeBonus:5,  healPct:0 },
    lava:    { name:'Lava',    color:'#aa4a2a', altColor:'#9a3a1a', moveCost:4, defBonus:0,  evadeBonus:0,  healPct:0, lavaDmg:0.08 },
    snow:    { name:'Snow',    color:'#b8c8d8', altColor:'#aabaca', moveCost:2, defBonus:0,  evadeBonus:-5, healPct:0 },
    road:    { name:'Road',    color:'#8a7a5a', altColor:'#7a6a4a', moveCost:1, defBonus:0,  evadeBonus:0,  healPct:0 }
  };
  const TERRAIN_LIST = Object.keys(TERRAIN);

  const ELEMENTS = ['fire','ice','thunder','earth','wind','water','holy','dark'];
  const ELEM_CHART = {
    fire:{fire:1, ice:1.5, thunder:1, earth:0.5, wind:0.5, water:0},
    ice:{fire:1.5, ice:1, thunder:0.5, earth:1, wind:1, water:1.5}
  };

  function cutsceneNextVisible(on) {
    const el = dom.cutsceneNext;
    if (el) el.style.display = on ? 'block' : 'none';
  }

  const ITEMS = [
    { name:'Potion', heal:30, price:50, desc:'Heals 30 HP' },
    { name:'Hi-Potion', heal:80, price:150, desc:'Heals 80 HP' },
    { name:'Ether', mp:20, price:200, desc:'Restores 20 MP' },
    { name:'Phoenix Down', revive:0.25, price:200, desc:'Revives with 25% HP' }
  ];

  let state = {
    clanLevel: 1, gil: 1200, jp: 0, apPool: 0, completedMissions: [],
    units: [], battle: null, selectedUnit: null, selectedAbility: null,
    moveRange: null, actRange: null, shopOpen: false, animating: false,
    inventory: [], lawCards: [], recruitedLawCards: [],
    clanName: null, activeParty: [],
    currentLocation: 'cyril', currentScene: 'world',
    visitedLocations: ['cyril']
  };

  let $ = id => document.getElementById(id);
  let dom = {};

  function cacheDom() {
    dom = {
      subt: $('subt'), gil: $('gil'), worldGil: $('worldGil'), worldClanName: $('worldClanName'),
      mapCanvas: $('worldCanvas'),
      townMenu: $('townMenu'), townTitle: $('townTitle'), townDesc: $('townDesc'),
      cutsceneModal: $('cutsceneModal'), cutsceneTitle: $('cutsceneTitle'),
      cutsceneText: $('cutsceneText'), cutsceneNext: $('cutsceneNext'), cutsceneChapter: $('cutsceneChapter'),
      cutsceneBg: $('cutsceneBg'), cutscenePortraitImg: $('cutscenePortraitImg'),
      pubLevel: $('pubLevel'), pubJP: $('pubJP'),
      pubAP: $('pubAP'), pubUnits: $('pubUnits'),
      missionsStory: $('missionsStory'), missionsDispatch: $('missionsDispatch'),
      missionsEncounter: $('missionsEncounter'), clanRoster: $('clanRoster'),
      clanRaces: $('clanRaces'), jobsUnlocked: $('jobsUnlocked'), jobsLocked: $('jobsLocked'),
      equipPanel: $('equipPanel'), shopPanel: $('shopPanel'),
      turnLabel: $('turnLabel'), round: $('round'), activeName: $('activeName'),
      activeHP: $('activeHP'), activeMP: $('activeMP'), lawsBar: $('lawsBar'),
      canvas: $('grid'), fmsg: $('fmsg'), uiName: $('uiName'), uiJob: $('uiJob'),
      uiRace: $('uiRace'), uiHP: $('uiHP'), uiMP: $('uiMP'), uiSPD: $('uiSPD'),
      uiHPbar: $('uiHPbar'), uiMPbar: $('uiMPbar'), uiStatuses: $('uiStatuses'),
      uiAtk: $('uiAtk'), uiDef: $('uiDef'), uiMag: $('uiMag'),
      abilityList: $('abilityList'), tOrder: $('tOrder'),
      endModal: $('endModal'), endTitle: $('endTitle'), endText: $('endText'),
      toast: $('toast'), sysmenu: $('sysmenu'), pubItems: $('pubItems'), clanName: $('clanName'),
      tabs: document.querySelectorAll('.tab'), terLabel: $('terrainLabel'),
      elevLabel: $('elevLabel')
    };
  }

  function toast(msg, warn) {
    const el = dom.toast; if (!el) return;
    el.textContent = msg;
    el.style.borderColor = warn ? 'var(--crimson)' : 'var(--line)';
    el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function fmsg(text, warn) {
    const el = dom.fmsg; if (!el) return;
    el.textContent = text;
    el.classList.toggle('warn', !!warn);
    el.classList.add('show');
    clearTimeout(el._ft); el._ft = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function switchTab(sceneId) {
    document.querySelectorAll('.scene').forEach(s => s.classList.remove('on'));
    const target = $(sceneId);
    if (target) target.classList.add('on');
    if (sceneId === 'world') { renderWorldMap(); if (dom.subt) dom.subt.textContent = 'World Map'; }
    else if (sceneId === 'battle') { if (dom.subt) dom.subt.textContent = 'Battlefield'; }
  }

  // ── IN-GAME MENU OVERLAYS (opened from town menu) ───────────────
  function showOverlay(id) {
    hideTownMenu();
    document.querySelectorAll('.game-overlay').forEach(o => o.classList.remove('on'));
    const el = $(id);
    if (!el) return;
    el.classList.add('on');
    if (id === 'pub') renderPub();
    else if (id === 'clan') renderClan();
    else if (id === 'jobs') renderJobs();
    else if (id === 'equip') renderEquip();
    else if (id === 'shop') renderShop();
    if (dom.subt) dom.subt.textContent = { pub:'Pub', clan:'Clan', jobs:'Jobs', equip:'Abilities', shop:'Shop' }[id] || id;
  }

  function hideOverlay(id) {
    const el = $(id);
    if (el) el.classList.remove('on');
  }

  function backToTown() {
    document.querySelectorAll('.game-overlay').forEach(o => o.classList.remove('on'));
    if (dom.subt) dom.subt.textContent = 'World Map';
    showTownMenu(state.currentLocation ? WORLD_LOCATIONS.find(l => l.id === state.currentLocation) : WORLD_LOCATIONS[0]);
  }

  // ── WORLD MAP DATA ──────────────────────────────────────────────────
  const WORLD_LOCATIONS = [
    { id:'cyril',      name:'Cyril',      x:6, y:2, type:'town', desc:'The capital of Ivalice — shops, pub, and clan headquarters', chapters:[] },
    { id:'eastVale',   name:'Eastern Vale', x:2, y:4, type:'battle', desc:'Rolling hills east of Cyril', chapters:[1] },
    { id:'kingsGate',  name:"King's Gate",  x:4, y:3, type:'battle', desc:'The fortified pass into the capital', chapters:[1] },
    { id:'borzoiCamp', name:'Borzoi Camp',  x:1, y:5, type:'battle', desc:'Bandit stronghold in the southern woods', chapters:[1] },
    { id:'crystalRuin',name:'Crystal Ruins',x:8, y:3, type:'battle', desc:'Ancient ruins pulsing with crystal energy', chapters:[1,2] },
    { id:'crystalVale',name:'Crystal Vale', x:9, y:4, type:'battle', desc:'Sacred valley where crystals bloom', chapters:[2] },
    { id:'lutiaPass',  name:'Lutia Pass',   x:3, y:7, type:'battle', desc:'Mountain pass watched over by Judges', chapters:[2] },
    { id:'scorpionDen',name:'Scorpion Den', x:5, y:8, type:'battle', desc:'Underground lair of Clan Scorpion', chapters:[2] },
    { id:'jagdCoast',  name:'Jagd Coast',   x:1, y:9, type:'battle', desc:'Lawless coastline where smugglers thrive', chapters:[2] },
    { id:'cyrilArena', name:'Cyril Arena',  x:7, y:1, type:'battle', desc:'The grand arena — fight under the Law', chapters:[2] },
    { id:'phantomWood',name:'Phantom Woods',x:10,y:6, type:'battle', desc:'Haunted forest where the dead walk', chapters:[3] },
    { id:'abandonedTheatre',name:'Abandoned Theatre',x:11,y:4,type:'battle',desc:'Crumbling theatre with a bloody history', chapters:[3] },
    { id:'frozenCath', name:'Frozen Cathedral',x:12,y:3,type:'battle',desc:'Ice-encased cathedral where totemas wake', chapters:[3] },
    { id:'cyrilDam',   name:'Cyril Dam',    x:6, y:5, type:'battle', desc:'Massive dam holding back the flood', chapters:[3] },
    { id:'redwood',    name:'Ancient Redwood',x:10,y:8,type:'battle',desc:'Primeval forest of the Viera', chapters:[3] },
    { id:'stormpeak',  name:'Stormpeak',    x:13,y:5, type:'battle', desc:'Mountaintop where storms gather', chapters:[3] },
    { id:'ancientLib', name:"Library of the Ancients",x:12,y:7,type:'battle',desc:'Forbidden knowledge sealed in stone', chapters:[3,4] },
    { id:'moogleVillage',name:'Moogle Village',x:9,y:9,type:'battle',desc:'Tiny village of industrious Moogles', chapters:[4] },
    { id:'cyrilGates', name:'Cyril Gates',  x:5, y:2, type:'battle', desc:'The outer defenses of the capital', chapters:[4] },
    { id:'jagdRift',   name:'Jagd Rift',    x:0, y:8, type:'battle', desc:'A rift in reality — Jagd energy bleeds through', chapters:[4] },
    { id:'graveyard',  name:'Graveyard of Crystals',x:11,y:10,type:'battle',desc:'Cemetery of broken crystals', chapters:[4] },
    { id:'crystalPlains',name:'Crystal Plains',x:7,y:6,type:'battle',desc:'Open plain where the final clan war begins', chapters:[4] },
    { id:'crystalSanctum',name:'Crystal Sanctum',x:8,y:5,type:'battle',desc:'The heart of all crystals in Ivalice', chapters:[4] },
    { id:'genesisGate',name:'Genesis Gate', x:14,y:6, type:'battle', desc:'The final gate — beyond lies the creator', chapters:[4] },
    { id:'verdantMeadows',name:'Verdant Meadows',x:3,y:1,type:'battle',desc:'Lush green fields north of Cyril — home to rare flora', chapters:[2] },
    { id:'forgottenCatacombs',name:'Forgotten Catacombs',x:0,y:3,type:'battle',desc:'Ancient burial chambers sealed for centuries', chapters:[3] },
    { id:'moltenDepths',name:'Molten Depths',x:14,y:2,type:'battle',desc:'Volcanic chasm where fire totemas once slept', chapters:[3] },
    { id:'obsidianKeep',name:'Obsidian Keep',x:4,y:6,type:'battle',desc:'Dark fortress carved from volcanic glass', chapters:[3] },
    { id:'skyLighthouse',name:'Sky Lighthouse',x:13,y:8,type:'battle',desc:'Tower reaching into the clouds — a beacon of old magic', chapters:[4] },
    { id:'tidalShoals',name:'Tidal Shoals',x:2,y:10,type:'battle',desc:'Treacherous tidal flats where ships are lured to ruin', chapters:[4] }
  ];
  // World map - original good size
  const WORLD_W = 1000, WORLD_H = 700;
  let worldCamera = { x: 0, y: 0 };
  let playerPos = { x: 0, y: 0 };
  let isWalking = false;
  let walkPath = [];
  let walkStep = 0;
  let walkT = 0;
  const WALK_SPEED = 3;
  let walkAnimationId = null;

  // ── ELEVATION + TERRAIN GRID ─────────────────────────────────────────
  let grid = [];
  let elevation = [];
  let terrain = [];

  function buildGrid(mission) {
    grid = []; elevation = []; terrain = [];
    const biome = mission ? (mission.biome || 'plains') : 'plains';
    for (let c = 0; c < COLS; c++) {
      grid[c] = []; elevation[c] = []; terrain[c] = [];
      for (let r = 0; r < ROWS; r++) {
        let blocked = 0;
        if ((c === 0 || c === COLS-1) && Math.random() < 0.2) blocked = 1;
        if ((r === 0 || r === ROWS-1) && Math.random() < 0.15) blocked = 1;
        if (c > 3 && c < COLS-4 && r > 3 && r < ROWS-4 && Math.random() < 0.08) blocked = 1;
        grid[c][r] = blocked;

        const baseElev = Math.floor(Math.random() * 3);
        elevation[c][r] = blocked ? 0 : baseElev;

        if (blocked) {
          terrain[c][r] = 'stone';
        } else {
          const roll = Math.random();
          if (biome === 'plains') terrain[c][r] = roll < 0.6 ? 'plains' : roll < 0.75 ? 'road' : roll < 0.88 ? 'forest' : 'sand';
          else if (biome === 'forest') terrain[c][r] = roll < 0.4 ? 'forest' : roll < 0.6 ? 'plains' : roll < 0.75 ? 'water' : 'road';
          else if (biome === 'desert') terrain[c][r] = roll < 0.5 ? 'sand' : roll < 0.7 ? 'stone' : 'plains';
          else if (biome === 'snow') terrain[c][r] = roll < 0.4 ? 'snow' : roll < 0.6 ? 'stone' : 'plains';
          else if (biome === 'volcano') terrain[c][r] = roll < 0.3 ? 'lava' : roll < 0.5 ? 'stone' : 'sand';
          else terrain[c][r] = 'plains';
        }
      }
    }
  }

  function isPassable(c, r, ignoreUnits) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    if (grid[c][r] === 1) return false;
    if (!ignoreUnits && state.battle) {
      const all = state.battle.allies.concat(state.battle.enemies);
      if (all.some(u => u.col === c && u.row === r && !u.ko)) return false;
    }
    return true;
  }

  function getMoveCost(c, r) {
    const t = terrain[c] && terrain[c][r] ? terrain[c][r] : 'plains';
    return TERRAIN[t] ? TERRAIN[t].moveCost : 1;
  }

  function heuristic(a, b) { return Math.abs(a.c - b.c) + Math.abs(a.r - b.r); }

  function getNeighbors(c, r, unit) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const res = [];
    const ignoreUnits = !!unit;
    for (const [dc, dr] of dirs) {
      const nc = c + dc, nr = r + dr;
      if (isPassable(nc, nr, ignoreUnits)) {
        // Check elevation difference (max 1 level change unless jump)
        const elevDiff = Math.abs((elevation[c]||[0])[c] - (elevation[nc]||[0])[nr]);
        const maxJump = unit ? (unit.jump || 2) : 1;
        if (elevDiff <= maxJump) res.push({c:nc, r:nr, cost:getMoveCost(nc, nr)});
      }
    }
    return res;
  }

  function aStar(start, end, unit) {
    const open = [{ c:start.c, r:start.r, g:0, f:heuristic(start, end), parent:null, cost:0 }];
    const closed = new Set();
    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift();
      const key = `${cur.c},${cur.r}`;
      if (cur.c === end.c && cur.r === end.r) {
        const path = [];
        let node = cur;
        while (node) { path.unshift({c:node.c, r:node.r}); node = node.parent; }
        return path;
      }
      if (closed.has(key)) continue;
      closed.add(key);
      const maxMove = unit ? (unit.move || 4) : 4;
      for (const nb of getNeighbors(cur.c, cur.r, unit)) {
        const nk = `${nb.c},${nb.r}`;
        if (closed.has(nk)) continue;
        const ng = cur.g + (nb.cost || 1);
        if (ng > maxMove) continue;
        open.push({ c:nb.c, r:nb.r, g:ng, f:ng + heuristic(nb, end), cost:ng, parent:cur });
      }
    }
    return null;
  }

  function floodFill(start, maxSteps, unit) {
    const visited = new Set();
    const result = [];
    const queue = [{c:start.c, r:start.r, d:0}];
    while (queue.length) {
      const {c, r, d} = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (d > 0) result.push({c, r, cost:getMoveCost(c, r)});
      if (d >= maxSteps) continue;
      for (const nb of getNeighbors(c, r, unit)) {
        if (!visited.has(`${nb.c},${nb.r}`)) {
          queue.push({c:nb.c, r:nb.r, d:d + (nb.cost || 1)});
        }
      }
    }
    return result;
  }

  // ── FFTA DAMAGE FORMULA ───────────────────────────────────────────────
  // Physical: floor((WAtk - WDef/2) × Power/100 × mods)
  // Magical:  floor((MPow - MRes/2) × Power/100 × mods)
  // WAtk = unit.atk + weapon atk bonus
  // WDef = target.def + armor def bonus
  // MPow = unit.mag + weapon MP bonus
  // MRes = target's magic resist

  function calcDamage(attacker, target, ability) {
    if (ability.heal) {
      const mpow = attacker.mag + (attacker.weapon ? attacker.weapon.mp || 0 : 0);
      let heal = Math.floor((mpow + 4) * (ability.power || 10) / 100 * 2 + 6);
      if (ability.name === 'White Wind') heal = Math.floor(attacker.hp * 0.5);
      if (ability.name === 'Life' || ability.revive) heal = Math.floor(target.maxHp * 0.5);
      if (ability.name === 'Full-Life') heal = target.maxHp;
      if (target.ko && ability.revive) return { dmg:0, heal, revive:true };
      return { dmg:0, heal, revive:false };
    }

    const isMagical = ability.mp > 0 && ability.cat !== 'C' && ability.cat !== 'S' && ability.cat !== 'M' && ability.cat !== 'D' && ability.cat !== 'F' && ability.cat !== 'R' && ability.cat !== 'G' && ability.cat !== 'J' && ability.cat !== 'E';
    const isPhysical = !isMagical;

    let baseAtk, baseDef;
    if (isPhysical) {
      const watk = attacker.atk + (attacker.weapon ? attacker.weapon.atk || 0 : 1);
      const wdef = target.def + (target.armor ? target.armor.def || 0 : 0);
      baseAtk = watk;
      baseDef = wdef;
    } else {
      const mpow = attacker.mag + (attacker.weapon ? attacker.weapon.mp || 0 : 0);
      const mres = target.mag || target.def;
      baseAtk = mpow;
      baseDef = mres;
    }

    let baseDmg = Math.floor(Math.max(1, baseAtk - baseDef / 2) * (ability.power || 8) / 100 * 2 + 2);
    baseDmg = Math.max(1, baseDmg);

    // Facing bonus (simplified: check direction)
    let facingMod = 1.0;
    if (attacker.direction !== undefined && target.direction !== undefined) {
      const dirs = [[0,1],[0,-1],[-1,0],[1,0]];
      const atkDir = dirs[attacker.direction] || [0,1];
      const targetPos = {c:target.col - attacker.col, r:target.row - attacker.row};
      const dot = atkDir[0] * targetPos.c + atkDir[1] * targetPos.r;
      if (dot > 0) facingMod = 1.2; // back attack
      else if (dot === 0) facingMod = 1.1; // side
    }

    // Elevation bonus
    const atkElev = elevation[attacker.col] ? elevation[attacker.col][attacker.row] || 0 : 0;
    const defElev = elevation[target.col] ? elevation[target.col][target.row] || 0 : 0;
    const elevMod = 1 + Math.max(0, atkElev - defElev) * 0.1;

    // Elemental modifier
    let elemMod = 1;
    if (ability.elem && target.element) {
      const chart = ELEM_CHART[ability.elem];
      if (chart && chart[target.element] !== undefined) elemMod = chart[target.element];
      if (ability.elem === target.element) elemMod = 0.5; // same element resists
    }

    // Terrain bonus
    const tType = terrain[target.col] ? terrain[target.col][target.row] : 'plains';
    const tData = TERRAIN[tType];
    const terrainDef = tData ? tData.defBonus : 0;
    baseDef += terrainDef;

    // Blind penalty
    let hitChance = 1;
    if (attacker.ailments && attacker.ailments.includes('blind')) hitChance = 0.5;
    if (attacker.ailments && attacker.ailments.includes('frog')) hitChance = 0.3;

    // Status drain effects (poison etc handled in tick)
    const dmg = Math.floor(baseDmg * facingMod * elevMod * elemMod);
    const result = { dmg: Math.max(1, dmg), heal:0, hitChance, revive:false };

    // Status application
    if (ability.status && ability.chance && target.ailments) {
      const resist = (target.level || 1) * 2;
      const procChance = ability.chance * (1 - resist / 100);
      if (Math.random() < procChance) {
        if (!target.ailments.includes(ability.status)) {
          target.ailments.push(ability.status);
          result.statusApplied = ability.status;
        }
      }
    }

    // Debuffs
    if (ability.debuff && target) {
      target._debuffs = target._debuffs || {};
      target._debuffs[ability.debuff] = (target._debuffs[ability.debuff] || 0) + 1;
    }

    // Buffs
    if (ability.buff && target) {
      target._buffs = target._buffs || {};
      target._buffs[ability.buff] = (target._buffs[ability.buff] || 0) + 1;
    }

    // Special: Demi
    if (ability.demi) {
      result.dmg = Math.floor(target.hp / 2);
    }

    // Special: Steal
    if (ability.steal) {
      result.steal = true;
    }

    return result;
  }

  // ── STATUS EFFECT ROUND START ────────────────────────────────────────
  function processStatusStart() {
    const all = [...(state.battle.allies || []), ...(state.battle.enemies || [])];
    for (const u of all) {
      if (u.ko) continue;
      if (!u.ailments) u.ailments = [];
      for (let i = u.ailments.length - 1; i >= 0; i--) {
        const ail = AILMENTS[u.ailments[i]];
        if (!ail) continue;
        if (ail.tick && ail.tickDmg) {
          const tickDmg = Math.max(1, Math.floor(u.maxHp * ail.tickDmg));
          u.hp -= tickDmg;
          fmsg(`${u.name} takes ${tickDmg} ${u.ailments[i]} damage!`);
        }
        if (ail.tick && ail.tickHeal) {
          const heal = Math.max(1, Math.floor(u.maxHp * ail.tickHeal));
          u.hp = Math.min(u.maxHp, u.hp + heal);
          fmsg(`${u.name} regens ${heal} HP!`);
        }
      }
      // Random status expiration (20% chance per turn)
      for (let i = u.ailments.length - 1; i >= 0; i--) {
        if (u.ailments[i] === 'regen') continue; // buff, don't expire as fast
        if (Math.random() < 0.2) {
          u.ailments.splice(i, 1);
        }
      }
      u.hp = Math.max(0, Math.min(u.maxHp, u.hp));
      if (u.hp <= 0) u.ko = true;
    }
  }

  function hasAilment(u, ail) {
    return u.ailments && u.ailments.includes(ail);
  }

  // ── ANIMATIONS ────────────────────────────────────────────────────────
  let anims = [];

  function spawnAnim(type, origin, target, callback) {
    anims.push({ type, origin:{...origin}, target:{...target}, progress:0, callback });
    if (!state.animating) {
      state.animating = true;
      requestAnimationFrame(tickAnims);
    }
  }

  function tickAnims(ts) {
    if (!anims.length) { state.animating = false; return; }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.progress += 0.08;
      if (a.progress >= 1) {
        if (a.callback) a.callback();
        anims.splice(i, 1);
      }
    }
    renderGrid();
    if (anims.length) {
      requestAnimationFrame(tickAnims);
    } else {
      state.animating = false;
    }
  }

  function drawAnims(ctx) {
    for (const a of anims) {
      const t = a.progress;
      const originPos = tileToScreen(a.origin.c, a.origin.r, 0);
      const targetPos = tileToScreen(a.target.c, a.target.r, 0);
      const sx = originPos.x, sy = originPos.y;
      const ex = targetPos.x, ey = targetPos.y;
      const cx = sx + (ex - sx) * t;
      const cy = sy + (ey - sy) * t - 16 * Math.sin(t * Math.PI); // arc

      ctx.save();
      if (a.type === 'slash') {
        ctx.translate(cx, cy);
        ctx.rotate(t * Math.PI * 4);
        ctx.strokeStyle = 'rgba(255,200,100,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(12, 0);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,200,0.4)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 16 * t, 0, Math.PI * 2 * t);
        ctx.stroke();
      } else if (a.type === 'fire') {
        const r = 8 + 12 * Math.sin(t * Math.PI);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(255,200,50,${1-t})`);
        grad.addColorStop(0.5, `rgba(255,100,20,${0.8-t*0.5})`);
        grad.addColorStop(1, `rgba(200,40,10,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.fill();
      } else if (a.type === 'ice') {
        ctx.strokeStyle = `rgba(150,220,255,${1-t*0.5})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const angle = t * Math.PI * 2 + i * Math.PI / 3;
          const len = 8 + 10 * t;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
          ctx.stroke();
        }
      } else if (a.type === 'thunder') {
        ctx.strokeStyle = `rgba(200,180,255,${1-t*0.3})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const segs = 4;
          let px = ex, py = ey - 20 * t;
          for (let s = 0; s < segs; s++) {
            const nx = px + (Math.random() - 0.5) * 16;
            const ny = py - 16;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(nx, ny);
            ctx.stroke();
            px = nx; py = ny;
          }
        }
      } else if (a.type === 'heal') {
        const r = 8 + 6 * t;
        ctx.fillStyle = `rgba(100,255,150,${0.4*(1-t)})`;
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,200,${0.6*(1-t)})`;
        ctx.font = '14px sans-serif';
        ctx.fillText('✦', ex - 6, ey + 5);
      } else if (a.type === 'jump') {
        ctx.fillStyle = `rgba(200,200,255,${0.4*(1-t)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 4 + 8 * t, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.3*(1-t)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 20 * t);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── CANVAS RENDERER ─────────────────────────────────────────────────
  let ctx = null;

  function initCanvas() {
    const canvas = dom.canvas;
    if (!canvas) return;
    const container = canvas.parentElement;
    const w = container.clientWidth || 900;
    const h = container.clientHeight || 500;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min((w - 20) / ISO_W, (h - 20) / ISO_H, 1.4);
    canvas.width = ISO_W * dpr * scale;
    canvas.height = ISO_H * dpr * scale;
    canvas.style.width = (ISO_W * scale) + 'px';
    canvas.style.height = (ISO_H * scale) + 'px';
    ctx = canvas.getContext('2d');
    ctx.scale(dpr * scale, dpr * scale);
    ctx.imageSmoothingEnabled = false;
  }

  function renderGrid() {
    if (!ctx) return;
    ctx.clearRect(0, 0, ISO_W, ISO_H);
    ctx.fillStyle = '#060912';
    ctx.fillRect(0, 0, ISO_W, ISO_H);

    const tiles = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (!grid[c]) continue;
        const blocked = grid[c][r] === 1;
        const tType = terrain[c] ? terrain[c][r] : 'plains';
        const elev = elevation[c] ? elevation[c][r] : 0;
        tiles.push({ c, r, blocked, tType, elev });
      }
    }
    tiles.sort((a, b) => (a.c + a.r) - (b.c + b.r));

    for (const tile of tiles) {
      const { c, r, blocked, tType, elev } = tile;
      const pos = tileToScreen(c, r, elev);
      const x = pos.x, y = pos.y;
      const tData = TERRAIN[tType] || TERRAIN.plains;

      if (blocked) {
        drawDiamond(ctx, x, y, '#1a1a24', '#1a1a24');
      } else {
        const shade = ((c + r + elev) % 2 === 0) ? tData.color : tData.altColor;
        const alt = ((c + r + elev) % 2 === 0) ? tData.altColor : tData.color;
        drawDiamond(ctx, x, y, shade, alt);
      }

      ctx.strokeStyle = 'rgba(95,224,255,0.04)';
      ctx.lineWidth = 0.5;
      drawDiamondOutline(ctx, x, y);
    }

    // Move range overlay
    if (state.moveRange) {
      for (const tile of state.moveRange) {
        const pos = tileToScreen(tile.c, tile.r, 0);
        drawDiamond(ctx, pos.x, pos.y, 'rgba(0, 180, 255, 0.15)', null);
        ctx.strokeStyle = 'rgba(0, 180, 255, 0.4)';
        ctx.lineWidth = 1;
        drawDiamondOutline(ctx, pos.x, pos.y);
      }
    }

    // Act range overlay
    if (state.actRange) {
      for (const tile of state.actRange) {
        const pos = tileToScreen(tile.c, tile.r, 0);
        drawDiamond(ctx, pos.x, pos.y, 'rgba(255, 90, 77, 0.12)', null);
        ctx.strokeStyle = 'rgba(255, 90, 77, 0.35)';
        ctx.lineWidth = 1;
        drawDiamondOutline(ctx, pos.x, pos.y);
      }
    }

    // Units (depth sorted)
    if (state.battle) {
      const all = [...(state.battle.allies || []), ...(state.battle.enemies || [])];
      all.sort((a, b) => (a.col + a.row) - (b.col + b.row));
      for (const u of all) {
        if (u.ko) continue;
        const elev = elevation[u.col] ? elevation[u.col][u.row] || 0 : 0;
        const pos = tileToScreen(u.col, u.row, elev);
        const x = pos.x, y = pos.y - ISO_HH;

        const color = u.isBoss ? '#ff5a4d' : (u.isEnemy ? '#ff7a3c' : '#00ff9c');
        const raceColor = RACES[u.race] ? RACES[u.race].sprite : '#aaa';
        const bodyColor = u.isEnemy ? '#cc3333' : '#338855';
        const skinColor = '#ccaa77';

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + ISO_HH - elev * 8 + 4, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(x, y - 6, 5, 0, Math.PI * 2);
        ctx.fillStyle = skinColor;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Torso
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x - 5, y, 10, 9);

        // Direction dot on body
        const dirs = [[0, 6], [0, -6], [-6, 0], [6, 0]];
        const d = dirs[u.direction || 0];
        if (d) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x + d[0] * 0.5, y + 4 + d[1] * 0.5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Race collar
        ctx.fillStyle = raceColor;
        ctx.fillRect(x - 4, y - 1, 8, 2);

        // HP bar
        const barW = 18, barH = 3;
        const barX = x - barW / 2, barY = y - 18;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX, barY, barW, barH);
        const hpPct = u.hp / u.maxHp;
        ctx.fillStyle = hpPct > 0.5 ? '#30b848' : (hpPct > 0.25 ? '#f0b820' : '#e84040');
        ctx.fillRect(barX, barY, barW * hpPct, barH);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(barX, barY, barW, barH);

        // Status icon
        if (u.ailments && u.ailments.length) {
          ctx.fillStyle = '#ff5a4d';
          ctx.font = '7px sans-serif';
          ctx.fillText(u.ailments[0][0].toUpperCase(), x - 8, y - 20);
        }

        ctx.shadowBlur = 0;
      }
    }

    // Selection highlight
    if (state.selectedUnit && !state.selectedUnit.ko) {
      const u = state.selectedUnit;
      const elev = elevation[u.col] ? elevation[u.col][u.row] || 0 : 0;
      const pos = tileToScreen(u.col, u.row, elev);
      ctx.strokeStyle = '#00ff9c';
      ctx.lineWidth = 2;
      drawDiamondOutline(ctx, pos.x, pos.y);
      ctx.strokeStyle = '#00ff9c';
      ctx.lineWidth = 1;
      drawDiamondOutline(ctx, pos.x, pos.y - 3);
    }

    drawAnims(ctx);
  }

  function tileToScreen(col, row, elev) {
    const e = elev || 0;
    return {
      x: (col - row) * ISO_HW + ISO_OFFSET_X,
      y: (col + row) * ISO_HH + ISO_OFFSET_Y - e * 8
    };
  }

  function drawDiamond(ctx, x, y, fillColor, altColor) {
    ctx.beginPath();
    ctx.moveTo(x, y - ISO_HH);
    ctx.lineTo(x + ISO_HW, y);
    ctx.lineTo(x, y + ISO_HH);
    ctx.lineTo(x - ISO_HW, y);
    ctx.closePath();
    ctx.fillStyle = fillColor || '#000';
    ctx.fill();
    if (altColor && altColor !== fillColor) {
      ctx.beginPath();
      ctx.moveTo(x, y - ISO_HH);
      ctx.lineTo(x + ISO_HW, y);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = altColor;
      ctx.fill();
    }
  }

  function drawDiamondOutline(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x, y - ISO_HH);
    ctx.lineTo(x + ISO_HW, y);
    ctx.lineTo(x, y + ISO_HH);
    ctx.lineTo(x - ISO_HW, y);
    ctx.closePath();
    ctx.stroke();
  }

  function pixelToGrid(px, py) {
    const canvas = dom.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = ISO_W / rect.width;
    const scaleY = ISO_H / rect.height;
    const gx = (px - rect.left) * scaleX;
    const gy = (py - rect.top) * scaleY;
    const fx = (gx - ISO_OFFSET_X) / ISO_HW;
    const fy = (gy - ISO_OFFSET_Y) / ISO_HH;
    const col = Math.floor((fx + fy) / 2 + 0.5);
    const row = Math.floor((fy - fx) / 2 + 0.5);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) return {col, row};
    return null;
  }

  // ── UNIT CREATION ────────────────────────────────────────────────────
  function createUnit(name, race, jobId, level) {
    const job = JOBS[jobId];
    if (!job || !RACES[race]) return null;
    const lvl = level || 1;
    const hp = job.hp * 2 + lvl * 3 + Math.floor(Math.random() * 6);
    const mp = job.mp + lvl * 2 + Math.floor(Math.random() * 3);
    return {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      name, race, job: jobId, level: lvl,
      maxHp: hp, hp, maxMp: mp, mp,
      atk: job.watk + lvl, def: job.wdef + lvl, mag: job.mpow + lvl, spd: job.spd + lvl,
      jump: job.jump || 2, move: 4,
      xp: 0, ap: 0,
      weapon: null, armor: null,
      abilities: [],
      equippedAbils: [],
      ailments: [],
      statuses: {},
      apTracker: {},
      element: null,
      direction: 0,
      ko: false, isEnemy: false, isBoss: false
    };
  }

  function generateStarterClan() {
    const units = [];
    units.push(createUnit('Marche', 'Human', 'Soldier', 1));
    units.push(createUnit('Montblanc', 'Moogle', 'BlackMage', 1));
    units.push(createUnit('Shara', 'Viera', 'Archer', 1));
    units.push(createUnit('Ritz', 'Human', 'Fighter', 1));
    const sword = EQUIP.find(e => e.name === 'Shortsword');
    if (sword) units[0].weapon = sword;
    const rod = EQUIP.find(e => e.name === 'Rod');
    if (rod) units[1].weapon = rod;
    const bow = EQUIP.find(e => e.name === 'Shortbow');
    if (bow) units[2].weapon = bow;
    return units;
  }

  function generateEnemies(mission) {
    const enemies = [];
    const count = mission.enemies || 4;
    const lvl = mission.level || 1;
    const enemyJobs = ['Soldier', 'Archer', 'BlackMage', 'WhiteMage', 'Thief', 'Fighter', 'Warrior', 'WhiteMonk'];
    const enemyRaces = ['Human', 'Viera', 'NuMou', 'Human', 'Human', 'Human', 'Bangaa', 'Bangaa'];
    const jobWeights = [2, 2, 1, 1, 1, 1, 1, 1];

    for (let i = 0; i < count; i++) {
      const totalW = jobWeights.reduce((a,b)=>a+b, 0);
      let roll = Math.random() * totalW;
      let ri = 0;
      for (let j = 0; j < jobWeights.length; j++) {
        roll -= jobWeights[j];
        if (roll <= 0) { ri = j; break; }
      }
      const jobId = enemyJobs[ri];
      const race = enemyRaces[ri] || 'Human';
      const u = createUnit(`Enemy ${i+1}`, race, jobId, Math.max(1, lvl + Math.floor(Math.random() * 3 - 1)));
      u.isEnemy = true;
      const weps = EQUIP.filter(e => e.slot === 'w' && e.jobs.includes(jobId));
      if (weps.length) {
        const randWep = weps[Math.floor(Math.random() * Math.min(weps.length, lvl + 1))];
        if (randWep) u.weapon = randWep;
      }
      const armors = EQUIP.filter(e => e.slot === 'a' && e.def <= lvl * 2 + 2);
      if (armors.length) {
        u.armor = armors[Math.floor(Math.random() * Math.min(armors.length, 3))];
      }
      enemies.push(u);
    }

    if (mission.boss) {
      const boss = createUnit('Commander', 'Bangaa', 'Gladiator', lvl + 2);
      boss.isEnemy = true;
      boss.isBoss = true;
      const clay = EQUIP.find(e => e.name === 'Buster Sword');
      if (clay) boss.weapon = clay;
      const plate = EQUIP.find(e => e.name === 'Bronze Armor');
      if (plate) boss.armor = plate;
      enemies.push(boss);
    }
    return enemies;
  }

  // ── DEPLOY BATTLE ──────────────────────────────────────────────────
  function deployBattle(mission, allies, enemies) {
    buildGrid(mission);
    state.battle = {
      mission, allies: [], enemies: [], turnQueue: [], round: 1,
      phase: 'SPAWN', activeIdx: 0, turnOrder: [], judgePoints: 0, laws: []
    };
    state.selectedUnit = null;
    state.moveRange = null;
    state.actRange = null;
    state.selectedAbility = null;

    const numLaws = Math.min(2, Math.floor(mission.level / 3) + 1);
    const shuffled = [...LAW_POOL].sort(() => Math.random() - 0.5);
    state.battle.laws = shuffled.slice(0, numLaws);

    const half = Math.floor(ROWS / 2);
    const offset = Math.floor((ROWS - Math.max(allies.length, enemies.length) * 2) / 2);

    allies.forEach((u, i) => {
      const clone = JSON.parse(JSON.stringify(u));
      clone.col = 1 + Math.floor(Math.random() * 2);
      clone.row = Math.min(ROWS-1, Math.max(0, offset + i * 2));
      clone.ko = false; clone.ailments = []; clone.statuses = {};
      clone.element = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
      clone.hp = clone.maxHp; clone.mp = clone.maxMp;
      if (!clone.apTracker) clone.apTracker = {};
      state.battle.allies.push(clone);
    });

    enemies.forEach((u, i) => {
      const clone = JSON.parse(JSON.stringify(u));
      clone.col = COLS - 2 - Math.floor(Math.random() * 2);
      clone.row = Math.min(ROWS-1, Math.max(0, offset + i * 2 + (i % 2)));
      clone.ko = false; clone.ailments = []; clone.statuses = {};
      clone.element = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
      clone.hp = clone.maxHp; clone.mp = clone.maxMp;
      if (!clone.apTracker) clone.apTracker = {};
      state.battle.enemies.push(clone);
    });

    rebuildTurnOrder();
    switchTab('battle');
    initCanvas();
    renderGrid();
    updateBattleUI();
    updateLawsBar();

    // Battle entrance: dark overlay fade-in
    const viewport = document.getElementById('viewport');
    if (viewport) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;background:#000;z-index:3;pointer-events:none;transition:opacity .6s';
      viewport.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 700);
      });
    }

    state.battle.phase = 'PLAYER';
    fmsg('Battle begins! Select a unit.');
  }

  // ── TURN ORDER ─────────────────────────────────────────────────────
  function rebuildTurnOrder() {
    const all = [];
    state.battle.allies.forEach(u => { if (!u.ko) all.push({...u, side:'ally'}); });
    state.battle.enemies.forEach(u => { if (!u.ko) all.push({...u, side:'enemy'}); });
    all.sort((a, b) => {
      // Slow halves speed
      const spdA = a.ailments && a.ailments.includes('slow') ? Math.floor(a.spd / 2) : a.spd;
      const spdB = b.ailments && b.ailments.includes('slow') ? Math.floor(b.spd / 2) : b.spd;
      return spdB - spdA || Math.random() - 0.5;
    });
    state.battle.turnOrder = all;
    state.battle.activeIdx = 0;
  }

  function getCurrentTurnUnit() {
    const order = state.battle.turnOrder;
    if (!order || !order.length) return null;
    const idx = state.battle.activeIdx;
    if (idx >= order.length) return null;
    return order[idx];
  }

  function getActualUnit(turnEntry) {
    if (!turnEntry) return null;
    const pool = turnEntry.side === 'ally' ? state.battle.allies : state.battle.enemies;
    return pool.find(u => u.id === turnEntry.id);
  }

  function nextTurn() {
    state.moveRange = null;
    state.actRange = null;
    state.selectedAbility = null;
    state.selectedUnit = null;
    renderGrid();
    state.battle.activeIdx++;
    const order = state.battle.turnOrder;
    if (state.battle.activeIdx >= order.length) {
      state.battle.round++;
      state.battle.activeIdx = 0;
      processStatusStart();
      rebuildTurnOrder();
    }

    const alliesAlive = state.battle.allies.filter(u => !u.ko);
    const enemiesAlive = state.battle.enemies.filter(u => !u.ko);
    if (enemiesAlive.length === 0) { victory(); return; }
    if (alliesAlive.length === 0) { defeat(); return; }

    const cur = getCurrentTurnUnit();
    if (!cur) return;

    rebuildTurnOrder();
    const actual = getActualUnit(cur);
    if (!actual) { nextTurn(); return; }

    // Status checks
    if (hasAilment(actual, 'sleep')) { fmsg(`${actual.name} is asleep!`); setTimeout(nextTurn, 600); return; }
    if (hasAilment(actual, 'stop')) { fmsg(`${actual.name} is stopped!`); setTimeout(nextTurn, 600); return; }

    if (cur.side === 'enemy') {
      state.battle.phase = 'ENEMY';
      updateBattleUI();
      state.selectedUnit = actual;
      setTimeout(() => doEnemyAI(actual), 500);
    } else {
      state.battle.phase = 'PLAYER';
      state.selectedUnit = actual;
      updateBattleUI();
      renderGrid();
      fmsg(`Your turn: ${cur.name}`);
    }
  }

  // ── JOB-SPECIFIC AI ─────────────────────────────────────────────────
  function doEnemyAI(enemy) {
    if (enemy.ko) { nextTurn(); return; }

    const allies = state.battle.allies.filter(a => !a.ko);
    if (allies.length === 0) { victory(); return; }

    // Confusion: random target
    if (hasAilment(enemy, 'confuse')) {
      const all = [...state.battle.allies, ...state.battle.enemies].filter(u => !u.ko && u.id !== enemy.id);
      if (all.length) {
        const target = all[Math.floor(Math.random() * all.length)];
        performAttack(enemy, target);
      } else { nextTurn(); }
      return;
    }

    // Berserk: force attack nearest
    if (hasAilment(enemy, 'berserk')) {
      const nearest = findNearest(enemy, allies);
      if (nearest) { performAttack(enemy, nearest); return; }
    }

    const job = enemy.job;
    const hasWeapon = enemy.weapon && enemy.weapon.slot === 'w';
    const wepRange = hasWeapon ? (enemy.weapon.range || 1) : 1;

    // Job-specific AI behaviors
    switch (job) {
      case 'WhiteMage': case 'Bishop': { doHealerAI(enemy, allies); return; }
      case 'BlackMage': case 'Elementalist': case 'Illusionist': { doMageAI(enemy, allies); return; }
      case 'Archer': case 'Sniper': case 'Hunter': { doRangedAI(enemy, allies); return; }
      case 'Thief': { doThiefAI(enemy, allies); return; }
      case 'TimeMage': { doTimeMageAI(enemy, allies); return; }
      case 'WhiteMonk': { doMonkAI(enemy, allies); return; }
      default: { doMeleeAI(enemy, allies, wepRange); return; }
    }
  }

  function findNearest(unit, targets) {
    let nearest = null, nearDist = Infinity;
    for (const t of targets) {
      const d = Math.abs(t.col - unit.col) + Math.abs(t.row - unit.row);
      if (d < nearDist) { nearDist = d; nearest = t; }
    }
    return nearest;
  }

  function findLowestHp(units) {
    return units.filter(u => !u.ko).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || null;
  }

  function doMeleeAI(enemy, allies, range) {
    const nearest = findNearest(enemy, allies);
    if (!nearest) { nextTurn(); return; }

    const dist = Math.abs(enemy.col - nearest.col) + Math.abs(enemy.row - nearest.row);
    if (dist <= range && !hasAilment(enemy, 'disable')) {
      // Maybe use a combat ability
      if (Math.random() < 0.3 && enemy.job === 'Gladiator') {
        const flame = ABILITIES.find(a => a.name === 'Flametongue');
        if (flame && enemy.mp >= (flame.mp || 0)) {
          useAbilityOn(enemy, nearest, flame);
          return;
        }
      }
      performAttack(enemy, nearest);
      return;
    }

    if (!hasAilment(enemy, 'disable') && !hasAilment(enemy, 'immobilize')) {
      const path = aStar({c:enemy.col, r:enemy.row}, {c:nearest.col, r:nearest.row}, enemy);
      if (path && path.length > 1) {
        const steps = Math.min(enemy.move || 4, path.length - 1);
        const target = path[steps];
        if (target) { enemy.col = target.c; enemy.row = target.r; }
      }
    }
    renderGrid(); updateBattleUI();

    const newDist = Math.abs(enemy.col - nearest.col) + Math.abs(enemy.row - nearest.row);
    if (newDist <= range && !hasAilment(enemy, 'disable')) {
      performAttack(enemy, nearest);
    } else {
      setTimeout(nextTurn, 400);
    }
  }

  function doRangedAI(enemy, allies) {
    const nearest = findNearest(enemy, allies);
    if (!nearest) { nextTurn(); return; }
    const range = enemy.weapon ? (enemy.weapon.range || 5) : 4;
    const dist = Math.abs(enemy.col - nearest.col) + Math.abs(enemy.row - nearest.row);

    // Prefer to stay at range, move away if too close
    if (dist < 3 && !hasAilment(enemy, 'disable') && !hasAilment(enemy, 'immobilize')) {
      const retreatDir = [
        {c: enemy.col + (enemy.col - nearest.col > 0 ? 1 : -1), r: enemy.row},
        {c: enemy.col, r: enemy.row + (enemy.row - nearest.row > 0 ? 1 : -1)},
        {c: enemy.col + 1, r: enemy.row}, {c: enemy.col - 1, r: enemy.row}
      ];
      for (const tile of retreatDir) {
        if (isPassable(tile.c, tile.r)) { enemy.col = tile.c; enemy.row = tile.r; break; }
      }
    }

    // If in range, use Aim ability
    if (dist <= range && !hasAilment(enemy, 'disable')) {
      if (enemy.job === 'Sniper' && Math.random() < 0.4) {
        const aim = ABILITIES.find(a => a.name === 'Aim:Vitals');
        if (aim) { useAbilityOn(enemy, nearest, aim); return; }
      }
      performAttack(enemy, nearest);
      return;
    }

    // Move closer
    if (!hasAilment(enemy, 'disable') && !hasAilment(enemy, 'immobilize')) {
      const path = aStar({c:enemy.col, r:enemy.row}, {c:nearest.col, r:nearest.row}, enemy);
      if (path && path.length > 1) {
        const steps = Math.min(enemy.move || 4, path.length - 1);
        const target = path[steps];
        if (target) { enemy.col = target.c; enemy.row = target.r; }
      }
    }
    renderGrid(); updateBattleUI();
    const newDist = Math.abs(enemy.col - nearest.col) + Math.abs(enemy.row - nearest.row);
    if (newDist <= range && !hasAilment(enemy, 'disable')) {
      performAttack(enemy, nearest);
    } else { setTimeout(nextTurn, 400); }
  }

  function doMageAI(enemy, allies) {
    const nearest = findNearest(enemy, allies);
    if (!nearest) { nextTurn(); return; }

    // Try to cast a damaging spell
    const spellNames = ['Fire', 'Thunder', 'Blizzard', 'Fira', 'Thundara', 'Blizzara', 'Firaga'];
    const job = ABILS[enemy.job] || [];
    const spells = ABILITIES.filter(a => a.mp > 0 && a.target === 'enemy' && a.power > 0);
    const available = spells.filter(a => a.mp <= enemy.mp && (job.includes(a.cat) || job.includes('B')));

    if (available.length > 0 && !hasAilment(enemy, 'disable') && !hasAilment(enemy, 'silence')) {
      const spell = available[Math.floor(Math.random() * available.length)];
      const dist = Math.abs(enemy.col - nearest.col) + Math.abs(enemy.row - nearest.row);
      const spellRange = spell.range || 4;

      if (dist <= spellRange) {
        useAbilityOn(enemy, nearest, spell);
        return;
      }
    }

    // Move closer
    if (!hasAilment(enemy, 'disable') && !hasAilment(enemy, 'immobilize')) {
      const path = aStar({c:enemy.col, r:enemy.row}, {c:nearest.col, r:nearest.row}, enemy);
      if (path && path.length > 1) {
        const steps = Math.min(enemy.move || 4, path.length - 1);
        const target = path[steps];
        if (target) { enemy.col = target.c; enemy.row = target.r; }
      }
    }
    renderGrid(); updateBattleUI();

    const dist2 = Math.abs(enemy.col - nearest.col) + Math.abs(enemy.row - nearest.row);
    if (available.length > 0 && dist2 <= (available[0].range || 4) && !hasAilment(enemy, 'disable') && !hasAilment(enemy, 'silence')) {
      useAbilityOn(enemy, nearest, available[0]);
    } else {
      setTimeout(nextTurn, 400);
    }
  }

  function doHealerAI(enemy, allies) {
    // Check nearby enemies that need healing
    const wounded = state.battle.enemies.filter(u => !u.ko && u.hp < u.maxHp * 0.6);
    if (wounded.length > 0 && enemy.mp >= 4 && !hasAilment(enemy, 'disable') && !hasAilment(enemy, 'silence')) {
      const target = wounded[0];
      const dist = Math.abs(enemy.col - target.col) + Math.abs(enemy.row - target.row);
      if (dist <= 4) {
        const cure = ABILITIES.find(a => a.name === 'Cure');
        if (cure) { useAbilityOn(enemy, target, cure); return; }
      }
    }

    // If no healing needed, attack or move
    const nearest = findNearest(enemy, allies);
    if (!nearest) { nextTurn(); return; }

    if (!hasAilment(enemy, 'disable') && !hasAilment(enemy, 'immobilize')) {
      const path = aStar({c:enemy.col, r:enemy.row}, {c:nearest.col, r:nearest.row}, enemy);
      if (path && path.length > 1) {
        const steps = Math.min(enemy.move || 4, path.length - 1);
        const target = path[steps];
        if (target) { enemy.col = target.c; enemy.row = target.r; }
      }
    }
    renderGrid(); updateBattleUI();
    setTimeout(nextTurn, 400);
  }

  function doThiefAI(enemy, allies) {
    // Try to steal from a weak target
    const weak = allies.filter(a => a.hp < a.maxHp * 0.4).sort((a, b) => a.hp - b.hp);
    const target = weak.length > 0 ? weak[0] : findNearest(enemy, allies);
    if (!target) { nextTurn(); return; }

    const dist = Math.abs(enemy.col - target.col) + Math.abs(enemy.row - target.row);
    if (dist <= 1 && !hasAilment(enemy, 'disable')) {
      // Try to steal gil
      fmsg(`${enemy.name} attempts to steal from ${target.name}!`);
      if (Math.random() < 0.3) {
        const stolen = Math.floor(10 + Math.random() * 20);
        target.hp = Math.max(0, target.hp - stolen);
        fmsg(`${enemy.name} steals ${stolen} HP!`);
      }
      setTimeout(nextTurn, 500);
      renderGrid(); updateBattleUI();
      return;
    }

    if (!hasAilment(enemy, 'disable') && !hasAilment(enemy, 'immobilize')) {
      const path = aStar({c:enemy.col, r:enemy.row}, {c:target.col, r:target.row}, enemy);
      if (path && path.length > 1) {
        const steps = Math.min(enemy.move || 5, path.length - 1);
        const tile = path[steps];
        if (tile) { enemy.col = tile.c; enemy.row = tile.r; }
      }
    }
    renderGrid(); updateBattleUI();
    setTimeout(nextTurn, 400);
  }

  function doTimeMageAI(enemy, allies) {
    const nearest = findNearest(enemy, allies);
    if (!nearest) { nextTurn(); return; }

    // Try Slow on a strong target
    if (enemy.mp >= 6 && !hasAilment(enemy, 'silence') && !hasAilment(enemy, 'disable')) {
      const strong = allies.slice().sort((a, b) => b.atk - a.atk)[0];
      if (strong) {
        const dist = Math.abs(enemy.col - strong.col) + Math.abs(enemy.row - strong.row);
        if (dist <= 4) {
          useAbilityOn(enemy, strong, { name:'Slow', mp:6, power:0, range:4, target:'enemy', status:'slow', chance:0.6 });
          return;
        }
      }
    }

    doMeleeAI(enemy, allies, 1);
  }

  function doMonkAI(enemy, allies) {
    const nearest = findNearest(enemy, allies);
    if (!nearest) { nextTurn(); return; }

    const dist = Math.abs(enemy.col - nearest.col) + Math.abs(enemy.row - nearest.row);
    if (dist <= 1 && !hasAilment(enemy, 'disable')) {
      if (enemy.hp < enemy.maxHp * 0.5 && Math.random() < 0.4) {
        // Self-heal
        const chakra = ABILITIES.find(a => a.name === 'Chakra');
        if (chakra) { useAbilityOn(enemy, enemy, chakra); return; }
      }
      const shock = ABILITIES.find(a => a.name === 'Shockwave');
      if (shock && dist <= 2) { useAbilityOn(enemy, nearest, shock); return; }
      performAttack(enemy, nearest);
      return;
    }

    if (!hasAilment(enemy, 'disable') && !hasAilment(enemy, 'immobilize')) {
      const path = aStar({c:enemy.col, r:enemy.row}, {c:nearest.col, r:nearest.row}, enemy);
      if (path && path.length > 1) {
        const steps = Math.min(enemy.move || 4, path.length - 1);
        const target = path[steps];
        if (target) { enemy.col = target.c; enemy.row = target.r; }
      }
    }
    renderGrid(); updateBattleUI();
    const nd = Math.abs(enemy.col - nearest.col) + Math.abs(enemy.row - nearest.row);
    if (nd <= 1 && !hasAilment(enemy, 'disable')) { performAttack(enemy, nearest); }
    else { setTimeout(nextTurn, 400); }
  }

  // ── PERFORM ATTACK ─────────────────────────────────────────────────
  function performAttack(attacker, target) {
    const fight = ABILITIES.find(a => a.name === 'Fight') || { mp:0, power:8, range:1, target:'enemy' };
    const result = calcDamage(attacker, target, fight);

    const hitMiss = result.hitChance !== undefined && Math.random() > result.hitChance;
    if (hitMiss) {
      fmsg(`${attacker.name} misses!`);
      // Still animate a miss
      spawnAnim('slash', {c:attacker.col, r:attacker.row}, {c:target.col, r:target.row}, null);
      renderGrid();
      if (attacker.isEnemy) setTimeout(nextTurn, 500);
      return;
    }

    target.hp -= result.dmg;
    if (target.hp <= 0) { target.hp = 0; target.ko = true; }

    const lawBreak = checkLawBreak(attacker, fight, target);
    const msg = lawBreak ? `LAW! ${result.dmg} dmg!` : `${result.dmg} dmg!`;
    fmsg(msg + (target.ko ? ' KO!' : ''), lawBreak);

    // Wake from sleep
    if (hasAilment(target, 'sleep')) {
      target.ailments = target.ailments.filter(a => a !== 'sleep');
    }

    // Animate
    setDirection(attacker, target);
    spawnAnim('slash', {c:attacker.col, r:attacker.row}, {c:target.col, r:target.row}, null);
    renderGrid();
    updateBattleUI();

    if (attacker.isEnemy) {
      setTimeout(nextTurn, 700);
    }
  }

  function setDirection(unit, target) {
    const dc = target.col - unit.col;
    const dr = target.row - unit.row;
    if (Math.abs(dc) > Math.abs(dr)) unit.direction = dc > 0 ? 3 : 2;
    else unit.direction = dr > 0 ? 0 : 1;
  }

  // ── USE ABILITY ON TARGET ──────────────────────────────────────────
  function useAbilityOn(user, target, ability) {
    const result = calcDamage(user, target, ability);
    const animType = getAnimForAbility(ability, result);

    if (ability.mp > 0) user.mp -= ability.mp;
    if (result.revive && target.ko) {
      target.ko = false;
      target.hp = result.heal;
      fmsg(`${target.name} is revived!`);
      spawnAnim('heal', {c:user.col, r:user.row}, {c:target.col, r:target.row}, null);
      renderGrid(); updateBattleUI();
      if (user.isEnemy) setTimeout(nextTurn, 600);
      return;
    }
    if (result.heal > 0) {
      const prev = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + result.heal);
      fmsg(`${ability.name} heals ${target.hp - prev} HP!`);
      spawnAnim('heal', {c:user.col, r:user.row}, {c:target.col, r:target.row}, null);
      renderGrid(); updateBattleUI();
      if (user.isEnemy) setTimeout(nextTurn, 600);
      return;
    }

    const miss = result.hitChance !== undefined && Math.random() > result.hitChance;
    if (miss) {
      fmsg(`${user.name}'s ${ability.name} misses!`);
      renderGrid();
      if (user.isEnemy) setTimeout(nextTurn, 600);
      return;
    }

    target.hp -= result.dmg;
    if (target.hp <= 0) { target.hp = 0; target.ko = true; }

    const lawBreak = checkLawBreak(user, ability, target);
    const statusMsg = result.statusApplied ? ` + ${result.statusApplied}!` : '';
    fmsg(`${ability.name}: ${result.dmg} dmg!${statusMsg}${target.ko ? ' KO!' : ''}${lawBreak ? ' LAW!' : ''}`, lawBreak);

    if (hasAilment(target, 'sleep')) {
      target.ailments = target.ailments.filter(a => a !== 'sleep');
    }

    setDirection(user, target);
    spawnAnim(animType, {c:user.col, r:user.row}, {c:target.col, r:target.row}, null);
    renderGrid();
    updateBattleUI();

    if (user.isEnemy) {
      setTimeout(nextTurn, 700);
    }
  }

  function getAnimForAbility(ability, result) {
    if (result.heal > 0 || result.revive) return 'heal';
    if (ability.elem === 'fire') return 'fire';
    if (ability.elem === 'ice') return 'ice';
    if (ability.elem === 'thunder') return 'thunder';
    if (ability.name === 'Jump' || ability.name === 'Jump Up') return 'jump';
    return 'slash';
  }

  // ── LAW CHECK ──────────────────────────────────────────────────────
  function checkLawBreak(unit, ability, target) {
    if (!state.battle || !state.battle.laws || !state.battle.laws.length) return false;
    for (const law of state.battle.laws) {
      if (law.restrict && law.restrict(ability)) {
        state.battle.judgePoints = Math.max(0, state.battle.judgePoints - 1);
        toast(`⚖ ${law.label} — Yellow card!`, true);
        return true;
      }
    }
    state.battle.judgePoints = (state.battle.judgePoints || 0) + 1;
    return false;
  }

  // ── VICTORY / DEFEAT ───────────────────────────────────────────────
  function victory() {
    state.battle.phase = 'END';
    const mission = state.battle.mission;
    const gilReward = 50 + (mission.level || 1) * 30;
    const apReward = 2 + (mission.level || 1) * 2;
    const jpReward = state.battle.judgePoints || 0;

    state.gil += gilReward;
    state.apPool += apReward;
    state.jp += jpReward;

    let levelUps = [];

    state.battle.allies.forEach(u => {
      if (!u.ko) {
        u.xp = (u.xp || 0) + 10 + mission.level * 3;
        if (u.xp >= 100) {
          u.xp -= 100; u.level++;
          const oldHP = u.maxHp, oldMP = u.maxMp, oldAtk = u.atk, oldDef = u.def, oldSpd = u.spd;
          u.maxHp += 3; u.hp = u.maxHp;
          u.maxMp += 2; u.mp = u.maxMp;
          u.atk++; u.def++; u.spd++;
          levelUps.push({ name: u.name, hp: oldHP + '→' + u.maxHp, mp: oldMP + '→' + u.maxMp, atk: oldAtk + '→' + u.atk, def: oldDef + '→' + u.def, spd: oldSpd + '→' + u.spd });
        }
        awardAP(u);
      }
    });

    let rewardMsg = gilReward + ' Gil, ' + apReward + ' AP, ' + jpReward + ' JP.';
    if (!state.completedMissions.includes(mission.num)) {
      state.completedMissions.push(mission.num);
      state.clanLevel = Math.floor(state.completedMissions.length / 4) + 1;
      if (mission.rewardItem) {
        addItemToInventory(mission.rewardItem, 1);
        rewardMsg += ' + ' + mission.rewardItem + ' earned!';
      }
    }

    saveState();

    let html = '<div>' + rewardMsg + '</div>';
    if (levelUps.length) {
      html += '<div class="levelup-wrap"><h3>✦ LEVEL UP ✦</h3>';
      levelUps.forEach(l => {
        html += '<div class="levelup-unit"><div class="luname">' + l.name + '</div>';
        html += '<div class="lus">HP <span class="up">' + l.hp + '</span></div>';
        html += '<div class="lus">MP <span class="up">' + l.mp + '</span></div>';
        html += '<div class="lus">ATK <span class="up">' + l.atk + '</span></div>';
        html += '<div class="lus">DEF <span class="up">' + l.def + '</span></div>';
        html += '<div class="lus">SPD <span class="up">' + l.spd + '</span></div>';
        html += '</div>';
      });
      html += '</div>';
    }

    dom.endTitle.textContent = 'VICTORY';
    dom.endText.innerHTML = html;
    dom.endModal.classList.add('on');

    // Return to Cyril after battle
    state.currentLocation = 'cyril';

    // Show story cutscene after victory
    setTimeout(() => {
      if (mission && mission.desc) {
        showCutscene(mission, 'victory');
      }
    }, 500);
  }

  function defeat() {
    state.battle.phase = 'END';
    dom.endTitle.textContent = 'DEFEAT';
    dom.endText.textContent = 'All allies down. Retreat and try again.';
    dom.endModal.classList.add('on');
    setTimeout(() => {
      if (state.battle && state.battle.mission) showCutscene(state.battle.mission, 'defeat');
    }, 500);
  }

  // ── AP TRACKING & MASTERY ──────────────────────────────────────────
  function awardAP(unit) {
    if (!unit.apTracker) unit.apTracker = {};
    const items = [unit.weapon, unit.armor].filter(Boolean);
    for (const item of items) {
      if (!item.ability) continue;
      const key = item.name;
      unit.apTracker[key] = (unit.apTracker[key] || 0) + 1;

      const equipDef = EQUIP.find(e => e.name === key);
      const needed = equipDef ? (equipDef.ap || 100) : 100;

      if (unit.apTracker[key] >= needed && !unit.abilities.includes(item.ability)) {
        unit.abilities.push(item.ability);
        toast(`${unit.name} mastered ${item.ability}!`);
      }
    }
  }

  function getAbilityProgress(unit, itemName) {
    if (!unit.apTracker) return 0;
    return unit.apTracker[itemName] || 0;
  }

  function getAbilityNeeded(itemName) {
    const e = EQUIP.find(x => x.name === itemName);
    return e ? (e.ap || 100) : 100;
  }

  // ── PLAYER ACTION HANDLERS ─────────────────────────────────────────
  function handlePlayerClick(px, py) {
    if (state.battle.phase !== 'PLAYER') return;
    const tile = pixelToGrid(px, py);
    if (!tile) return;
    const {col, row} = tile;
    const cur = getCurrentTurnUnit();
    if (!cur) return;
    const unit = getActualUnit(cur);
    if (!unit || unit.ko) return;

    if (state.moveRange) {
      const target = state.moveRange.find(t => t.c === col && t.r === row);
      if (target) {
        unit.col = col; unit.row = row;
        state.moveRange = null;
        renderGrid(); updateBattleUI();
        fmsg(`${unit.name} moved.`);
        return;
      }
      state.moveRange = null; renderGrid(); return;
    }

    if (state.actRange) {
      const target = state.actRange.find(t => t.c === col && t.r === row);
      if (target) {
        const allTargets = [...state.battle.allies, ...state.battle.enemies];
        const tgt = allTargets.find(u => u.col === col && u.row === row);
        if (tgt) {
          const abil = state.selectedAbility || ABILITIES.find(a => a.name === 'Fight');
          if (!abil) return;
          // Item use
          if (abil.item) {
            useItemOn(unit, tgt, abil.item);
            state.actRange = null; state.selectedAbility = null;
            return;
          }
          if (unit.mp >= (abil.mp || 0)) {
            if (abil.mp > 0) unit.mp -= abil.mp;
            useAbilityOn(unit, tgt, abil);
            state.actRange = null; state.selectedAbility = null;
            if (tgt.ko || true) setTimeout(nextTurn, 500);
            return;
          } else {
            toast('Not enough MP!', true); return;
          }
        }
      }
      state.actRange = null; state.selectedAbility = null; renderGrid(); return;
    }

    // Select own unit
    const clickedUnit = state.battle.allies.find(u => u.col === col && u.row === row && !u.ko);
    if (clickedUnit && clickedUnit.id === unit.id) {
      state.selectedUnit = unit; renderGrid(); updateBattleUI(); return;
    }

    // Click enemy to quick attack
    const enemy = state.battle.enemies.find(u => u.col === col && u.row === row && !u.ko);
    if (enemy) {
      const range = unit.weapon ? (unit.weapon.range || 1) : 1;
      const dist = Math.abs(unit.col - enemy.col) + Math.abs(unit.row - enemy.row);
      if (dist <= range && !hasAilment(unit, 'disable')) {
        performAttack(unit, enemy);
        return;
      }
      fmsg('Out of range! Move closer.');
    }
  }

  function setupCanvasClick() {
    const canvas = dom.canvas;
    if (!canvas) return;
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      handlePlayerClick(e.clientX, e.clientY);
    });
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      handlePlayerClick(touch.clientX, touch.clientY);
    }, { passive: false });
  }

  // ── ACTION BUTTONS ─────────────────────────────────────────────────
  function setupActions() {
    document.querySelectorAll('.act-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (state.battle.phase !== 'PLAYER') return;
        const cur = getCurrentTurnUnit();
        if (!cur) return;
        const unit = getActualUnit(cur);
        if (!unit || unit.ko) return;

        if (act === 'move') {
          if (hasAilment(unit, 'disable') || hasAilment(unit, 'immobilize')) {
            toast('Cannot move!', true); return;
          }
          state.moveRange = floodFill({c:unit.col, r:unit.row}, unit.move || 4, unit);
          state.actRange = null; state.selectedAbility = null;
          renderGrid(); fmsg('WASD to move · Enter to confirm.');
        } else if (act === 'fight') {
          if (hasAilment(unit, 'disable')) { toast('Cannot act!', true); return; }
          if (hasAilment(unit, 'silence')) { toast('Silenced!', true); }
          const range = unit.weapon ? (unit.weapon.range || 1) : 1;
          state.actRange = []; state.moveRange = null;
          state.selectedAbility = ABILITIES.find(a => a.name === 'Fight');
          state.battle.enemies.forEach(e => {
            if (e.ko) return;
            const dist = Math.abs(unit.col - e.col) + Math.abs(unit.row - e.row);
            if (dist <= range) state.actRange.push({c:e.col, r:e.row});
          });
          if (!state.actRange.length) toast('No enemies in range. Move closer!');
          renderGrid(); fmsg('Tap an enemy to attack.');
        } else if (act === 'item') {
          if (hasAilment(unit, 'disable')) { toast('Cannot act!', true); return; }
          openItemSelect(unit);
        } else if (act === 'wait') {
          fmsg(`${unit.name} waits.`);
          setTimeout(nextTurn, 300);
        }
      });
    });
  }

  // ── ITEM USE IN BATTLE ──────────────────────────────────────────────
  function openItemSelect(unit) {
    const hasItems = state.inventory && state.inventory.length > 0;
    const panel = dom.abilityList;
    if (!panel) return;
    panel.innerHTML = '<h4 style="font-size:10px;color:var(--muted);margin-bottom:6px">Select Item</h4>';
    if (!hasItems) {
      panel.innerHTML += '<div style="font-size:11px;color:var(--muted)">No items in inventory.</div>';
      return;
    }
    state.inventory.forEach((item, idx) => {
      const def = ITEMS.find(i => i.name === item.name);
      if (!def) return;
      const btn = document.createElement('button');
      btn.className = 'act-btn';
      btn.innerHTML = `<span class="ico">🧪</span><span class="lbl">${def.name}</span><span class="cost">×${item.qty || 1}</span>`;
      btn.addEventListener('click', () => {
        state.moveRange = null;
        state.actRange = [];
        // Determine valid targets
        let targets = [];
        if (def.revive) {
          targets = state.battle.allies.filter(t => t.ko);
        } else if (def.heal || def.mp) {
          targets = state.battle.allies.filter(t => !t.ko);
        }
        targets.forEach(t => {
          const dist = Math.abs(unit.col - t.col) + Math.abs(unit.row - t.row);
          if (dist <= 4) state.actRange.push({c:t.col, r:t.row});
        });
        state.selectedAbility = { name:def.name, item:def };
        renderGrid();
        fmsg(`Select target for ${def.name}`);
      });
      panel.appendChild(btn);
    });
    panel.innerHTML += '<button class="act-btn" onclick="renderGrid();updateBattleUI();fmsg(\'Cancelled.\')" style="border-color:rgba(255,90,77,.3);color:var(--crimson)"><span class="lbl">Cancel</span></button>';
  }

  function useItemOn(unit, target, itemDef) {
    if (!itemDef) return;
    state.actRange = null; state.selectedAbility = null;
    if (itemDef.heal) {
      const prev = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + itemDef.heal);
      fmsg(`${target.name} healed ${target.hp - prev} HP!`);
      spawnAnim('heal', {c:unit.col, r:unit.row}, {c:target.col, r:target.row}, null);
    } else if (itemDef.mp) {
      const prev = target.mp;
      target.mp = Math.min(target.maxMp, target.mp + itemDef.mp);
      fmsg(`${target.name} restored ${target.mp - prev} MP!`);
      spawnAnim('heal', {c:unit.col, r:unit.row}, {c:target.col, r:target.row}, null);
    } else if (itemDef.revive && target.ko) {
      target.ko = false;
      target.hp = Math.floor(target.maxHp * itemDef.revive);
      fmsg(`${target.name} is revived!`);
      spawnAnim('heal', {c:unit.col, r:unit.row}, {c:target.col, r:target.row}, null);
    }
    // Consume item
    const inv = state.inventory.find(i => i.name === itemDef.name);
    if (inv) { inv.qty = (inv.qty || 1) - 1; if (inv.qty <= 0) state.inventory = state.inventory.filter(i => i.name !== itemDef.name); }
    renderGrid(); updateBattleUI();
    setTimeout(nextTurn, 600);
  }

  function addItemToInventory(name, qty) {
    qty = qty || 1;
    const existing = state.inventory.find(i => i.name === name);
    if (existing) existing.qty = (existing.qty || 1) + qty;
    else state.inventory.push({ name, qty });
    saveState();
  }

  // ── KEYBOARD SHORTCUTS ──────────────────────────────────────────────
  function handleKeyboardInput(e) {
    const key = e.key;
    if (state.battle && state.battle.phase === 'PLAYER') {
      const cur = getCurrentTurnUnit();
      if (!cur) return;
      const unit = getActualUnit(cur);
      if (!unit || unit.ko) return;

      // Number keys 1-4: quick ability use
      const numKey = parseInt(key);
      if (numKey >= 1 && numKey <= 4) {
        const abils = dom.abilityList ? dom.abilityList.querySelectorAll('.act-btn') : [];
        if (abils[numKey - 1]) { abils[numKey - 1].click(); return; }
      }

      if (key === 'w' || key === 'W' || key === 'ArrowUp') { moveSelectedUnit(unit, 0, -1); return; }
      if (key === 's' || key === 'S' || key === 'ArrowDown') { moveSelectedUnit(unit, 0, 1); return; }
      if (key === 'a' || key === 'A' || key === 'ArrowLeft') { moveSelectedUnit(unit, -1, 0); return; }
      if (key === 'd' || key === 'D' || key === 'ArrowRight') { moveSelectedUnit(unit, 1, 0); return; }

      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        // Confirm: click on current tile
        if (dom.canvas) {
          const rect = dom.canvas.getBoundingClientRect();
          const px = rect.left + (unit.col + 0.5) * (rect.width / COLS);
          const py = rect.top + (unit.row + 0.5) * (rect.height / ROWS);
          handlePlayerClick(px, py);
        }
        return;
      }

      if (key === 'e' || key === 'E') {
        // End turn / Wait
        const waitBtn = document.querySelector('.act-btn[data-act="wait"]');
        if (waitBtn) waitBtn.click();
        return;
      }

      if (key === 'f' || key === 'F') {
        const fightBtn = document.querySelector('.act-btn[data-act="fight"]');
        if (fightBtn) fightBtn.click();
        return;
      }

      if (key === 'q' || key === 'Q') {
        // Cycle to next ally
        const alive = state.battle.allies.filter(a => !a.ko);
        const idx = alive.indexOf(unit);
        const next = alive[(idx + 1) % alive.length];
        if (next) {
          state.selectedUnit = next;
          renderGrid();
          updateBattleUI();
        }
        return;
      }
    }
  }

  function moveSelectedUnit(unit, dc, dr) {
    if (!state.moveRange) return;
    const nc = unit.col + dc, nr = unit.row + dr;
    const valid = state.moveRange.find(t => t.c === nc && t.r === nr);
    if (valid) {
      unit.col = nc; unit.row = nr;
      state.moveRange = null;
      renderGrid(); updateBattleUI();
      fmsg(`${unit.name} moved.`);
    }
  }

  function setupSysMenu() {
    const sysBtn = $('sysBtn');
    const sysMenu = dom.sysmenu;
    if (sysBtn) {
      sysBtn.addEventListener('click', () => sysMenu.classList.toggle('on'));
    }
    if (!sysMenu) return;
    sysMenu.querySelectorAll('.row').forEach(row => {
      row.addEventListener('click', () => {
        const action = row.dataset.sys;
        if (action === 'close') { sysMenu.classList.remove('on'); return; }
        if (action === 'flee') { sysMenu.classList.remove('on'); returnToPub(true); return; }
        if (action === 'order') { sysMenu.classList.remove('on'); showTurnOrder(); return; }
        if (action === 'mission') {
          sysMenu.classList.remove('on');
          if (state.battle && state.battle.mission) {
            toast(`Mission: ${state.battle.mission.name} — Lv.${state.battle.mission.level}`);
          } return;
        }
        if (action === 'laws') { sysMenu.classList.remove('on'); updateLawsBar(); return; }
        if (action === 'options') { sysMenu.classList.remove('on'); toast('Options coming soon.'); return; }
      });
    });
  }

  function showTurnOrder() {
    if (!state.battle) return;
    let msg = 'Turn Order: ';
    state.battle.turnOrder.forEach((u, i) => {
      msg += (i === state.battle.activeIdx ? '→ ' : '  ') + `${u.name}(SPD:${u.spd}) `;
    });
    toast(msg);
  }

  function returnToPub(fled) {
    dom.endModal.classList.remove('on');
    dom.cutsceneModal.classList.remove('on');
    dom.townMenu.classList.remove('on');
    state.battle = null; state.selectedUnit = null;
    state.moveRange = null; state.actRange = null;
    switchTab('world');
    if (fled) toast('You fled. No rewards.');
  }

  // ── WORLD MAP ────────────────────────────────────────────────────────
  function getLocPos(loc) { 
    return { x: 50 + loc.x * 65, y: 45 + loc.y * 65 }; 
  }

  function isLocationUnlocked(loc) {
    const currentChapter = Math.floor((state.completedMissions.length || 0) / 6) + 1;
    const locChapters = loc.chapters || [];
    if (locChapters.length === 0) return true;  // Always unlocked (like Cyril)
    return locChapters.some(ch => ch <= currentChapter);
  }

  function startWalkingTo(locId) {
    const destLoc = WORLD_LOCATIONS.find(l => l.id === locId);
    if (!destLoc || !isLocationUnlocked(destLoc)) {
      toast('That location is not yet unlocked!');
      return;
    }
    const destPos = getLocPos(destLoc);
    // Check if already at this location
    const distToTarget = Math.sqrt((playerPos.x - destPos.x)**2 + (playerPos.y - destPos.y)**2);
    if (distToTarget < 30) {
      // Already there - just trigger location action
      goToLocation(locId);
      return;
    }
    // Build path using connections
    const path = findPath(state.currentLocation || 'cyril', locId);
    if (!path || path.length === 0) {
      toast('Cannot reach that location!');
      return;
    }
    // Convert path to waypoints
    walkPath = path.map(locId => getLocPos(WORLD_LOCATIONS.find(l => l.id === locId)));
    walkStep = 0;
    isWalking = true;
    toast('Walking...');
    renderWorldMap();
  }

  function findPath(startId, endId) {
    // Simple BFS pathfinding through connections
    const connections = [
      ['cyril','verdantMeadows'],['cyril','cyrilGates'],['cyril','cyrilArena'],
      ['cyril','kingsGate'],['cyril','eastVale'],['cyril','crystalRuin'],
      ['verdantMeadows','kingsGate'],['kingsGate','eastVale'],
      ['eastVale','crystalRuin'],['cyrilGates','cyrilDam'],
      ['cyrilDam','obsidianKeep'],['obsidianKeep','crystalPlains'],
      ['kingsGate','borzoiCamp'],['eastVale','crystalVale'],
      ['crystalVale','lutiaPass'],['lutiaPass','forgottenCatacombs'],
      ['forgottenCatacombs','jagdCoast'],['lutiaPass','scorpionDen'],
      ['scorpionDen','jagdRift'],['scorpionDen','jagdCoast'],
      ['crystalRuin','phantomWood'],['phantomWood','abandonedTheatre'],
      ['abandonedTheatre','frozenCath'],['frozenCath','moltenDepths'],
      ['frozenCath','stormpeak'],['phantomWood','redwood'],
      ['redwood','moogleVillage'],['crystalPlains','crystalSanctum'],
      ['crystalSanctum','ancientLib'],['ancientLib','stormpeak'],
      ['ancientLib','skyLighthouse'],['ancientLib','genesisGate'],
      ['skyLighthouse','graveyard'],['moogleVillage','tidalShoals'],
      ['jagdCoast','tidalShoals'],['obsidianKeep','lutiaPass'],
      ['cyrilArena','frozenCath'],['cyrilGates','crystalPlains'],
      ['genesisGate','moltenDepths']
    ];
    const adj = {};
    connections.forEach(([a,b]) => {
      if (!adj[a]) adj[a] = []; if (!adj[b]) adj[b] = [];
      if (isLocationUnlocked(WORLD_LOCATIONS.find(l => l.id === a)) && isLocationUnlocked(WORLD_LOCATIONS.find(l => l.id === b))) {
        adj[a].push(b); adj[b].push(a);
      }
    });
    const visited = new Set([startId]);
    const queue = [[startId]];
    while (queue.length > 0) {
      const path = queue.shift();
      const node = path[path.length - 1];
      if (node === endId) return path;
      const neighbors = adj[node] || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([...path, n]);
        }
      }
    }
    return null;
  }

  function drawBuilding(ctx, px, py, visited, active) {
    ctx.save();
    const bw = 24, bh = 20;
    // Wall — FFTA earth tone (#c07030)
    ctx.fillStyle = visited ? '#c07030' : '#906818';
    ctx.shadowColor = active ? 'rgba(200,152,48,0.35)' : 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = active ? 14 : 3;
    ctx.fillRect(px - bw/2, py - bh/2, bw, bh);
    ctx.shadowBlur = 0;
    // Wall outline
    ctx.strokeStyle = visited ? '#684818' : '#503008';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px - bw/2, py - bh/2, bw, bh);
    // Roof — peaked thatch style (#684818)
    ctx.fillStyle = visited ? '#684818' : '#503008';
    ctx.beginPath();
    ctx.moveTo(px - bw/2 - 4, py - bh/2);
    ctx.lineTo(px, py - bh/2 - 12);
    ctx.lineTo(px + bw/2 + 4, py - bh/2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = visited ? '#382800' : '#281800';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Roof texture — horizontal lines
    ctx.strokeStyle = visited ? 'rgba(56,40,0,0.3)' : 'rgba(40,24,0,0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      const yy = py - bh/2 - i * 3;
      ctx.beginPath(); ctx.moveTo(px - bw/2 - 1, yy); ctx.lineTo(px + bw/2 + 1, yy); ctx.stroke();
    }
    // Chimney (small)
    ctx.fillStyle = visited ? '#684818' : '#503008';
    ctx.fillRect(px + 8, py - bh/2 - 10, 4, 6);
    // Window — warm glow
    ctx.fillStyle = visited ? '#f8f0c0' : '#d0c080';
    ctx.fillRect(px - 5, py - 3, 3, 5);
    ctx.fillRect(px + 2, py - 3, 3, 5);
    // Window crosses
    ctx.strokeStyle = visited ? '#684818' : '#503008';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(px - 5, py - 1); ctx.lineTo(px - 2, py - 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 2, py - 1); ctx.lineTo(px + 5, py - 1); ctx.stroke();
    // Door — arched
    ctx.fillStyle = visited ? '#382800' : '#281800';
    ctx.beginPath();
    ctx.moveTo(px - 3, py + bh/2);
    ctx.lineTo(px - 3, py + 4);
    ctx.arcTo(px, py + 1, px + 3, py + 4, 3);
    ctx.lineTo(px + 3, py + bh/2);
    ctx.closePath();
    ctx.fill();
    // Door knob
    ctx.fillStyle = '#c89830';
    ctx.beginPath(); ctx.arc(px + 2, py + 7, 1, 0, Math.PI*2); ctx.fill();
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath(); ctx.ellipse(px, py + bh/2 + 3, bw/2 + 2, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawSwordIcon(ctx, px, py, glowColor, active) {
    ctx.save();
    const s = 8;
    const color = glowColor;
    if (active) {
      ctx.shadowColor = 'rgba('+(glowColor==='#c89830'?'200,152,48':'48,184,72')+',0.4)';
      ctx.shadowBlur = 14;
    }
    // Blade left (angled left-up)
    ctx.save(); ctx.translate(px - 1, py); ctx.rotate(-0.35);
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    // Sword blade (thick line)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s/2); ctx.stroke();
    // Crossguard
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-3, -s*0.6); ctx.lineTo(3, -s*0.6); ctx.stroke();
    ctx.restore();
    // Blade right (angled right-up)
    ctx.save(); ctx.translate(px + 1, py); ctx.rotate(0.35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s/2); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-3, -s*0.6); ctx.lineTo(3, -s*0.6); ctx.stroke();
    ctx.restore();
    // Center gem
    ctx.fillStyle = active ? '#f8f0c0' : '#d0c080';
    ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI*2); ctx.stroke();
    // Active pulsing dot overlay
    if (active) {
      ctx.shadowColor = 'rgba(200,152,48,0.6)'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#c89830';
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawRoad(ctx, ax, ay, bx, by) {
    ctx.save();
    // Earth shadow beneath road
    ctx.strokeStyle = 'rgba(80,48,8,0.12)';
    ctx.lineWidth = 7;
    ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(ax+1, ay+2); ctx.lineTo(bx+1, by+2); ctx.stroke();
    // Road path — warm brown dashed
    ctx.strokeStyle = 'rgba(144,104,24,0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    // Center cart track line
    ctx.strokeStyle = 'rgba(80,48,8,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 10]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawMapBorder(ctx, W, H) {
    ctx.save();
    const m = 6;
    // Outer thick border — FFTA dark navy
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 5;
    ctx.strokeRect(m, m, W - m*2, H - m*2);
    // Gold middle line
    ctx.strokeStyle = '#c89830';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m + 5, m + 5, W - m*2 - 10, H - m*2 - 10);
    // Inner dark line
    ctx.strokeStyle = '#304880';
    ctx.lineWidth = 2;
    ctx.strokeRect(m + 8, m + 8, W - m*2 - 16, H - m*2 - 16);
    // Corner ornaments — FFTA-style golden flourishes
    const corners = [[m+4,m+4],[W-m-4,m+4],[m+4,H-m-4],[W-m-4,H-m-4]];
    corners.forEach(([cx, cy]) => {
      ctx.fillStyle = '#c89830';
      // Outer diamond
      ctx.beginPath();
      ctx.moveTo(cx, cy-5); ctx.lineTo(cx+5, cy); ctx.lineTo(cx, cy+5); ctx.lineTo(cx-5, cy);
      ctx.closePath();
      ctx.fill();
      // Inner dot
      ctx.fillStyle = '#f8f0c0';
      ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI*2); ctx.fill();
    });
    ctx.restore();
  }

  function renderWorldMap() {
    state.currentScene = 'world';
    dom.gil.textContent = `◈ ${state.gil} GIL`;
    if (dom.worldGil) dom.worldGil.textContent = `◈ ${state.gil} GIL`;
    if (dom.worldClanName) dom.worldClanName.textContent = state.clanName || '—';
    
    const canvas = dom.mapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = WORLD_W, H = WORLD_H;
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Initialize player position if needed
    const curLoc = WORLD_LOCATIONS.find(l => l.id === state.currentLocation) || WORLD_LOCATIONS[0];
    const startPos = getLocPos(curLoc);
    if (playerPos.x === 0 && playerPos.y === 0) {
      playerPos = { x: startPos.x, y: startPos.y };
    }

    // Set initial camera to follow player
    updateCamera(canvas);

    // Draw detailed game-quality background
    drawDetailedMapBackground(ctx, W, H);
    drawMapOverlay(ctx, W, H);

    // Start walk animation loop if walking
    if (isWalking) {
      if (walkAnimationId) cancelAnimationFrame(walkAnimationId);
      animateWalking(canvas);
    }
  }

  function drawDetailedMapBackground(ctx, W, H) {
    // Draw the generated world map background image, scaled to fit canvas
    const bg = new Image();
    bg.onload = function() {
      // Scale to cover the canvas
      const scale = Math.max(W / bg.width, H / bg.height);
      const dw = bg.width * scale;
      const dh = bg.height * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      ctx.drawImage(bg, dx, dy, dw, dh);
    };
    bg.onerror = function() {
      // Fallback gradient
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#7a9a5a');
      grad.addColorStop(0.5, '#5a7a4a');
      grad.addColorStop(1, '#3a5a2a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    };
    bg.src = 'assets/world_map_bg.png';
  }

  function updateCamera(canvas) {
    const vw = canvas.clientWidth || 800;
    const vh = canvas.clientHeight || 600;
    // Center camera on player, with bounds checking
    let targetX = playerPos.x - vw / 2;
    let targetY = playerPos.y - vh / 2;
    // Clamp to world bounds
    targetX = Math.max(0, Math.min(targetX, WORLD_W - vw));
    targetY = Math.max(0, Math.min(targetY, WORLD_H - vh));
    worldCamera.x = targetX;
    worldCamera.y = targetY;
  }

  function animateWalking(canvas) {
    if (!isWalking || walkPath.length === 0) {
      isWalking = false;
      walkAnimationId = null;
      return;
    }

    const target = walkPath[walkStep];
    const dx = target.x - playerPos.x;
    const dy = target.y - playerPos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist < WALK_SPEED) {
      // Reached this waypoint
      playerPos.x = target.x;
      playerPos.y = target.y;
      walkStep++;
      if (walkStep >= walkPath.length) {
        // Reached destination
        isWalking = false;
        walkAnimationId = null;
        // Find which location we arrived at
        const arrivedLoc = WORLD_LOCATIONS.find(l => {
          const lp = getLocPos(l);
          return Math.abs(lp.x - playerPos.x) < 30 && Math.abs(lp.y - playerPos.y) < 30;
        });
        if (arrivedLoc) {
          state.currentLocation = arrivedLoc.id;
          if (!state.visitedLocations.includes(arrivedLoc.id)) {
            state.visitedLocations.push(arrivedLoc.id);
          }
          if (arrivedLoc.type === 'town') {
            showTownMenu(arrivedLoc);
          } else {
            // Check for mission at this location
            const mission = STORY_MISSIONS.find(m => {
              const done = state.completedMissions.includes(m.num);
              const prevDone = m.num === 1 || state.completedMissions.includes(m.num - 1);
              return !done && prevDone && m.loc === arrivedLoc.name;
            });
            if (mission) {
              showCutscene(mission, 'pre', () => {
                const enemies = generateEnemies(mission);
                const allies = state.activeParty.length ? state.activeParty.map(id => state.units.find(u => u.id === id)).filter(Boolean) : state.units;
                if (allies.length === 0) { toast('No units in active party!', true); renderWorldMap(); return; }
                deployBattle(mission, allies, enemies);
              });
            } else {
              toast('No missions available here yet.');
              renderWorldMap();
            }
          }
        }
        return;
      }
    } else {
      // Move toward waypoint
      playerPos.x += (dx / dist) * WALK_SPEED;
      playerPos.y += (dy / dist) * WALK_SPEED;
    }

    // Update camera and redraw
    updateCamera(canvas);
    renderWorldMapLoop();
    walkAnimationId = requestAnimationFrame(() => animateWalking(canvas));
  }

  function renderWorldMapLoop() {
    const canvas = dom.mapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = WORLD_W, H = WORLD_H;
    
    ctx.save();
    ctx.translate(-worldCamera.x, -worldCamera.y);
    
    // Draw background (simplified for animation)
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#7a9a5a');
    grad.addColorStop(0.5, '#5a7a4a');
    grad.addColorStop(1, '#3a5a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    
    // Draw terrain decoration
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = `rgba(${50+Math.random()*20},${70+Math.random()*30},${40+Math.random()*20},${Math.random()*0.2})`;
      ctx.beginPath(); ctx.arc(i*280 % W, (i*170+50) % H, 30+Math.random()*30, 0, Math.PI*2); ctx.fill();
    }

    drawMapOverlay(ctx, W, H);
    ctx.restore();
  }

  function drawMapOverlay(ctx, W, H) {
    // Draw roads first (behind markers)
    const connections = [
      ['cyril','verdantMeadows'],['cyril','cyrilGates'],['cyril','cyrilArena'],
      ['cyril','kingsGate'],['cyril','eastVale'],['cyril','crystalRuin'],
      ['verdantMeadows','kingsGate'],['kingsGate','eastVale'],
      ['eastVale','crystalRuin'],['cyrilGates','cyrilDam'],
      ['cyrilDam','obsidianKeep'],['obsidianKeep','crystalPlains'],
      ['kingsGate','borzoiCamp'],['eastVale','crystalVale'],
      ['crystalVale','lutiaPass'],['lutiaPass','forgottenCatacombs'],
      ['forgottenCatacombs','jagdCoast'],['lutiaPass','scorpionDen'],
      ['scorpionDen','jagdRift'],['scorpionDen','jagdCoast'],
      ['crystalRuin','phantomWood'],['phantomWood','abandonedTheatre'],
      ['abandonedTheatre','frozenCath'],['frozenCath','moltenDepths'],
      ['frozenCath','stormpeak'],['phantomWood','redwood'],
      ['redwood','moogleVillage'],['crystalPlains','crystalSanctum'],
      ['crystalSanctum','ancientLib'],['ancientLib','stormpeak'],
      ['ancientLib','skyLighthouse'],['ancientLib','genesisGate'],
      ['skyLighthouse','graveyard'],['moogleVillage','tidalShoals'],
      ['jagdCoast','tidalShoals'],['obsidianKeep','lutiaPass'],
      ['cyrilArena','frozenCath'],['cyrilGates','crystalPlains'],
      ['genesisGate','moltenDepths']
    ];
    const locMap = {};
    WORLD_LOCATIONS.forEach(l => locMap[l.id] = l);
    
    // Draw connections for unlocked locations only
    connections.forEach(([a, b]) => {
      const la = locMap[a], lb = locMap[b];
      if (!la || !lb) return;
      const unlockedA = isLocationUnlocked(la);
      const unlockedB = isLocationUnlocked(lb);
      if (!unlockedA && !unlockedB) return;  // Skip if both locked
      const ap = getLocPos(la), bp = getLocPos(lb);
      drawRoad(ctx, ap.x, ap.y, bp.x, bp.y);
    });

    // Location markers - only unlocked ones
    WORLD_LOCATIONS.forEach(loc => {
      // Check if this location should be visible
      if (!isLocationUnlocked(loc)) {
        // Draw as "???" or locked indicator
        const p = getLocPos(loc);
        ctx.save();
        ctx.fillStyle = 'rgba(30,30,30,0.4)';
        ctx.strokeStyle = 'rgba(100,100,100,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('???', p.x, p.y + 4);
        ctx.restore();
        return;
      }

      const p = getLocPos(loc);
      const visited = state.visitedLocations && state.visitedLocations.includes(loc.id);
      const hasMissionsHere = STORY_MISSIONS.some(m => {
        const done = state.completedMissions.includes(m.num);
        return !done && loc.name === m.loc;
      });
      const isActive = hasMissionsHere && state.currentLocation !== loc.id;

      ctx.save();
      // Larger icons
      ctx.translate(p.x, p.y);
      ctx.scale(1.8, 1.8);
      ctx.translate(-p.x, -p.y);
      
      if (loc.type === 'town') {
        drawBuilding(ctx, p.x, p.y, visited, isActive);
      } else {
        const glow = hasMissionsHere ? '#c89830' : (visited ? '#48b848' : '#8a7a5a');
        drawSwordIcon(ctx, p.x, p.y, glow, hasMissionsHere);
      }
      ctx.restore();

      // BIGGER labels - readable text
      const label = loc.name;
      ctx.font = 'bold 16px "Courier New", monospace';
      const tw = ctx.measureText(label).width;
      const lx = p.x - tw/2 - 8, ly = p.y + 35;
      // Larger background pill
      ctx.fillStyle = visited ? 'rgba(26,26,46,0.85)' : 'rgba(90,74,58,0.7)';
      roundRect(ctx, lx, ly, tw + 16, 22, 5);
      ctx.fill();
      // Border
      ctx.strokeStyle = visited ? 'rgba(200,152,48,0.6)' : 'rgba(200,184,152,0.4)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, lx, ly, tw + 16, 22, 5);
      ctx.stroke();
      // Text - larger
      ctx.fillStyle = visited ? '#fff' : '#e8dcc8';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x, p.y + 46);

      // Mission star indicator
      if (hasMissionsHere) {
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = 'rgba(255,215,0,0.8)';
        ctx.shadowBlur = 12;
        drawStar(ctx, p.x, p.y - 30, 5, 10, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Draw player sprite at current walking position
    ctx.save();
    const px = playerPos.x, py = playerPos.y;
    // Player shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px, py + 18, 14, 6, 0, 0, Math.PI*2); ctx.fill();
    // Player body - larger visible sprite
    ctx.fillStyle = '#e84830';
    ctx.beginPath(); ctx.arc(px, py - 8, 12, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#f0e8d8';
    ctx.beginPath(); ctx.arc(px, py - 16, 8, 0, Math.PI*2); ctx.fill();
    // Direction indicator (pointing up)
    ctx.fillStyle = '#c89830';
    ctx.beginPath(); ctx.moveTo(px, py - 28); ctx.lineTo(px - 5, py - 22); ctx.lineTo(px + 5, py - 22); ctx.closePath(); ctx.fill();
    // Pulsing ring
    const time = Date.now() / 400;
    const pulse = 0.5 + 0.5 * Math.sin(time);
    ctx.strokeStyle = `rgba(255,200,0,${0.4 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 22 + pulse * 8, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // ── HELPERS ─────────────────────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawStar(ctx, cx, cy, points, outerR, innerR) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI / points) - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function goToLocation(locId) {
    const loc = WORLD_LOCATIONS.find(l => l.id === locId);
    if (!loc) return;
    state.currentLocation = locId;
    if (!state.visitedLocations) state.visitedLocations = [];
    if (!state.visitedLocations.includes(locId)) state.visitedLocations.push(locId);
    saveState();

    if (loc.type === 'town') {
      showTownMenu(loc);
    } else {
      // Find the next story mission at this location
      const mission = STORY_MISSIONS.find(m => {
        const done = state.completedMissions.includes(m.num);
        const prevDone = m.num === 1 || state.completedMissions.includes(m.num - 1);
        return !done && prevDone && m.loc === loc.name;
      });
      if (mission) {
        showCutscene(mission, 'pre', () => {
          const enemies = generateEnemies(mission);
          const allies = state.activeParty.length ? state.activeParty.map(id => state.units.find(u => u.id === id)).filter(Boolean) : state.units;
          if (allies.length === 0) { toast('No units in active party!', true); renderWorldMap(); return; }
          deployBattle(mission, allies, enemies);
        });
      } else {
        toast('No available missions at this location.');
        renderWorldMap();
      }
    }
  }

  // ── TOWN MENU ────────────────────────────────────────────────────────
  function showTownMenu(loc) {
    dom.townTitle.textContent = loc.name;
    dom.townDesc.textContent = loc.desc;
    dom.townMenu.classList.add('on');
  }

  function hideTownMenu() {
    dom.townMenu.classList.remove('on');
    renderWorldMap();
  }

  function townAction(action) {
    dom.townMenu.classList.remove('on');
    if (action === 'pub' || action === 'shop' || action === 'equip' || action === 'clan') {
      showOverlay(action);
    } else if (action === 'save') { saveState(); toast('Game saved!'); renderWorldMap(); if (dom.subt) dom.subt.textContent = 'World Map'; }
    else if (action === 'leave') { renderWorldMap(); if (dom.subt) dom.subt.textContent = 'World Map'; }
  }

  // ── CUTSCENE ASSET REGISTRY (location backgrounds, character portraits) ──
  const CUTSCENE_ASSETS = {
    // Location backgrounds (keyed by location slug)
    bg: {
      cyril: 'assets/cyril_background.png',
      cyril_fields: 'assets/cyril_background.png',
      crystal_ruins: 'assets/crystal_ruins.png',
      frozen_cathedral: 'assets/frozen_cathedral.png',
      molten_depths: 'assets/molten_depths.png',
      abandoned_fort: 'assets/abandoned_fort.png',
      the_rift: 'assets/the_rift.png',
    },
    // Character portraits (keyed by enemy clan id or job name)
    portrait: {
      human_soldier: 'assets/soldier_portrait.png',
      moogle_blackmage: 'assets/moogle_portrait.png',
      viera_archer: 'assets/viera_portrait.png',
      bangaa_warrior: 'assets/bangaa_portrait.png',
      numou_mage: 'assets/numou_portrait.png',
    },
    emblem: {
      generic: 'assets/clan_banner.png',
    }
  };

  function getCutsceneBg(mission) {
    // Try to map mission location to a background image
    const slug = (mission.loc || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return CUTSCENE_ASSETS.bg[slug] || CUTSCENE_ASSETS.bg.cyril || '';
  }

  function getCutscenePortrait(mission) {
    // Try to map mission's enemy clan to a portrait
    const clan = ENEMY_CLANS[mission.clan];
    if (clan) {
      const slug = clan.id || clan.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      return CUTSCENE_ASSETS.portrait[slug] || CUTSCENE_ASSETS.portrait.human_soldier || '';
    }
    return CUTSCENE_ASSETS.portrait.human_soldier || '';
  }

  // ── CUTSCENE SYSTEM ──────────────────────────────────────────────────
  function showCutscene(mission, type, onEnd) {
    const modal = dom.cutsceneModal;
    const title = dom.cutsceneTitle;
    const text = dom.cutsceneText;
    const nextBtn = dom.cutsceneNext;
    const bg = dom.cutsceneBg;
    const portraitImg = dom.cutscenePortraitImg;

    // Set background image
    const bgUrl = getCutsceneBg(mission);
    if (bgUrl) {
      bg.style.backgroundImage = 'url(' + bgUrl + ')';
      bg.classList.add('has');
    } else {
      bg.style.backgroundImage = '';
      bg.classList.remove('has');
    }

    // Set portrait
    const pUrl = getCutscenePortrait(mission);
    if (pUrl) {
      portraitImg.src = pUrl;
      portraitImg.style.display = 'block';
    } else {
      portraitImg.src = '';
      portraitImg.style.display = 'none';
    }

    if (type === 'pre') {
      title.textContent = mission.name;
      text.innerHTML = `
        <div class="cut-loc">📍 ${mission.loc} — Lv.${mission.level}</div>
        <div class="cut-body">${mission.desc}</div>
        <div class="cut-enemy">Enemy Clan: ${ENEMY_CLANS[mission.clan] ? ENEMY_CLANS[mission.clan].name : 'Unknown'}</div>
        <div class="cut-reward">Reward: ${50 + mission.level * 30} Gil${mission.rewardItem ? ' + ' + mission.rewardItem : ''}</div>
      `;
    } else if (type === 'victory') {
      const m = mission;
      title.textContent = '✦ Mission Complete! ✦';
      const rewardText = `${50 + m.level * 30} Gil earned!${m.rewardItem ? '<br>🎁 ' + m.rewardItem + ' acquired!' : ''}`;
      let chapText = '';
      const ch1End = m.num === 6;
      const ch2End = m.num === 12;
      const ch3End = m.num === 18;
      const ch4End = m.num === 24;
      if (ch1End) chapText = '<div class="cut-chapter">~ Chapter 1 Complete ~<br><em>The path ahead grows darker. New dangers await beyond the vale.</em></div>';
      else if (ch2End) chapText = '<div class="cut-chapter">~ Chapter 2 Complete ~<br><em>The Judges have taken notice. The Totema stir in their slumber.</em></div>';
      else if (ch3End) chapText = '<div class="cut-chapter">~ Chapter 3 Complete ~<br><em>The Totema have been thwarted, but the true threat reveals itself at last.</em></div>';
      else if (ch4End) chapText = '<div class="cut-chapter">~ ★ FINALE ★ ~<br><em>The Crystal falls silent. Ivalice is free. Your clan\'s name will be sung for generations.</em></div>';
      text.innerHTML = `<div class="cut-reward">${rewardText}</div>${chapText}`;
    } else if (type === 'defeat') {
      title.textContent = '✘ Defeated ✘';
      text.innerHTML = '<div class="cut-body">Your clan has fallen in battle. Rest and recuperate before trying again.</div>';
    }

    modal.classList.add('on');
    cutsceneNextVisible(true);

    const handler = () => {
      modal.classList.remove('on');
      cutsceneNextVisible(false);
      bg.classList.remove('has');
      bg.style.backgroundImage = '';
      portraitImg.src = '';
      portraitImg.style.display = 'none';
      if (onEnd) onEnd();
      else if (type === 'victory' || type === 'defeat') {
        // Return to world map after story/victory/defeat cutscene
        dom.endModal.classList.remove('on');
        returnToPub();
      }
    };
    nextBtn.onclick = handler;
  }

  // ── These are exported via Object.assign in init() ────────────────

  // ── UPDATE BATTLE UI ───────────────────────────────────────────────
  function updateBattleUI() {
    if (!state.battle) return;
    const cur = getCurrentTurnUnit();
    const isEnemy = state.battle.phase === 'ENEMY';

    dom.turnLabel.textContent = isEnemy ? 'ENEMY TURN' : 'PLAYER TURN';
    dom.turnLabel.className = 'turn' + (isEnemy ? ' enemy' : '');
    dom.round.textContent = state.battle.round || 1;

    if (cur) {
      dom.activeName.textContent = cur.name;
      dom.activeHP.textContent = `${cur.hp}/${cur.maxHp}`;
      dom.activeMP.textContent = `${cur.mp}/${cur.maxMp}`;
    } else {
      dom.activeName.textContent = '—'; dom.activeHP.textContent = '—'; dom.activeMP.textContent = '—';
    }

    const u = state.selectedUnit;
    if (u) {
      dom.uiName.textContent = u.name;
      dom.uiJob.textContent = JOBS[u.job] ? JOBS[u.job].desc : u.job;
      dom.uiRace.textContent = `${u.race} · Lv.${u.level} ${u.job}`;
      dom.uiHP.textContent = `${u.hp}/${u.maxHp}`;
      dom.uiMP.textContent = `${u.mp}/${u.maxMp}`;
      dom.uiSPD.textContent = u.spd;
      dom.uiAtk.textContent = u.atk + (u.weapon ? u.weapon.atk || 0 : 0);
      dom.uiDef.textContent = u.def + (u.armor ? u.armor.def || 0 : 0);
      dom.uiMag.textContent = u.mag + (u.weapon ? u.weapon.mp || 0 : 0);

      const hpPct = u.hp / u.maxHp * 100;
      dom.uiHPbar.style.width = hpPct + '%';
      const mpPct = u.mp / u.maxMp * 100;
      dom.uiMPbar.style.width = mpPct + '%';

      // Terrain + elevation info
      const tType = terrain[u.col] ? terrain[u.col][u.row] : 'plains';
      const tData = TERRAIN[tType] || TERRAIN.plains;
      const elev = elevation[u.col] ? elevation[u.col][u.row] : 0;
      if (dom.terLabel) dom.terLabel.textContent = tData.name;
      if (dom.elevLabel) dom.elevLabel.textContent = `+${elev}`;

      // Statuses
      dom.uiStatuses.innerHTML = '';
      if (u.ailments && u.ailments.length) {
        u.ailments.forEach(a => {
          const el = document.createElement('span');
          el.className = 'status-ailment';
          el.textContent = a;
          dom.uiStatuses.appendChild(el);
        });
      }

      // Abilities
      const jobAbils = ABILS[u.job];
      dom.abilityList.innerHTML = '';
      if (jobAbils) {
        jobAbils.forEach(cat => {
          const catInfo = ABILITY_CAT[cat];
          if (!catInfo) return;
          const header = document.createElement('div');
          header.style.cssText = 'font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:6px';
          header.textContent = catInfo.name;
          dom.abilityList.appendChild(header);
          const jobAbilsFiltered = ABILITIES.filter(a => a.cat === cat && a.mp <= u.mp);
          if (cat === 'C') {
            // Always show Fight, Defend
            const base = ABILITIES.filter(a => a.cat === 'C' && (a.name === 'Fight' || a.name === 'Defend'));
            base.forEach(abil => addAbilityButton(u, abil));
          }
          jobAbilsFiltered.forEach(abil => addAbilityButton(u, abil));
        });
      }
    } else {
      dom.uiName.textContent = '—'; dom.uiJob.textContent = '—';
      dom.uiRace.textContent = '—'; dom.uiHP.textContent = '—';
      dom.uiMP.textContent = '—'; dom.uiSPD.textContent = '—';
      dom.uiAtk.textContent = '—'; dom.uiDef.textContent = '—'; dom.uiMag.textContent = '—';
      dom.uiHPbar.style.width = '0%'; dom.uiMPbar.style.width = '0%';
      dom.uiStatuses.innerHTML = '';
      dom.abilityList.innerHTML = '<div style="font-size:11px;color:var(--muted)">No unit selected</div>';
      if (dom.terLabel) dom.terLabel.textContent = '—';
      if (dom.elevLabel) dom.elevLabel.textContent = '—';
    }

    dom.tOrder.innerHTML = '';
    state.battle.turnOrder.slice(0, 6).forEach((u, i) => {
      const d = document.createElement('div');
      d.className = 'trow' + (i === state.battle.activeIdx ? ' now' : '');
      d.innerHTML = `<span class="ico">${u.isEnemy ? '👹' : '⚔'}</span><span class="nm">${u.name}</span><span class="sp">SPD ${u.spd}</span>`;
      dom.tOrder.appendChild(d);
    });
  }

  function addAbilityButton(unit, abil) {
    const existing = dom.abilityList.querySelector(`[data-abil="${abil.name}"]`);
    if (existing) return;
    const btn = document.createElement('button');
    btn.className = 'act-btn';
    btn.dataset.abil = abil.name;
    btn.style.cssText = 'padding:4px 8px;font-size:9px';
    const catInfo = ABILITY_CAT[abil.cat] || { color:'var(--ink)' };
    const color = catInfo.color || 'var(--ink)';
    btn.innerHTML = `<span class="lbl" style="color:${color}">${abil.name}</span><span class="cost ${abil.mp > 0 ? 'mp' : ''}">${abil.mp}MP</span>`;
    btn.addEventListener('click', () => {
      if (state.battle.phase !== 'PLAYER') return;
      if (unit.mp < (abil.mp || 0)) { toast('Not enough MP!', true); return; }
      if (hasAilment(unit, 'silence') && abil.mp > 0) { toast('Silenced!', true); return; }
      state.selectedAbility = abil;
      state.moveRange = null;
      state.actRange = [];

      let targets = [];
      if (abil.target === 'self') targets = [unit];
      else if (abil.target === 'ally') targets = abil.heal ? state.battle.allies : [...state.battle.allies, ...state.battle.enemies];
      else targets = abil.heal ? state.battle.allies : state.battle.enemies;

      if (abil.aoe === 'adjacent') {
        targets = targets.filter(t => !t.ko && Math.abs(unit.col - t.col) + Math.abs(unit.row - t.row) <= 1);
      } else if (abil.aoe === 'all') {
        targets = targets.filter(t => !t.ko);
      } else {
        targets = targets.filter(t => !t.ko && Math.abs(unit.col - t.col) + Math.abs(unit.row - t.row) <= (abil.range || 1));
      }

      targets.forEach(t => state.actRange.push({c:t.col, r:t.row}));
      if (abil.aoe === 'adjacent' || abil.aoe === 'all') {
        // For aoe, show highlighted area
      }
      renderGrid();
      fmsg(`Select target for ${abil.name}`);
    });
    dom.abilityList.appendChild(btn);
  }

  function updateLawsBar() {
    const bar = dom.lawsBar;
    if (!bar || !state.battle) return;
    if (!state.battle.laws || !state.battle.laws.length) {
      bar.innerHTML = '⚖ No Laws in effect (free battle)';
      return;
    }
    const texts = state.battle.laws.map(l => l.label).join(' · ');
    bar.innerHTML = `⚖ Laws: <b>${texts}</b> · JP: ${state.battle.judgePoints || 0}`;
  }

  // ── PUB RENDER ─────────────────────────────────────────────────────
  function renderPub() {
    dom.gil.textContent = `◈ ${state.gil} GIL`;
    if (dom.clanName) dom.clanName.textContent = state.clanName || '—';
    dom.pubLevel.textContent = state.clanLevel;
    dom.pubJP.textContent = state.jp;
    dom.pubAP.textContent = state.apPool;
    dom.pubUnits.textContent = state.units.length;
    const itemCount = state.inventory ? state.inventory.reduce((s, i) => s + (i.qty || 1), 0) : 0;
    if (dom.pubItems) dom.pubItems.textContent = itemCount;

    dom.missionsStory.innerHTML = '';
    STORY_MISSIONS.forEach(m => {
      const done = state.completedMissions.includes(m.num);
      const prevDone = m.num === 1 || state.completedMissions.includes(m.num - 1);
      const locked = !done && !prevDone;
      const clan = ENEMY_CLANS[m.clan];
      const clanColor = clan ? clan.color : 'var(--muted)';
      const clanName = clan ? clan.name : 'Unknown';
      const card = document.createElement('div');
      card.className = `mission story${locked ? ' locked' : ''}`;
      card.innerHTML = `
        <div class="num">Mission ${m.num}</div>
        <h3>${done ? '✓ ' : ''}${m.name}</h3>
        <div class="desc">${m.desc}</div>
        <div class="meta">
          <span>Lv.${m.level}</span>
          <span>${m.enemies} enemies${m.boss ? ' + boss' : ''}</span>
          <span style="color:var(--gold)">${(50 + (m.level||1)*30)}G</span>
          ${done ? '<span style="color:var(--emerald)">CLEAR</span>' : ''}
        </div>
        <div style="margin-top:6px;font-size:10px;display:flex;align-items:center;gap:6px">
          <span class="clan-badge" style="color:${clanColor};border-color:${clanColor}">${clanName}</span>
          <span class="loc-badge">📍 ${m.loc || 'Ivalice'}</span>
          ${m.rewardItem ? `<span class="loc-badge" style="color:var(--gold)">🎁 ${m.rewardItem}</span>` : ''}
        </div>
      `;
      if (!locked && !done && state.units.length) {
        card.addEventListener('click', () => {
          const enemies = generateEnemies(m);
          const allies = state.activeParty.length ? state.activeParty.map(id => state.units.find(u => u.id === id)).filter(Boolean) : state.units;
          deployBattle(m, allies, enemies);
        });
      }
      dom.missionsStory.appendChild(card);
    });

    dom.missionsDispatch.innerHTML = '';
    DISPATCH.forEach(d => {
      const card = document.createElement('div');
      card.className = 'mission dispatch';
      card.innerHTML = `
        <h3>${d.name}</h3>
        <div class="desc">${d.days} days · Reward: ${d.reward} Gil</div>
        <div class="meta"><span>${d.days}d</span><span>${(d.successWalk||0.5)*100}% success</span></div>
      `;
      card.addEventListener('click', () => {
        if (!state.units.length) { toast('No clan members!', true); return; }
        const unit = state.units[Math.floor(Math.random() * state.units.length)];
        const success = Math.random() < (d.successWalk || 0.5);
        if (success) {
          const reward = d.reward || 30;
          state.gil += reward;
          showDispatchResult(unit.name, true, reward, d.days);
          saveState(); renderPub();
        } else {
          showDispatchResult(unit.name, false, 0, d.days);
        }
      });
      dom.missionsDispatch.appendChild(card);
    });

    dom.missionsEncounter.innerHTML = '';
    ENCOUNTERS.forEach(e => {
      const clan = ENEMY_CLANS[e.clan];
      const clanColor = clan ? clan.color : 'var(--crimson)';
      const card = document.createElement('div');
      card.className = 'mission encounter';
      card.style.borderLeftColor = clanColor;
      card.innerHTML = `
        <h3>${e.name}</h3>
        <div class="desc">Clan battle · Lv.${e.level}</div>
        <div class="meta"><span>${e.enemies} enemies</span></div>
        <div style="margin-top:6px;font-size:10px;display:flex;align-items:center;gap:6px">
          <span class="clan-badge" style="color:${clanColor};border-color:${clanColor}">${clan ? clan.name : 'Rival'}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        if (!state.units.length) { toast('Recruit first!', true); return; }
        const enemies = [];
        for (let i = 0; i < e.enemies; i++) {
          const jobList = ['Soldier','Archer','BlackMage','WhiteMage','Thief','Fighter','Warrior'];
          const raceList = ['Human','Viera','NuMou','Human','Human','Human','Bangaa'];
          const ri = Math.floor(Math.random() * jobList.length);
          const u = createUnit(`Enemy ${i+1}`, raceList[ri], jobList[ri], e.level);
          u.isEnemy = true;
          enemies.push(u);
        }
        const allies = state.activeParty.length ? state.activeParty.map(id => state.units.find(u => u.id === id)).filter(Boolean) : state.units;
        deployBattle(e, allies, enemies);
      });
      dom.missionsEncounter.appendChild(card);
    });

    // ── RECRUIT SECTION (skip if already rendered) ──────────────────────
    if (!document.getElementById('recruitSection')) {
      const recruitSection = document.createElement('div');
      recruitSection.id = 'recruitSection';
      recruitSection.innerHTML = `
        <div class="section-title">Recruit New Members</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
          ${[
            { name:'Human', jobs:['Soldier','Fighter','WhiteMage','Thief','Paladin','Ninja','Sage'], cost:300 },
            { name:'Moogle', jobs:['BlackMage','WhiteMage','TimeMage','Bishop','Thief','Juggler'], cost:350 },
            { name:'Viera', jobs:['Archer','Fighter','WhiteMage','Sniper','Elementalist','Sage','Assassin'], cost:320 },
            { name:'Bangaa', jobs:['Warrior','Fighter','Gladiator','WhiteMonk','Dragoon','Templar','Bishop'], cost:280 },
            { name:'NuMou', jobs:['BlackMage','WhiteMage','TimeMage','Illusionist','Sage','Bishop'], cost:300 }
          ].map(opt => {
            const canAfford = state.gil >= opt.cost;
            return `<div class="unit-card" style="${canAfford ? 'cursor:pointer' : 'opacity:0.5'}" 
              onclick="${canAfford ? `window.tactics.recruitUnit('${opt.name}')` : ''}">
              <div class="name" style="color:${RACES[opt.name] ? RACES[opt.name].sprite : '#aaa'}">${opt.name}</div>
              <div class="job">◈${opt.cost} Gil</div>
              <div class="race">Jobs: ${opt.jobs.slice(0,4).join(' · ')}${opt.jobs.length > 4 ? ' · more' : ''}</div>
            </div>`;
          }).join('')}
        </div>
      `;
      dom.missionsStory.parentNode.insertBefore(recruitSection, dom.missionsStory);
    }

    // ── LAWS CARD DISPLAY ──────────────────────────────────────────────
    const lawsDiv = document.getElementById('missionsLaws');
    if (lawsDiv) {
      lawsDiv.innerHTML = '';
      if (state.completedMissions.length > 12) {
        const available = LAW_POOL.filter(l => !state.recruitedLawCards || !state.recruitedLawCards.includes(l.label));
        if (available.length) {
          available.forEach(law => {
            const card = document.createElement('div');
            card.className = 'mission';
            card.style.borderLeft = '3px solid var(--gold)';
            card.innerHTML = `
              <h3>⚖ ${law.label}</h3>
              <div class="desc">${law.desc || 'Equip this law card for a passive bonus'}</div>
              <div class="meta"><span>Equip</span></div>
            `;
            card.addEventListener('click', () => {
              if (!state.recruitedLawCards) state.recruitedLawCards = [];
              state.recruitedLawCards.push(law.label);
              toast(`Equipped law card: ${law.label}!`);
              saveState();
              renderPub();
            });
            lawsDiv.appendChild(card);
          });
        } else {
          lawsDiv.innerHTML = '<div style="font-size:11px;color:var(--muted)">All law cards collected!</div>';
        }
      } else {
        lawsDiv.innerHTML = '<div style="font-size:11px;color:var(--muted)">Complete more missions (13+) to unlock law card equips.</div>';
      }
    }
  }

  // ── CLAN RENDER ────────────────────────────────────────────────────
  function renderClan() {
    dom.clanRoster.innerHTML = '';
    if (!state.units.length) {
      dom.clanRoster.innerHTML = '<div style="color:var(--muted);font-size:12px">No clan members. Use the starter team or recruit from Shop.</div>';
      dom.clanRaces.innerHTML = '';
      return;
    }

    if (!state.activeParty) state.activeParty = [];
    const activeIds = new Set(state.activeParty);

    const rosterDiv = document.createElement('div');
    rosterDiv.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px';
    state.units.forEach(u => {
      const inParty = activeIds.has(u.id);
      const raceColor = RACES[u.race] ? RACES[u.race].sprite : '#aaa';
      const isSel = state.selectedUnit && state.selectedUnit.id === u.id;
      const card = document.createElement('div');
      card.className = 'unit-card' + (isSel ? ' selected' : '');
      card.style.cssText = inParty ? 'box-shadow:0 0 0 1px ' + raceColor : '';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div class="name">${u.name}</div>
          <span style="font-size:9px;font-family:var(--mono);color:${inParty ? 'var(--emerald)' : 'var(--muted)'}">${inParty ? '✦ ACTIVE' : ''}</span>
        </div>
        <div class="job">${u.job} · Lv.${u.level}</div>
        <div class="race">${u.race} · ${u.element || '—'}</div>
        <div class="stats">
          <div class="stat">HP <b>${u.hp}</b></div>
          <div class="stat">MP <b>${u.mp}</b></div>
          <div class="stat">ATK <b>${u.atk}</b></div>
          <div class="stat">DEF <b>${u.def}</b></div>
          <div class="stat">SPD <b>${u.spd}</b></div>
        </div>
        <div style="font-size:8px;color:var(--muted);margin-top:4px">
          ${u.weapon ? '⚔ ' + u.weapon.name : 'No weapon'} | ${u.armor ? '🛡 ' + u.armor.name : 'No armor'}
        </div>
      `;
      card.addEventListener('click', () => {
        state.selectedUnit = u;
        renderClan();
        renderEquip();
      });
      rosterDiv.appendChild(card);
    });

    const formationDiv = document.createElement('div');
    formationDiv.className = 'clan-formation';
    formationDiv.innerHTML = '<h4>✦ Battle Party (max 5)</h4>';
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement('div');
      const uid = state.activeParty[i];
      const u = uid ? state.units.find(x => x.id === uid) : null;
      slot.className = 'fslot' + (u ? ' fill' : '');
      if (u) {
        const rc = RACES[u.race] ? RACES[u.race].sprite : '#aaa';
        slot.innerHTML = '<span class="fnum">' + (i + 1) + '</span><span class="fname" style="color:' + rc + '">' + u.name + '</span><span class="fjob">' + u.job + '</span>';
        slot.addEventListener('click', () => {
          state.activeParty.splice(i, 1);
          renderClan();
          saveState();
        });
      } else {
        slot.innerHTML = '<span class="fnum">' + (i + 1) + '</span><span style="color:var(--muted);font-size:10px">— Empty —</span>';
        if (state.selectedUnit && !state.activeParty.includes(state.selectedUnit.id)) {
          slot.style.cursor = 'pointer';
          slot.addEventListener('click', () => {
            state.activeParty[i] = state.selectedUnit.id;
            renderClan();
            saveState();
          });
        }
      }
      formationDiv.appendChild(slot);
    }
    if (state.activeParty.length < 5) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:9px;color:var(--muted);margin-top:6px';
      hint.textContent = 'Select unit → click empty slot';
      formationDiv.appendChild(hint);
    }

    const wrap = document.createElement('div');
    wrap.className = 'clan-with-formation';
    wrap.appendChild(rosterDiv);
    wrap.appendChild(formationDiv);
    dom.clanRoster.appendChild(wrap);

    dom.clanRaces.innerHTML = '';
    const counts = {};
    state.units.forEach(u => { counts[u.race] = (counts[u.race] || 0) + 1; });
    for (const [race, count] of Object.entries(counts)) {
      const color = RACES[race] ? RACES[race].sprite : '#aaa';
      const card = document.createElement('div');
      card.className = 'unit-card';
      card.innerHTML = '<div class="name" style="color:' + color + '">' + race + '</div><div class="race" style="font-size:20px;font-weight:700;color:var(--ink)">' + count + '</div><div class="stats">units in clan</div>';
      dom.clanRaces.appendChild(card);
    }
  }

  // ── EQUIPMENT CHANGE UI (FFTA-style) ──────────────────────────────
  function showUnitEquipOptions(u) {
    const panel = dom.equipPanel;
    if (!panel) return;

    const raceColor = RACES[u.race] ? RACES[u.race].sprite : '#aaa';
    const wAtk = u.atk + (u.weapon ? u.weapon.atk || 0 : 0);
    const wDef = u.def + (u.armor ? u.armor.def || 0 : 0);
    const wMag = u.mag + (u.weapon ? u.weapon.mp || 0 : 0);

    // Build equip layout
    let html = '<div class="equip-layout">';

    // Left: silhouette + slots
    html += '<div class="equip-silhouette">';
    html += '<div class="char-frame" style="border-color:' + raceColor + '">';
    html += '<canvas id="equipCharCanvas" width="100" height="120"></canvas>';
    html += '</div>';
    html += '<div class="char-name" style="color:' + raceColor + '">' + u.name + '</div>';
    html += '<div class="char-job">' + u.job + ' · Lv.' + u.level + '</div>';
    html += '<div class="char-race">' + u.race + ' · ' + (u.element || '—') + '</div>';
    html += '<div class="equip-slots" id="equipSlots">';
    html += '<div class="equip-slot active" data-slot="w" id="equipSlotW"><span class="slot-icon">⚔</span><span class="slot-name">Weapon</span><span class="slot-item">' + (u.weapon ? u.weapon.name : 'None') + '</span></div>';
    html += '<div class="equip-slot" data-slot="a" id="equipSlotA"><span class="slot-icon">🛡</span><span class="slot-name">Armor</span><span class="slot-item">' + (u.armor ? u.armor.name : 'None') + '</span></div>';
    html += '</div>';
    html += '<div class="equip-stat-block">';
    html += '<div class="stat">HP <b>' + u.maxHp + '</b></div><div class="stat">MP <b>' + u.maxMp + '</b></div>';
    html += '<div class="stat">ATK <b>' + wAtk + '</b></div><div class="stat">DEF <b>' + wDef + '</b></div>';
    html += '<div class="stat">MAG <b>' + wMag + '</b></div><div class="stat">SPD <b>' + u.spd + '</b></div>';
    html += '</div>';
    html += '</div>';

    // Right: item list + preview
    html += '<div>';
    html += '<div class="equip-item-list" id="equipItemList"></div>';
    // AP progress
    html += '<div style="margin-top:10px;padding:10px;border:2px solid #c8b898;background:#f0e8d8">';
    html += '<div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#304880;margin-bottom:6px">AP Progress</div>';
    [u.weapon, u.armor].filter(Boolean).forEach(item => {
      if (!item.ability) return;
      const cur = getAbilityProgress(u, item.name);
      const needed = getAbilityNeeded(item.name);
      const pct = Math.min(100, Math.floor(cur / needed * 100));
      html += '<div style="display:flex;justify-content:space-between;font-size:9px;font-family:var(--mono);margin-bottom:4px">';
      html += '<span>' + item.ability + '</span><span>' + cur + '/' + needed + ' AP</span>';
      html += '</div><div style="height:4px;background:#c8b898;margin-bottom:6px;overflow:hidden">';
      html += '<div style="width:' + pct + '%;height:100%;background:#30b848"></div></div>';
    });
    if (!u.weapon || !u.weapon.ability) {
      if (!u.armor || !u.armor.ability) {
        html += '<div style="font-size:9px;color:var(--muted)">Equip items with abilities to earn AP.</div>';
      }
    }
    // Learned abilities
    html += '<div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#304880;margin-top:8px;margin-bottom:4px">Learned</div>';
    if (u.abilities && u.abilities.length) {
      u.abilities.forEach(a => {
        html += '<span class="status-ailment" style="background:rgba(48,184,72,.1);border-color:rgba(48,184,72,.3);color:#30b848;font-size:9px;display:inline-block;margin:2px">' + a + '</span>';
      });
    } else {
      html += '<div style="font-size:9px;color:var(--muted)">None yet.</div>';
    }
    html += '</div>';
    html += '</div></div>';

    panel.innerHTML = html;

    // Draw character silhouette on canvas
    drawEquipChar(u);

    // Build item list (default to weapon)
    buildEquipItemList(u, 'w');

    // Slot click handlers
    document.getElementById('equipSlotW').addEventListener('click', () => {
      document.querySelectorAll('.equip-slot').forEach(s => s.classList.remove('active'));
      document.getElementById('equipSlotW').classList.add('active');
      buildEquipItemList(u, 'w');
    });
    document.getElementById('equipSlotA').addEventListener('click', () => {
      document.querySelectorAll('.equip-slot').forEach(s => s.classList.remove('active'));
      document.getElementById('equipSlotA').classList.add('active');
      buildEquipItemList(u, 'a');
    });
  }

  function drawEquipChar(u) {
    const c = document.getElementById('equipCharCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    c.width = 100; c.height = 120;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 100, 120);

    const raceColor = RACES[u.race] ? RACES[u.race].sprite : '#aaa';
    const isAlly = !u.isEnemy;
    const bodyColor = isAlly ? '#338855' : '#cc3333';
    const skinColor = '#ddaa77';

    // Body
    ctx.fillStyle = bodyColor;
    ctx.fillRect(38, 48, 24, 32);

    // Head
    ctx.beginPath();
    ctx.arc(50, 38, 14, 0, Math.PI * 2);
    ctx.fillStyle = skinColor;
    ctx.fill();
    ctx.strokeStyle = raceColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(44, 35, 3, 3);
    ctx.fillRect(53, 35, 3, 3);

    // Arms
    ctx.fillStyle = skinColor;
    ctx.fillRect(28, 50, 10, 6);
    ctx.fillRect(62, 50, 10, 6);

    // Legs
    ctx.fillStyle = '#554433';
    ctx.fillRect(40, 80, 8, 16);
    ctx.fillRect(52, 80, 8, 16);

    // Weapon indicator
    if (u.weapon) {
      ctx.fillStyle = '#999';
      ctx.fillRect(68, 46, 14, 3);
    }

    // Armor indicator
    if (u.armor) {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 48, 28, 32);
    }

    // Race collar
    ctx.fillStyle = raceColor;
    ctx.fillRect(40, 44, 20, 4);
  }

  function buildEquipItemList(u, slot) {
    const list = document.getElementById('equipItemList');
    if (!list) return;
    let html = '';
    const items = EQUIP.filter(e => e.slot === slot);
    const curItem = slot === 'w' ? u.weapon : u.armor;

    items.forEach(item => {
      const equipped = curItem && curItem.name === item.name;
      const canEquip = !item.jobs || item.jobs.includes(u.job);
      const cl = 'item' + (equipped ? ' equipped' : '') + (canEquip ? '' : ' grey');

      // Stat change preview
      let changes = [];
      if (slot === 'w') {
        const oldAtk = curItem ? (curItem.atk || 0) : 0;
        const diff = (item.atk || 0) - oldAtk;
        if (diff > 0) changes.push('<span class="ichange up">ATK+' + diff + '</span>');
        else if (diff < 0) changes.push('<span class="ichange down">ATK' + diff + '</span>');
        const oldMag = curItem ? (curItem.mp || 0) : 0;
        const md = (item.mp || 0) - oldMag;
        if (md > 0) changes.push('<span class="ichange up">MAG+' + md + '</span>');
        else if (md < 0) changes.push('<span class="ichange down">MAG' + md + '</span>');
      } else {
        const oldDef = curItem ? (curItem.def || 0) : 0;
        const dd = (item.def || 0) - oldDef;
        if (dd > 0) changes.push('<span class="ichange up">DEF+' + dd + '</span>');
        else if (dd < 0) changes.push('<span class="ichange down">DEF' + dd + '</span>');
        const oldMr = curItem ? (curItem.mres || 0) : 0;
        const md = (item.mres || 0) - oldMr;
        if (md > 0) changes.push('<span class="ichange up">RES+' + md + '</span>');
        else if (md < 0) changes.push('<span class="ichange down">RES' + md + '</span>');
      }
      const changeStr = changes.join(' ') || '<span class="ichange" style="color:var(--muted)">—</span>';
      const apStr = item.ability ? 'AP: ' + item.ability : '';

      html += '<div class="' + cl + '" data-item="' + item.name + '">';
      html += '<span class="ilbl">' + item.name + (equipped ? ' ✓' : '') + '</span>';
      html += '<span class="istat">' + (item.atk ? 'ATK+' + item.atk : '') + (item.def ? 'DEF+' + item.def : '') + '</span>';
      html += changeStr;
      html += '<span class="iap">' + apStr + '</span>';
      html += '</div>';
    });

    list.innerHTML = html;

    // Click handlers
    list.querySelectorAll('.item:not(.grey)').forEach(el => {
      el.addEventListener('click', () => {
        const itemName = el.dataset.item;
        const item = EQUIP.find(e => e.name === itemName);
        if (!item) return;
        if (item.slot === 'w') {
          if (item.jobs && !item.jobs.includes(u.job)) { toast('Cannot equip!', true); return; }
          u.weapon = item;
        } else {
          u.armor = item;
        }
        saveState();
        showUnitEquipOptions(u);
        renderClan();
        toast('Equipped ' + itemName + '!');
      });
    });
  }

  // ── EQUIP/UNEQUIP API ──────────────────────────────────────────────
  window.tactics = Object.assign(window.tactics || {}, {
    equipWeapon: (unitId, itemName) => {
      const u = state.units.find(x => x.id === unitId);
      if (!u) return;
      const item = EQUIP.find(e => e.name === itemName && e.slot === 'w');
      if (!item) return;
      if (item.jobs && !item.jobs.includes(u.job)) { toast('Cannot equip that weapon!', true); return; }
      u.weapon = item;
      saveState();
      showUnitEquipOptions(u);
      renderClan();
      toast(`${u.name} equipped ${itemName}!`);
    },
    equipArmor: (unitId, itemName) => {
      const u = state.units.find(x => x.id === unitId);
      if (!u) return;
      const item = EQUIP.find(e => e.name === itemName && e.slot === 'a');
      if (!item) return;
      u.armor = item;
      saveState();
      showUnitEquipOptions(u);
      renderClan();
      toast(`${u.name} equipped ${itemName}!`);
    },
    unequipWeapon: (unitId) => {
      const u = state.units.find(x => x.id === unitId);
      if (!u) return;
      u.weapon = null;
      saveState();
      showUnitEquipOptions(u);
      renderClan();
      toast(`${u.name} unequipped weapon.`);
    },
    unequipArmor: (unitId) => {
      const u = state.units.find(x => x.id === unitId);
      if (!u) return;
      u.armor = null;
      saveState();
      showUnitEquipOptions(u);
      renderClan();
      toast(`${u.name} unequipped armor.`);
    }
  });

  // ── JOBS RENDER ────────────────────────────────────────────────────
  function renderJobs() {
    const unlockedCount = Math.min(JOB_LIST.length, 6 + state.clanLevel * 2);
    dom.jobsUnlocked.innerHTML = '';
    dom.jobsLocked.innerHTML = '';
    JOB_LIST.forEach((jobId, idx) => {
      const job = JOBS[jobId];
      if (!job) return;
      const locked = idx >= unlockedCount;
      const card = document.createElement('div');
      card.className = `job${locked ? ' locked' : ''}`;
      const races = job.races ? job.races.join(' · ') : '—';
      card.innerHTML = `
        <h4>${jobId.replace(/([A-Z])/g, ' $1').trim()}</h4>
        <div class="race">${races}</div>
        <div class="desc" style="font-size:9px;color:var(--muted);margin-bottom:4px">${job.desc}</div>
        <div class="desc" style="font-size:8px;color:var(--gold)">${job.unlock}</div>
        <div class="stats">
          <div class="stat">HP <b>${job.hp}</b></div>
          <div class="stat">MP <b>${job.mp}</b></div>
          <div class="stat">ATK <b>${job.watk}</b></div>
          <div class="stat">DEF <b>${job.wdef}</b></div>
          <div class="stat">MAG <b>${job.mpow}</b></div>
          <div class="stat">SPD <b>${job.spd}</b></div>
        </div>
      `;
      if (locked) {
        dom.jobsLocked.appendChild(card);
      } else {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          if (!state.selectedUnit && state.units.length) state.selectedUnit = state.units[0];
          if (!state.selectedUnit) { toast('Select a unit from Clan tab.'); return; }
          const u = state.selectedUnit;
          if (!job.races.includes(u.race)) {
            toast(`${u.race}s cannot be ${jobId.replace(/([A-Z])/g, ' $1').trim()}!`, true);
            return;
          }
          if (idx > unlockedCount) { toast('Clan level too low!', true); return; }
          u.job = jobId;
          u.maxHp = job.hp * 2 + u.level * 3; u.hp = Math.min(u.hp, u.maxHp);
          u.maxMp = job.mp + u.level * 2; u.mp = Math.min(u.mp, u.maxMp);
          u.atk = job.watk + u.level;
          u.def = job.wdef + u.level;
          u.mag = job.mpow + u.level;
          u.spd = job.spd + u.level;
          u.jump = job.jump || 2;
          toast(`${u.name} is now ${jobId.replace(/([A-Z])/g, ' $1').trim()}!`);
          saveState();
          renderClan(); renderJobs(); renderEquip();
        });
        dom.jobsUnlocked.appendChild(card);
      }
    });
  }

  // ── EQUIP RENDER ───────────────────────────────────────────────────
  function renderEquip() {
    const u = state.selectedUnit || (state.units.length ? state.units[0] : null);
    if (!u) {
      dom.equipPanel.innerHTML = 'Select a clan member from the CLAN tab to view abilities.';
      return;
    }
    showUnitEquipOptions(u);
  }

  // ── SHOP ────────────────────────────────────────────────────────────
  let shopMode = 'buy';
  let shopSelItem = null;

  function renderShop() {
    const panel = dom.shopPanel;
    if (!panel) return;

    let html = '<div class="shop-layout">';
    // Header bar with Gil
    html += '<div class="shop-gil-display"><span>◈ ' + state.gil + ' GIL</span><span style="font-size:9px;opacity:.7">Buy & Sell Equipment</span></div>';
    // Tabs
    html += '<div class="shop-header">';
    html += '<div class="shop-tab' + (shopMode === 'buy' ? ' on' : '') + '" data-mode="buy">Buy</div>';
    html += '<div class="shop-tab' + (shopMode === 'sell' ? ' on' : '') + '" data-mode="sell">Sell</div>';
    html += '</div>';

    html += '<div class="shop-body">';
    // Left: item list
    html += '<div class="shop-list" id="shopItemList">';
    if (shopMode === 'buy') {
      // Categories
      html += '<div class="cat-label">◈ Weapons</div>';
      EQUIP.filter(e => e.slot === 'w').forEach(item => {
        const isSel = shopSelItem && shopSelItem.name === item.name;
        html += '<div class="item' + (isSel ? ' sel' : '') + '" data-item="' + item.name + '" data-slot="w"><span class="iname">' + item.name + '</span><span class="iprice">◈' + item.price + '</span></div>';
      });
      html += '<div class="cat-label">◈ Armor</div>';
      EQUIP.filter(e => e.slot === 'a').forEach(item => {
        const isSel = shopSelItem && shopSelItem.name === item.name;
        html += '<div class="item' + (isSel ? ' sel' : '') + '" data-item="' + item.name + '" data-slot="a"><span class="iname">' + item.name + '</span><span class="iprice">◈' + item.price + '</span></div>';
      });
      html += '<div class="cat-label">◈ Items</div>';
      ITEMS.forEach(item => {
        const inv = state.inventory.find(i => i.name === item.name);
        const qty = inv ? inv.qty : 0;
        const isSel = shopSelItem && shopSelItem.name === item.name;
        html += '<div class="item' + (isSel ? ' sel' : '') + '" data-item="' + item.name + '" data-slot="c"><span class="iname">' + item.name + '</span><span class="iqty">x' + qty + '</span><span class="iprice">◈' + item.price + '</span></div>';
      });
    } else {
      // Sell mode: show all units' equipment
      const u = state.selectedUnit || state.units[0];
      if (u) {
        html += '<div class="cat-label">' + u.name + '\'s Equipment</div>';
        if (u.weapon) {
          html += '<div class="item" data-item="' + u.weapon.name + '" data-sell="' + Math.floor(u.weapon.price / 2) + '"><span class="iname">' + u.weapon.name + '</span><span class="iprice">Sell ◈' + Math.floor(u.weapon.price / 2) + '</span></div>';
        }
        if (u.armor) {
          html += '<div class="item" data-item="' + u.armor.name + '" data-sell="' + Math.floor(u.armor.price / 2) + '"><span class="iname">' + u.armor.name + '</span><span class="iprice">Sell ◈' + Math.floor(u.armor.price / 2) + '</span></div>';
        }
        if (!u.weapon && !u.armor) {
          html += '<div style="padding:14px;font-size:10px;color:var(--muted)">No equipment to sell. Select a unit from CLAN first.</div>';
        }
      } else {
        html += '<div style="padding:14px;font-size:10px;color:var(--muted)">No units in clan.</div>';
      }
      // Also show inventory consumables
      if (state.inventory && state.inventory.length) {
        html += '<div class="cat-label">Consumables</div>';
        state.inventory.forEach(inv => {
          html += '<div class="item" data-consumable="' + inv.name + '"><span class="iname">' + inv.name + '</span><span class="iqty">x' + inv.qty + '</span></div>';
        });
      }
    }
    html += '</div>';

    // Right: detail panel
    html += '<div class="shop-detail" id="shopDetail">';
    if (shopSelItem) {
      const item = shopSelItem;
      html += '<div class="dname">' + item.name + '</div>';
      html += '<div class="ddesc">' + (item.desc || (item.atk ? 'A sturdy weapon.' : item.def ? 'Protective armor.' : 'A useful item.')) + '</div>';
      html += '<div class="dstats">';
      if (item.atk) html += '<div class="ds">ATK <b>' + item.atk + '</b></div>';
      if (item.def) html += '<div class="ds">DEF <b>' + item.def + '</b></div>';
      if (item.mp) html += '<div class="ds">MAG <b>' + item.mp + '</b></div>';
      if (item.mres) html += '<div class="ds">RES <b>' + item.mres + '</b></div>';
      if (item.range) html += '<div class="ds">Range <b>' + item.range + '</b></div>';
      if (item.elem) html += '<div class="ds">Element <b>' + item.elem + '</b></div>';
      html += '<div class="ds">Price <b style="color:var(--gold)">◈' + item.price + '</b></div>';
      html += '</div>';
      if (item.ability) {
        html += '<div style="font-size:9px;color:#30b848;font-family:var(--mono)">Ability: ' + item.ability + '</div>';
      }
      if (shopMode === 'buy') {
        const canAfford = state.gil >= item.price;
        html += '<div class="dbuy" data-action="buy" style="' + (canAfford ? '' : 'opacity:.4') + '">' + (canAfford ? 'Buy ◈' + item.price : 'Need ◈' + (item.price - state.gil) + ' more') + '</div>';
      }
    } else {
      html += '<div style="font-size:10px;color:var(--muted);padding:20px;text-align:center">Select an item to view details</div>';
    }
    html += '</div></div></div>';

    panel.innerHTML = html;

    // Attach event listeners
    // Tab switches
    panel.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        shopMode = tab.dataset.mode;
        shopSelItem = null;
        renderShop();
      });
    });

    // Item list clicks (buy mode)
    panel.querySelectorAll('.shop-list .item[data-item]').forEach(el => {
      el.addEventListener('click', () => {
        const itemName = el.dataset.item;
        const slot = el.dataset.slot;
        if (slot === 'c') {
          shopSelItem = ITEMS.find(i => i.name === itemName);
        } else if (slot === 'w' || slot === 'a') {
          shopSelItem = EQUIP.find(e => e.name === itemName);
        }
        renderShop();
      });
    });

    // Buy button
    const buyBtn = panel.querySelector('[data-action="buy"]');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        if (state.gil < shopSelItem.price) { toast('Not enough Gil!', true); return; }
        if (shopSelItem.heal !== undefined || shopSelItem.mp !== undefined) {
          // Consumable
          window.tactics.buyConsumable(shopSelItem.name);
        } else {
          window.tactics.buyItem(shopSelItem.name);
        }
        shopSelItem = null;
        renderShop();
      });
    }

    // Sell items
    panel.querySelectorAll('.shop-list .item[data-sell]').forEach(el => {
      el.addEventListener('click', () => {
        const itemName = el.dataset.item;
        window.tactics.sellItem(itemName);
        shopSelItem = null;
        renderShop();
      });
    });

    // Sell consumables
    panel.querySelectorAll('.shop-list .item[data-consumable]').forEach(el => {
      el.addEventListener('click', () => {
        const itemName = el.dataset.consumable;
        const inv = state.inventory.find(i => i.name === itemName);
        if (!inv) return;
        const item = ITEMS.find(i => i.name === itemName);
        const price = Math.floor((item ? item.price : 10) / 2);
        state.gil += price;
        inv.qty--;
        if (inv.qty <= 0) state.inventory = state.inventory.filter(i => i.name !== itemName);
        toast('Sold ' + itemName + ' for ◈' + price);
        saveState();
        renderShop();
      });
    });
  }

  window.tactics.buyConsumable = (itemName) => {
    const item = ITEMS.find(i => i.name === itemName);
    if (!item) return;
    if (state.gil < item.price) { toast('Not enough Gil!', true); return; }
    state.gil -= item.price;
    addItemToInventory(itemName, 1);
    toast(`Bought ${itemName}!`);
    renderShop();
  };

  window.tactics.buyItem = (itemName) => {
    const item = EQUIP.find(e => e.name === itemName);
    if (!item) return;
    if (state.gil < item.price) { toast('Not enough Gil!', true); return; }
    state.gil -= item.price;
    const unit = state.selectedUnit || state.units[0];
    if (!unit) { toast('No unit to equip!', true); return; }
    if (item.slot === 'w') {
      if (item.jobs && !item.jobs.includes(unit.job)) { toast('Your current job cannot use this!', true); state.gil += item.price; return; }
      unit.weapon = item;
    } else {
      unit.armor = item;
    }
    toast(`Bought ${itemName} for ${item.price} Gil!`);
    saveState();
    renderShop();
    renderClan();
  };

  // ── RECRUIT ─────────────────────────────────────────────────────────
  const RECRUIT_JOBS = {
    Human: ['Soldier','Fighter','WhiteMage','Thief','Paladin','Ninja','Sage'],
    Moogle: ['BlackMage','WhiteMage','TimeMage','Bishop','Thief','Juggler'],
    Viera: ['Archer','Fighter','WhiteMage','Sniper','Elementalist','Sage','Assassin'],
    Bangaa: ['Warrior','Fighter','Gladiator','WhiteMonk','Dragoon','Templar','Bishop'],
    NuMou: ['BlackMage','WhiteMage','TimeMage','Illusionist','Sage','Bishop']
  };
  const RECRUIT_COST = { Human:300, Moogle:350, Viera:320, Bangaa:280, NuMou:300 };

  window.tactics.recruitUnit = (race) => {
    const cost = RECRUIT_COST[race] || 300;
    if (state.gil < cost) { toast('Not enough Gil!', true); return; }
    const jobs = RECRUIT_JOBS[race] || ['Soldier'];
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const names = { Human:['Cid','Luso','Adel','Ezel','Rall'], Moogle:['Mog','Mimo','Puku','Gumo','Kupo'], Viera:['Luta','Sel','Ena','Fina','Kiya'], Bangaa:['Garo','Balk','Rune','Trog','Djan'], NuMou:['Nono','Olan','Ewen','Uro','Malak'] };
    const pool = names[race] || ['Recruit'];
    const name = pool[Math.floor(Math.random() * pool.length)];
    state.gil -= cost;
    const u = createUnit(name, race, job, Math.max(1, state.clanLevel));
    state.units.push(u);
    // Give starter weapon
    const weps = EQUIP.filter(e => e.slot === 'w' && (!e.jobs || e.jobs.includes(job)) && e.price <= 50);
    if (weps.length) u.weapon = weps[0];
    toast(`Recruited ${name} the ${job}! (${race})`);
    saveState();
    renderPub(); renderClan();
  };

  // ── SELL ITEMS ──────────────────────────────────────────────────────
  window.tactics.sellItem = (itemName) => {
    const u = state.selectedUnit;
    if (!u) { toast('Select a unit first.', true); return; }
    if (u.weapon && u.weapon.name === itemName) {
      const price = Math.floor(u.weapon.price / 2);
      state.gil += price;
      u.weapon = null;
      toast(`Sold ${itemName} for ${price} Gil.`);
    } else if (u.armor && u.armor.name === itemName) {
      const price = Math.floor(u.armor.price / 2);
      state.gil += price;
      u.armor = null;
      toast(`Sold ${itemName} for ${price} Gil.`);
    } else {
      toast('Unit does not have that item equipped.', true);
      return;
    }
    saveState();
    renderShop();
    renderClan();
    showUnitEquipOptions(u);
  };

  // ── DISPATCH RESULT MODAL ───────────────────────────────────────────
  function showDispatchResult(name, success, reward, days) {
    const modal = dom.endModal;
    if (!modal) return;
    dom.endTitle.textContent = success ? '✓ Dispatch Complete!' : '✕ Dispatch Failed';
    dom.endText.innerHTML = success
      ? `${name} returned after ${days} days!<br>Earned <b>${reward} Gil</b>.`
      : `${name} returned after ${days} days...<br>Mission was unsuccessful.`;
    modal.classList.add('on');
  }

  // ── SHOP SELL SECTION ───────────────────────────────────────────────
  function renderSellSection() {
    const u = state.selectedUnit || state.units[0];
    if (!u) return '<div style="font-size:11px;color:var(--muted);margin:10px 0">Select a unit from Clan tab.</div>';
    let html = '<div class="section-title">Sell Equipment (50% refund)</div>';
    html += `<div style="font-size:10px;color:var(--muted);margin-bottom:8px">${u.name}'s equipment:</div><div style="display:flex;gap:8px;flex-wrap:wrap">`;
    if (u.weapon) {
      const sellPrice = Math.floor(u.weapon.price / 2);
      html += `<div class="unit-card" style="cursor:pointer" onclick="window.tactics.sellItem('${u.weapon.name}')">
        <div class="name">${u.weapon.name}</div>
        <div class="race">Sell: ◈${sellPrice}</div>
      </div>`;
    }
    if (u.armor) {
      const sellPrice = Math.floor(u.armor.price / 2);
      html += `<div class="unit-card" style="cursor:pointer" onclick="window.tactics.sellItem('${u.armor.name}')">
        <div class="name">${u.armor.name}</div>
        <div class="race">Sell: ◈${sellPrice}</div>
      </div>`;
    }
    if (!u.weapon && !u.armor) html += '<div style="font-size:11px;color:var(--muted)">Nothing to sell.</div>';
    html += '</div>';
    return html;
  }

  // ── PERSISTENCE ────────────────────────────────────────────────────
  function promptClanName() {
    if (state.clanName) return;
    const overlay = document.createElement('div');
    overlay.id = 'clanNameOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--mono);color:var(--text);';
    overlay.innerHTML = `
      <h2 style="font-size:28px;margin-bottom:8px;letter-spacing:6px;text-transform:uppercase;color:var(--gold);text-shadow:0 0 20px rgba(255,215,0,0.3)">Name Your Clan</h2>
      <p style="color:var(--muted);margin-bottom:20px;font-size:13px">Choose a name for your clan. This cannot be changed.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:420px;width:100%" id="clanOptions"></div>
    `;
    const container = overlay.querySelector('#clanOptions');
    CLAN_NAMES.forEach(n => {
      const btn = document.createElement('button');
      btn.textContent = n;
      btn.style.cssText = 'background:var(--surface);border:1px solid var(--border);color:var(--text);padding:12px;border-radius:6px;cursor:pointer;font-family:var(--mono);font-size:13px;transition:all 0.15s';
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--gold)'; btn.style.background = 'var(--bg)'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; btn.style.background = 'var(--surface)'; });
      btn.addEventListener('click', () => {
        state.clanName = n;
        saveState();
        overlay.remove();
        renderPub();
        toast(`Your clan is now known as ${n}!`);
      });
      container.appendChild(btn);
    });
    document.body.appendChild(overlay);
  }

  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { Object.assign(state, JSON.parse(raw)); }
    } catch(e) {}
    // Backfill for old saves
    if (!state.activeParty || !state.activeParty.length) {
      state.activeParty = state.units.slice(0, 5).map(u => u.id);
    }
    if (!state.currentLocation) state.currentLocation = 'cyril';
    if (!state.visitedLocations) state.visitedLocations = ['cyril'];
    return state.clanLevel > 1 || state.gil > 1200 || state.units.length > 4;
  }

  function resetState() {
    const starter = generateStarterClan();
    state = {
      clanLevel: 1, gil: 1200, jp: 0, apPool: 0, completedMissions: [],
      units: starter,
      battle: null, selectedUnit: null, selectedAbility: null,
      moveRange: null, actRange: null, shopOpen: false, animating: false,
      inventory: [], lawCards: [], recruitedLawCards: [],
      clanName: null, activeParty: starter.slice(0, 5).map(u => u.id),
      currentLocation: 'cyril', currentScene: 'world',
      visitedLocations: ['cyril']
    };
    saveState();
  }

  // ── ADDITIONAL HELPERS ─────────────────────────────────────────────
  window.tactics.getAbilityProgress = getAbilityProgress;
  window.tactics.getAbilityNeeded = getAbilityNeeded;
  window.tactics.awardAP = awardAP;

  // ── INIT ───────────────────────────────────────────────────────────
  function init() {
    cacheDom();
    if (!loadState()) resetState();

    setTimeout(() => promptClanName(), 300);

    dom.tabs.forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.scene));
    });

    setupCanvasClick();
    setupActions();
    setupSysMenu();

    // World map canvas click - walk to clicked location
    const wc = dom.mapCanvas;
    if (wc) {
      wc.addEventListener('click', (e) => {
        if (isWalking) return;  // Don't interrupt walking
        const rect = wc.getBoundingClientRect();
        // Account for camera offset
        const sx = (e.clientX - rect.left) / rect.width * rect.width + worldCamera.x;
        const sy = (e.clientY - rect.top) / rect.height * rect.height + worldCamera.y;
        // Find closest unlocked location within 60px
        let closest = null, closestDist = 80;
        WORLD_LOCATIONS.forEach(loc => {
          if (!isLocationUnlocked(loc)) return;
          const px = getLocPos(loc);
          const dist = Math.sqrt((sx - px.x) ** 2 + (sy - px.y) ** 2);
          if (dist < closestDist) { closestDist = dist; closest = loc; }
        });
        if (closest) startWalkingTo(closest.id);
      });
    }

    window.addEventListener('resize', () => {
      if (state.battle) { initCanvas(); renderGrid(); }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (dom.sysmenu) dom.sysmenu.classList.remove('on'); if (dom.endModal) dom.endModal.classList.remove('on'); if (dom.townMenu) dom.townMenu.classList.remove('on'); if (dom.cutsceneModal) dom.cutsceneModal.classList.remove('on'); return; }
      handleKeyboardInput(e);
    });

    window.tactics = Object.assign(window.tactics || {}, {
      state, saveState, loadState, resetState,
      switchTab, renderPub, renderClan, renderJobs, renderEquip, renderShop,
      deployBattle, returnToPub, toast, fmsg, renderWorldMap,
      initCanvas, renderGrid, nextTurn, updateBattleUI,
      showUnitEquipOptions, getAbilityProgress, getAbilityNeeded, awardAP,
      drawEquipChar, buildEquipItemList,
      ABILITIES, TERRAIN, elevation, terrain,
      WORLD_LOCATIONS, goToLocation, townAction, hideTownMenu,
      ITEMS, addItemToInventory, useItemOn, openItemSelect, showDispatchResult,
      recruitUnit: window.tactics.recruitUnit,
      buyConsumable: window.tactics.buyConsumable,
      sellItem: window.tactics.sellItem
    });

    switchTab('world');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
