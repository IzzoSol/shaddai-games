/* ════════════════════════════════════════════════════════════════════════════
   SHADDAI · dark-realm.js — Dark Forest / Castle Siege / Dragon Boss
   Phases: forest → gate → dragon_chains → dragon_final → victory/defeat
   Respawn: downed players revive at campfires (teammates or auto after 60s)
   Rewards: contribution score → pool share + cosmetics (tracked in localStorage)
   ════════════════════════════════════════════════════════════════════════════ */
'use strict';

window.DarkRealm = (function () {

  // ── Config ─────────────────────────────────────────────────────────────────
  const CFG = {
    GATE_HP:            3000,
    GATE_GUARDIAN_SPWN: 20000,   // ms between gate guardian spawns
    CHAINS:             4,
    CHAIN_HP:           800,
    DRAGON_HP:          8000,
    DRAGON_RAGE_MULT:   1.5,     // damage multiplier if any chains unbroken
    FOREST_ZONE_KILLS:  24,      // kills to unlock next forest zone (6 zones — a long march)
    FOREST_ZONES:       6,       // number of forest zones + campfire checkpoints
    DOWN_REVIVE_MS:     60000,   // auto-revive after 60s solo
    CAMPFIRE_RADIUS:    2.0,     // tiles — how close to campfire to revive/camp
    SCHEDULED_INTERVAL: 2 * 3600 * 1000, // every 2 hours
    DRAGON_BREATH_DMG:  18,
    DRAGON_TAIL_DMG:    12,
    MOAT_DRAIN_PER_DAY: 3.5,   // natural drain — ~29 days to fully dry
    MOAT_SIEGE_DRAIN:   5,     // each completed siege drains 5%
    MOAT_DROUGHT_DRAIN: 2,     // per Sun Shrine offering (costs 100 Sparks)
    CAMP: {                    // fire/camp survival — the pack comes at night
      BASE_FUEL:       60,     // seconds of burn a fresh camp starts with
      FUEL_PER_WOOD:   80,     // seconds added per wood upgrade
      WOOD_PER_LEVEL:  2,      // wood cost per upgrade (scales as it grows)
      MAX_LEVEL:       4,      // bigger fire fights off MORE wolves
      PACK_TIME:       16000,  // ms between wolf packs stalking the camp
      REPEL_TIME:      4000,   // ms between fire scorch ticks
      REGEN_HP:        2.2,    // hp/sec healed while the fire burns
      REPEL_PER_LEVEL: 2,      // wolves scorched per tick per fire level
      RADIUS:          2.2,    // base fire radius (tiles)
      RADIUS_PER_LEVEL: 1.1,   // radius growth per level
    },
  };

  // ── State ──────────────────────────────────────────────────────────────────
  const S = {
    active:       false,
    phase:        'idle',        // idle | forest | moat | gate | chains | final | victory | defeat
    forestZone:   1,             // 1-6 escalating difficulty
    killCount:    0,
    gateHP:       CFG.GATE_HP,
    gateMaxHP:    CFG.GATE_HP,
    gateGuardTimer: 0,
    chains:       [],            // [{id, hp, broken}]
    dragonHP:     CFG.DRAGON_HP,
    dragonMaxHP:  CFG.DRAGON_HP,
    dragonPhase:  'chained',     // chained | raging | final
    dragonFlash:  0,             // hit flash timer
    dragonBreath: 0,             // breath attack timer
    dragonWingBuff: 0,           // wing buffet attack timer
    dragonGroundPound: 0,        // ground pound timer (final phase)
    nextScheduled: 0,
    contrib:      { kills:0, gateDmg:0, dragonDmg:0, chainBreaks:0 }, // local player
    poolSparks:   0,             // accumulated pool (sparks, not real $ yet)
    campfires:    [],            // [{col,row,cacheSearched}] placed in world after spawn
    downedAt:     0,             // timestamp when player went down (0=alive)
    downedAutoReviveTimer: 0,
    waveRespawnTimer: 0,         // countdown to next enemy wave top-up
    log:          [],
    moatLevel:    100,   // 0 = dry/crossable · 100 = full/impassable
    moatSavedTs:  0,     // when moat was last persisted (for natural drain calc)
    camp: { on: 0, at: -1, level: 0, fuel: 0, packTimer: 0, repelTimer: 0, packCount: 0, fireOut: false },
    towersSpawned: false,   // 4 Tower Knights guard the Inner Ward
    knightsDown: 0,
    basementSpawned: false, // wolves + guard loose from the vault
    chestLooted: false,     // basement vault chest (chains+ phase pickup)
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function addLog(msg, color) {
    S.log.unshift({ ts: Date.now(), msg, color: color || '#e8f5f0' });
    if (S.log.length > 24) S.log.length = 24;
    _refreshPanel();
  }

  function playerDown() {
    if (S.downedAt) return; // already down
    S.downedAt = Date.now();
    S.downedAutoReviveTimer = CFG.DOWN_REVIVE_MS;
    addLog('☠ You have been downed! Reach a campfire or wait 60s.', '#ff4040');
    if (typeof toast === 'function') toast('☠ DOWNED — find a campfire to respawn!');
  }

  function playerRevive() {
    if (!S.downedAt) return;
    S.downedAt = 0;
    S.downedAutoReviveTimer = 0;
    if (window.playerHP !== undefined) { window.playerHP = Math.round((window.playerMaxHP || 100) * 0.5); }
    addLog('◈ Revived at campfire!', '#00ff9c');
    if (typeof toast === 'function') toast('◈ Revived — back in the fight!');
    if (typeof updateHP === 'function') updateHP();
  }

  // ── Moat Persistence ───────────────────────────────────────────────────────
  function _loadMoat() {
    try {
      const d = JSON.parse(localStorage.getItem('shaddai.moat') || 'null');
      if (!d) { S.moatLevel = 100; S.moatSavedTs = Date.now(); return; }
      // Monthly hard reset — moat refills every new calendar month
      const now = new Date(), saved = new Date(d.savedTs || 0);
      if (now.getMonth() !== saved.getMonth() || now.getFullYear() !== saved.getFullYear()) {
        S.moatLevel = 100; S.moatSavedTs = Date.now(); _saveMoat(); return;
      }
      // Natural drain based on real elapsed days
      const daysPassed = Math.max(0, (Date.now() - (d.savedTs || Date.now())) / 86400000);
      S.moatLevel = Math.max(0, (d.level || 100) - daysPassed * CFG.MOAT_DRAIN_PER_DAY);
      S.moatSavedTs = Date.now();
    } catch (_) { S.moatLevel = 100; S.moatSavedTs = Date.now(); }
  }

  function _saveMoat() {
    try { localStorage.setItem('shaddai.moat', JSON.stringify({ level: S.moatLevel, savedTs: Date.now() })); } catch (_) {}
  }

  function addDrought(offeringCount) {
    const drain = (offeringCount || 1) * CFG.MOAT_DROUGHT_DRAIN;
    S.moatLevel = Math.max(0, S.moatLevel - drain);
    _saveMoat();
    if (S.moatLevel <= 0) {
      addLog('☀ MOAT HAS DRIED! The castle is now crossable!', '#ff9900');
    } else {
      addLog('☀ Drought Offering received! Moat: ' + Math.round(S.moatLevel) + '% full', '#ff9900');
    }
    _updateHud();
    return S.moatLevel;
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _loadPersist();
    _loadMoat();
    if (S.nextScheduled === 0) S.nextScheduled = Date.now() + CFG.SCHEDULED_INTERVAL;
    _savePersist();
    _resetState();
    // Campfire positions match world-regions/darkforest.js clearings exactly
    S.campfires = [
      { col: 22, row: 42, cacheSearched: false },  // Zone 1 campfire
      { col: 10, row: 38, cacheSearched: false },  // Zone 2 campfire
      { col:  6, row: 26, cacheSearched: false },  // Zone 3 campfire
      { col: 14, row: 16, cacheSearched: false },  // Zone 4 campfire
      { col: 28, row: 20, cacheSearched: false },  // Zone 5 campfire
      { col: 42, row: 14, cacheSearched: false },  // Zone 6 campfire
    ];
    if (!S.active && Date.now() >= S.nextScheduled) openSiege();
    // Inject castle guard types into Combat registry (idempotent, avoids editing combat.js)
    try {
      if (window.Combat && window.Combat.TYPES) {
        if (!window.Combat.TYPES.tower_knight) window.Combat.TYPES.tower_knight = {
          name: 'Tower Knight', hp: 240, speed: 1.5, dmg: 26, r: 1.2, color: '#4a4f5e',
          size: 1.4, tough: 3.2, shape: 'humanoid', eye: '#ffd700', glow: '#b89a2a'
        };
        if (!window.Combat.TYPES.basement_guard) window.Combat.TYPES.basement_guard = {
          name: 'Basement Guard', hp: 140, speed: 1.8, dmg: 20, r: 1.1, color: '#2a2e3a',
          size: 1.2, tough: 2.2, shape: 'humanoid', eye: '#ff6a3a', glow: '#c03060'
        };
      }
    } catch (_) {}
    _updateHud();
  }

  function _resetState() {
    S.killCount = 0;
    S.forestZone = 1;
    S.gateHP = CFG.GATE_HP;
    S.gateMaxHP = CFG.GATE_HP;
    S.gateGuardTimer = 0;
    S.chains = Array.from({ length: CFG.CHAINS }, function (_, i) {
      return { id: i, hp: CFG.CHAIN_HP, maxHp: CFG.CHAIN_HP, broken: false };
    });
    S.dragonHP = CFG.DRAGON_HP;
    S.dragonMaxHP = CFG.DRAGON_HP;
    S.dragonPhase = 'chained';
    S.dragonBreath = 0;
    S.dragonWingBuff = 0;
    S.dragonGroundPound = 0;
    S.contrib = { kills: 0, gateDmg: 0, dragonDmg: 0, chainBreaks: 0 };
    S.downedAt = 0;
    S.downedAutoReviveTimer = 0;
    S.waveRespawnTimer = 20000;
    S.log = [];
    S.camp = { on: 0, at: -1, level: 0, fuel: 0, packTimer: 0, repelTimer: 0, packCount: 0, fireOut: false };
    S.towersSpawned = false; S.knightsDown = 0;
    S.basementSpawned = false; S.chestLooted = false;
    // reset campfire cache flags for new siege
    S.campfires.forEach(function (cf) { cf.cacheSearched = false; });
  }

  // ── Wave Spawning ──────────────────────────────────────────────────────────
  function _spawnWave(zoneNum, small) {
    if (!window.Combat || !window.Combat.spawnDarkZone) return;
    const wf = (typeof walkable === 'function') ? walkable : (window.walkable || function () { return true; });
    const GW = window.GW || 52, GH = window.GH || 52;
    let newEnemies = window.Combat.spawnDarkZone(Math.min(zoneNum, 5), wf, GW, GH);
    if (small && newEnemies.length > 3) newEnemies = newEnemies.slice(0, 3);
    if (!window.enemies) window.enemies = [];
    // Remove any already-dead enemies first to keep array clean
    window.enemies = window.enemies.filter(function (e) { return !e.dead; });
    window.enemies = window.enemies.concat(newEnemies);
    if (newEnemies.length > 0 && !small) {
      addLog('⚔ Zone ' + zoneNum + ' wave incoming! ' + newEnemies.length + ' enemies.', '#cc44ff');
    }
  }

  // ── Open / Close ───────────────────────────────────────────────────────────
  function openSiege() {
    S.active = true;
    S.phase = 'forest';
    _resetState();
    addLog('☠ THE DARK REALM SIEGE HAS BEGUN!', '#ff0066');
    addLog('⚔ Clear the forest — reach the castle gates.', '#cc44ff');
    if (typeof toast === 'function') toast('☠ SIEGE BEGINS — enter the Dark Realm!');
    // Spawn initial zone 1 wave
    S.waveRespawnTimer = 15000; // 15s before first auto top-up
    setTimeout(function () { _spawnWave(1); }, 800); // slight delay so world is ready
    _savePersist();
    _updateHud();
  }

  function endSiege(outcome) {
    S.active = false;
    S.phase = outcome; // 'victory' or 'defeat'
    if (S.camp.on) campBreak('⚔ The siege has ended — your campfire goes cold.');
    S.nextScheduled = Date.now() + CFG.SCHEDULED_INTERVAL;
    _distributeRewards(outcome);
    // Each completed siege naturally drains the moat
    S.moatLevel = Math.max(0, S.moatLevel - CFG.MOAT_SIEGE_DRAIN);
    _saveMoat();
    _savePersist();
    _updateHud();
    _showResults(outcome);
  }

  // ── Main Update ─────────────────────────────────────────────────────────────
  function update(dt, player, enemies) {
    S.lastPlayer = player;
    if (!window.regionSel || window.regionSel !== 'darkforest') return;
    if (!S.active) {
      if (Date.now() >= S.nextScheduled) openSiege();
      return;
    }
    _updateChestPickup(player);

    // ── Downed state ─────────────────────────────────────────────────────────
    if (S.downedAt) {
      S.downedAutoReviveTimer -= dt;
      if (S.downedAutoReviveTimer <= 0) playerRevive();
      else {
        // Check campfire proximity for manual revive
        if (player) {
          for (var cf of S.campfires) {
            var dx = player.col - cf.col, dy = player.row - cf.row;
            if (Math.sqrt(dx * dx + dy * dy) < CFG.CAMPFIRE_RADIUS) {
              playerRevive();
              break;
            }
          }
        }
      }
      return; // can't do combat while downed
    }

    // ── Check if player HP hit 0 ─────────────────────────────────────────────
    if (window.playerHP !== undefined && window.playerHP <= 0 && window.playerMaxHP > 0) {
      playerDown();
      return;
    }

    if (S.camp.on && S.phase === 'forest') _updateCamp(dt, player, enemies);

    if (S.phase === 'forest') _updateForest(dt, player, enemies);
    else if (S.phase === 'moat') _updateMoat();
    else if (S.phase === 'gate') _updateGate(dt, player, enemies);
    else if (S.phase === 'chains') _updateChains(dt, player, enemies);
    else if (S.phase === 'final') _updateDragonFinal(dt, player, enemies);
  }

  // ── Forest Phase ─────────────────────────────────────────────────────────────
  function _updateForest(dt, player, enemies) {
    const prevZone = S.forestZone;
    const zoneThreshold = CFG.FOREST_ZONE_KILLS * S.forestZone;
    if (S.killCount >= zoneThreshold && S.forestZone < CFG.FOREST_ZONES) {
      S.forestZone++;
      addLog('◈ Zone ' + S.forestZone + ' — enemies grow stronger!', '#ff7700');
      if (typeof toast === 'function') toast('☠ Zone ' + S.forestZone + ' — the shadows deepen!');
      _spawnWave(S.forestZone); // spawn new zone's enemies immediately
      S.waveRespawnTimer = 20000;
    }

    // Periodic top-up: if live enemies drop below 3, spawn a small reinforcement wave
    S.waveRespawnTimer -= dt;
    if (S.waveRespawnTimer <= 0) {
      const liveCount = enemies ? enemies.filter(function (e) { return !e.dead; }).length : 0;
      if (liveCount < 4) {
        _spawnWave(S.forestZone, true); // small=true → max 3 enemies
      }
      S.waveRespawnTimer = 12000; // check again in 12s
    }

    if (S.killCount >= CFG.FOREST_ZONE_KILLS * CFG.FOREST_ZONES) {
      if (S.moatLevel > 0) {
        S.phase = 'moat';
        addLog('💧 THE CASTLE MOAT BLOCKS YOUR PATH!', '#2266ff');
        addLog('Moat is ' + Math.round(S.moatLevel) + '% full — visit the Sun Shrine in SHADDAI City.', '#4488ff');
        if (typeof toast === 'function') toast('💧 Moat blocks the castle — ' + Math.round(S.moatLevel) + '% full!');
        _savePersist();
      } else {
        S.phase = 'gate';
        addLog('⚔ THE CASTLE GATES ARE BEFORE YOU — attack!', '#ff0000');
        if (typeof toast === 'function') toast('⚔ Castle Gate breached range! Attack the gates!');
        _castleKnights();
        _savePersist();
      }
    }
  }

  // ── Moat Phase ─────────────────────────────────────────────────────────────
  function _updateMoat() {
    _loadMoat(); // re-read in case another tab/session contributed drought
    if (S.moatLevel <= 0) {
      S.phase = 'gate';
      addLog('☀ THE MOAT HAS DRIED — storm the gates!', '#ff0000');
      if (typeof toast === 'function') toast('☀ MOAT DRIED — CHARGE THE GATES!');
      _castleKnights();
      _savePersist();
    }
  }

  // ── Castle Ward ───────────────────────────────────────────────────────────────
  // 4 Tower Knights guard the Inner Ward corners once the castle gates open.
  function _castleKnights() {
    if (S.towersSpawned || !window.enemies || !window.Combat) return;
    S.towersSpawned = true;
    const spots = [[22, 6], [32, 6], [22, 13], [32, 13]];
    spots.forEach(function (p, i) {
      window.enemies.push({
        id: '_tknight_' + i + '_' + Date.now(),
        kind: 'tower_knight',
        towerKnight: true, tkIndex: i,
        col: p[0] + 0.5, row: p[1] + 0.5, tc: 27.5, tr: 9.5,
        hp: 240, maxhp: 240, speed: 1.5, dmg: 26, r: 1.2, atkCd: 1.4,
        dead: false, hitFlash: 0, aggro: 9, bob: Math.random() * 6.28
      });
    });
    addLog('⚔ The 4 Tower Knights descend — guard the Inner Ward!', '#ffcc00');
    if (typeof toast === 'function') toast('⚔ 4 Tower Knights block the Inner Ward!');
  }

  // When the gates shatter, wolves + a guard burst from the basement vault.
  function _basementAmbush() {
    if (S.basementSpawned || !window.enemies || !window.Combat) return;
    S.basementSpawned = true;
    function mk(kind, c, r, extra) {
      window.enemies.push(Object.assign({
        id: '_basement_' + c + '_' + r + '_' + Date.now(),
        kind: kind, basementMob: true,
        col: c + 0.5, row: r + 0.5, tc: 27.5, tr: 9.5,
        dead: false, hitFlash: 0, bob: Math.random() * 6.28
      }, extra));
    }
    mk('wolf', 30, 11, { hp: 55, maxhp: 55, speed: 2.4, dmg: 12, r: 0.8, atkCd: 1.0, aggro: 10 });
    mk('wolf', 32, 11, { hp: 55, maxhp: 55, speed: 2.4, dmg: 12, r: 0.8, atkCd: 1.0, aggro: 10 });
    mk('basement_guard', 31, 12, { hp: 140, maxhp: 140, speed: 1.8, dmg: 20, r: 1.1, atkCd: 1.3, aggro: 9 });
    addLog('📦 The basement wards rattle — wolves loose from the vault!', '#ffaa00');
    if (typeof toast === 'function') toast('📦 Wolves burst from the basement vault!');
  }

  // Castle drop handling for Tower Knights / basement mobs (phase-agnostic).
  function _onCastleKill(enemy) {
    const isKnight = !!enemy.towerKnight;
    const gold = isKnight ? 50 : 18;
    const sparks = isKnight ? 25 : 8;
    if (window.wallet && typeof window.wallet.add === 'function') {
      try {
        window.wallet.add(gold);
        if (typeof addFloat === 'function') { try { addFloat(enemy.col, enemy.row, '💵+' + gold, '#ffe9a8'); } catch (_) {} }
      } catch (_) {}
    }
    if (window.wallet && typeof window.wallet.addInv === 'function' && (isKnight || Math.random() < 0.5)) {
      try { window.wallet.addInv('potion', 1); } catch (_) {}
    }
    if (window.__sparks && typeof window.__sparks.add === 'function') {
      try { window.__sparks.add('siege', sparks, (isKnight ? 'Tower Knight' : 'Basement wolf') + ' slain'); } catch (_) {}
    }
    addLog((isKnight
      ? ('⚔ Tower Knight falls! +' + gold + ' gold · +1 potion · +' + sparks + '⚡')
      : ('📦 Basement beast slain! +' + gold + ' gold · +' + sparks + '⚡')), '#aaffaa');
    if (isKnight) S.knightsDown++;
    if (S.knightsDown >= 4) {
      addLog('🏴 The Inner Ward is clear — the keep stands open!', '#ffcc00');
      if (typeof toast === 'function') toast('🏴 All Tower Knights fallen!');
    }
  }

  // Basement vault chest pickup (chains+ / final) — claims once by proximity.
  function _updateChestPickup(player) {
    if (S.chestLooted || !player) return;
    if (S.phase !== 'chains' && S.phase !== 'final' && S.phase !== 'victory') return;
    const dx = player.col - 31.5, dy = player.row - 11.5;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) return;
    S.chestLooted = true;
    const gold = 40;
    if (window.wallet && typeof window.wallet.add === 'function') {
      try { window.wallet.add(gold); } catch (_) {}
    }
    if (window.wallet && typeof window.wallet.addInv === 'function') {
      try { window.wallet.addInv('potion', 2); } catch (_) {}
    }
    if (window.__sparks && typeof window.__sparks.add === 'function') {
      try { window.__sparks.add('siege', 30, 'Basement vault chest'); } catch (_) {}
    }
    addLog('📜 Basement Vault opened! +' + gold + ' gold · +2 potions · +30⚡', '#e8c45c');
    if (typeof toast === 'function') toast('📜 BASEMENT VAULT — treasure, howled over by wolves!');
  }

  // ── Gate Phase ─────────────────────────────────────────────────────────────
  function _updateGate(dt, player, enemies) {
    // Gate guardians spawn periodically
    S.gateGuardTimer += dt;
    if (S.gateGuardTimer >= CFG.GATE_GUARDIAN_SPWN) {
      S.gateGuardTimer = 0;
      _spawnGateGuardian();
    }
    // Gate HP is reduced via attackGate() called from the action button
    if (S.gateHP <= 0) {
      S.phase = 'chains';
      addLog('💥 THE GATES SHATTER — the dragon stirs within!', '#ff0000');
      addLog('◈ Break the chains before it breaks free!', '#cc44ff');
      if (typeof toast === 'function') toast('💥 Gates broken — the Dragon AWAKENS!');
      _basementAmbush();
      _savePersist();
    }
  }

  // ── Chain Phase ─────────────────────────────────────────────────────────────
  function _updateChains(dt, player, enemies) {
    // Dragon breath — scales with chains remaining (more chains = weaker breath)
    S.dragonBreath += dt;
    if (S.dragonBreath >= 5000) {
      S.dragonBreath = 0;
      if (!S.downedAt && window.playerHP !== undefined) {
        const remaining = S.chains.filter(function (c) { return !c.broken; }).length;
        const dmg = Math.round(CFG.DRAGON_BREATH_DMG * (remaining * 0.25 + 0.25));
        window.playerHP = Math.max(1, window.playerHP - dmg);
        if (typeof updateHP === 'function') updateHP();
        addLog('🔥 Dragon breath! -' + dmg + ' HP', '#ff4400');
        if (typeof addFloat === 'function' && player) { try { addFloat(player.col, player.row, '-' + dmg + ' 🔥', '#ff4400'); } catch (_) {} }
      }
    }
    // Wing buffet — shockwave every 8s regardless of chains
    S.dragonWingBuff += dt;
    if (S.dragonWingBuff >= 8000) {
      S.dragonWingBuff = 0;
      if (!S.downedAt && window.playerHP !== undefined) {
        const dmg = 8;
        window.playerHP = Math.max(1, window.playerHP - dmg);
        if (typeof updateHP === 'function') updateHP();
        addLog('💨 Wing buffet! -' + dmg + ' HP — knocked back!', '#aa44ff');
        if (typeof addFloat === 'function' && player) { try { addFloat(player.col, player.row, '💨 BUFFET!', '#aa44ff'); } catch (_) {} }
        // knockback player
        if (player) { player.col += (Math.random() - 0.5) * 2; player.row += (Math.random() - 0.5) * 2; }
      }
    }
    S.dragonFlash = Math.max(0, S.dragonFlash - dt);
    const allBroken = S.chains.every(function (c) { return c.broken; });
    if (allBroken) {
      S.dragonPhase = 'raging';
      S.phase = 'final';
      addLog('⚠ ALL CHAINS BROKEN — Dragon rages!', '#ff0000');
      if (typeof toast === 'function') toast('⚠ Dragon UNCHAINED — final battle!');
      _savePersist();
    }
    if (S.dragonHP <= S.dragonMaxHP * 0.4 && S.phase === 'chains') {
      S.phase = 'final';
      addLog('◈ Dragon weakened — press the attack!', '#ff7700');
      _savePersist();
    }
  }

  // ── Dragon Final Phase ─────────────────────────────────────────────────────
  function _updateDragonFinal(dt, player, enemies) {
    // Fire breath — faster when raging
    S.dragonBreath += dt;
    const breathInterval = S.dragonPhase === 'raging' ? 3200 : 5000;
    if (S.dragonBreath >= breathInterval) {
      S.dragonBreath = 0;
      if (!S.downedAt && window.playerHP !== undefined) {
        const rage = S.dragonPhase === 'raging' ? CFG.DRAGON_RAGE_MULT : 1;
        const dmg = Math.round(CFG.DRAGON_BREATH_DMG * rage);
        window.playerHP = Math.max(0, window.playerHP - dmg);
        if (typeof updateHP === 'function') updateHP();
        addLog('🔥 Dragon fire! -' + dmg + ' HP', '#ff4400');
        if (typeof addFloat === 'function' && player) { try { addFloat(player.col, player.row, '-' + dmg + ' 🔥', '#ff6600'); } catch (_) {} }
        if (window.playerHP <= 0) playerDown();
      }
    }
    // Wing buffet — every 8s still active
    S.dragonWingBuff += dt;
    if (S.dragonWingBuff >= (S.dragonPhase === 'raging' ? 5500 : 8000)) {
      S.dragonWingBuff = 0;
      if (!S.downedAt && window.playerHP !== undefined) {
        window.playerHP = Math.max(1, window.playerHP - 10);
        if (typeof updateHP === 'function') updateHP();
        addLog('💨 Wing buffet!', '#aa44ff');
        if (player) { player.col += (Math.random() - 0.5) * 2.5; player.row += (Math.random() - 0.5) * 2.5; }
      }
    }
    // Ground pound — AoE at low HP (final desperation)
    S.dragonGroundPound += dt;
    if (S.dragonPhase === 'raging' && S.dragonHP < S.dragonMaxHP * 0.25 && S.dragonGroundPound >= 6000) {
      S.dragonGroundPound = 0;
      if (!S.downedAt && window.playerHP !== undefined) {
        const dmg = 22;
        window.playerHP = Math.max(0, window.playerHP - dmg);
        if (typeof updateHP === 'function') updateHP();
        addLog('💥 GROUND POUND — everything shakes! -' + dmg + ' HP', '#ff0000');
        if (typeof addFloat === 'function' && player) { try { addFloat(player.col, player.row, '💥 -' + dmg, '#ff0000'); } catch (_) {} }
        // Dragon spawns shadow wraith minions at <25% HP
        if (window.enemies && window.Combat) {
          try {
            const GW = window.GW || 52, GH = window.GH || 52;
            const wf = window.walkable || function () { return true; };
            const w1 = window.Combat.spawnDarkZone(5, wf, GW, GH).slice(0, 2);
            w1.forEach(function (e) { e.kind = 'shadow_wraith'; });
            window.enemies = window.enemies.concat(w1);
            addLog('☠ Dragon summons Shadow Wraiths!', '#aa00ff');
          } catch (_) {}
        }
        if (window.playerHP <= 0) playerDown();
      }
    }
    // Tail swipe — random chance
    if (Math.random() < 0.00025 * dt && !S.downedAt && window.playerHP !== undefined) {
      window.playerHP = Math.max(0, window.playerHP - CFG.DRAGON_TAIL_DMG);
      if (typeof updateHP === 'function') updateHP();
      addLog('⚡ Tail swipe! -' + CFG.DRAGON_TAIL_DMG + ' HP', '#ff6600');
      if (window.playerHP <= 0) playerDown();
    }
    S.dragonFlash = Math.max(0, S.dragonFlash - dt);
    if (S.dragonHP <= 0) endSiege('victory');
  }

  // ── Player Attack Actions ───────────────────────────────────────────────────
  function attackGate(dmg) {
    if (S.phase !== 'gate') { if (typeof toast === 'function') toast('Reach the gate first!'); return; }
    dmg = dmg || 80;
    S.gateHP = Math.max(0, S.gateHP - dmg);
    S.contrib.gateDmg += dmg;
    addLog('⚔ Gate struck! HP ' + S.gateHP + '/' + S.gateMaxHP, '#ff8800');
    if (typeof toast === 'function') toast('⚔ Gate -' + dmg + '! HP: ' + S.gateHP);
    _refreshPanel();
  }

  function attackChain(chainId) {
    if (S.phase !== 'chains') return;
    const chain = S.chains[chainId];
    if (!chain || chain.broken) { if (typeof toast === 'function') toast('Chain already broken!'); return; }
    const dmg = 150;
    chain.hp = Math.max(0, chain.hp - dmg);
    S.dragonFlash = 200;
    if (chain.hp <= 0) {
      chain.broken = true;
      S.contrib.chainBreaks++;
      addLog('⛓ Chain ' + (chainId + 1) + ' BROKEN! Dragon weakens!', '#cc44ff');
      if (typeof toast === 'function') toast('⛓ Chain ' + (chainId + 1) + ' broken!');
    } else {
      addLog('⛓ Chain ' + (chainId + 1) + ' struck — HP ' + chain.hp, '#cc00ff');
    }
    _refreshPanel();
  }

  function attackDragon(dmg) {
    if (S.phase !== 'chains' && S.phase !== 'final') return;
    dmg = dmg || 100;
    S.dragonHP = Math.max(0, S.dragonHP - dmg);
    S.contrib.dragonDmg += dmg;
    S.dragonFlash = 180;
    addLog('⚔ Dragon struck! HP ' + S.dragonHP + '/' + S.dragonMaxHP, '#ff4400');
    _refreshPanel();
    if (S.dragonHP <= 0) endSiege('victory');
  }

  // ── Campfire Cache Search ─────────────────────────────────────────────────
  function searchCampfireCache(player) {
    if (!S.active || S.phase !== 'forest') return null;
    for (var i = 0; i < S.campfires.length; i++) {
      var cf = S.campfires[i];
      if (cf.cacheSearched) continue;
      var dx = player.col - cf.col, dy = player.row - cf.row;
      if (Math.sqrt(dx * dx + dy * dy) < CFG.CAMPFIRE_RADIUS + 0.5) {
        cf.cacheSearched = true;
        // Random supply drop
        var rolls = [
          { label: 'RATION (+25 HP)', hp: 25 },
          { label: 'DARK POTION (+40 HP)', hp: 40 },
          { label: 'SIEGE SUPPLIES (100 Sparks)', sparks: 100 },
          { label: 'BLESSED STONE (50 Sparks)', sparks: 50 },
          { label: 'RATION (+15 HP)', hp: 15 },
        ];
        var drop = rolls[Math.floor(Math.random() * rolls.length)];
        if (drop.hp && window.playerHP !== undefined) {
          window.playerHP = Math.min(window.playerHP + drop.hp, window.playerMaxHP || 100);
          if (typeof updateHP === 'function') updateHP();
        }
        if (drop.sparks && window.wallet && typeof window.wallet.add === 'function') {
          window.wallet.add(drop.sparks);
          if (typeof updateWallet === 'function') updateWallet();
        }
        addLog('📦 Cache found: ' + drop.label, '#ffcc44');
        if (typeof toast === 'function') toast('📦 Supply Cache: ' + drop.label + '!');
        return drop;
      }
    }
    return null;
  }

  function nearCampfire(player) {
    if (!player || !S.campfires) return null;
    for (var i = 0; i < S.campfires.length; i++) {
      var cf = S.campfires[i];
      var dx = player.col - cf.col, dy = player.row - cf.row;
      if (Math.sqrt(dx * dx + dy * dy) < CFG.CAMPFIRE_RADIUS + 1) {
        return { campfireIndex: i, cacheSearched: cf.cacheSearched };
      }
    }
    return null;
  }

  // ── CAMP SYSTEM — the pack comes at night ──────────────────────────────────
  //  You camp at a campfire. Wolves + knights surround the fire. The bigger
  //  fire, the MORE of the pack it scorches away. Fire out → swarm.
  const PK_STATS = {
    wolf:      { hp: 26,  speed: 2.4, dmg: 6,  r: 0.9 },
    direwolf:  { hp: 90,  speed: 2.6, dmg: 16, r: 1.1 },
    bonehound: { hp: 34,  speed: 2.8, dmg: 9,  r: 0.9 },
    cultist:   { hp: 46,  speed: 2.0, dmg: 13, r: 1.0 },
  };
  const CAMP_NAMES = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

  function _hasCampfireNear(player) {
    return nearCampfire(player) !== null;
  }

  function campToggle() {
    if (S.camp.on) { campBreak('🔥 Camp broken. Keep your fire lit, wanderer.'); return; }
    if (S.phase !== 'forest') { try { toast('Only during the forest march'); } catch (_) {} return; }
    const player = S.lastPlayer || window.player;
    if (!_hasCampfireNear(player)) { try { toast('Find a campfire clearing to make camp.'); } catch (_) {} return; }
    const idx = nearCampfire(player).campfireIndex;
    S.camp.on = 1;
    S.camp.at = idx;
    S.camp.level = 1;
    S.camp.fuel = CFG.CAMP.BASE_FUEL;
    S.camp.fireOut = false;
    S.camp.packTimer = 9000;
    S.camp.repelTimer = 0;
    addLog('🏕 Camp made at the ' + CAMP_NAMES[idx] + ' clearing — fire lit. Feed it wood!', '#ffaa22');
    try { toast('🏕 Camp made — feed the fire! (F = break camp · add wood in the camp panel)'); } catch (_) {}
    campBuild();
    _campRefresh();
  }

  function campAddWood() {
    if (!S.camp.on) return;
    const wk = window.wallet;
    const baseNeed = CFG.CAMP.WOOD_PER_LEVEL;
    const need = S.camp.level >= CFG.CAMP.MAX_LEVEL
      ? baseNeed * CFG.CAMP.MAX_LEVEL      // max fire: just refuel
      : baseNeed * (S.camp.level || 1);    // growing fire: fuel + grows
    if (!wk || typeof wk.takeWood !== 'function') { try { toast('Camp needs the wallet — world not ready.'); } catch (_) {} return; }
    if (wk.wood() < need) { try { toast('Need ' + need + ' wood to feed the fire.'); } catch (_) {} return; }
    wk.takeWood(need);
    if (S.camp.level < CFG.CAMP.MAX_LEVEL) {
      S.camp.level = Math.min(CFG.CAMP.MAX_LEVEL, (S.camp.level || 1) + 1);
    }
    S.camp.fuel += CFG.CAMP.FUEL_PER_WOOD;
    if (S.camp.fireOut) S.camp.fireOut = false;
    addLog('🔥 Fire now Lv ' + S.camp.level + ' — +' + CFG.CAMP.FUEL_PER_WOOD + 's burn. Bigger flames fight off MORE wolves.', '#ffaa22');
    try { toast('🔥 Fire Lv ' + S.camp.level + ' — the pack smells ash, not fear.'); } catch (_) {}
    _campRefresh();
  }

  function campRekindle() {
    if (!S.camp.on || !S.camp.fireOut) return;
    S.camp.fireOut = false;
    S.camp.level = Math.max(1, S.camp.level || 1);
    S.camp.fuel = CFG.CAMP.BASE_FUEL;
    addLog('🔥 Fire rekindled! The pack howls with rage.', '#ffaa22');
    try { toast('🔥 Rekindled! Stay close to the flames.'); } catch (_) {}
    _campRefresh();
  }

  function campBreak(msg) {
    S.camp.on = 0;
    S.camp.at = -1;
    S.camp.level = 0;
    S.camp.fuel = 0;
    S.camp.packTimer = 0;
    S.camp.repelTimer = 0;
    S.camp.fireOut = false;
    if (msg) addLog(msg, '#ff6622');
    _campRefresh();
    _updateHud();
  }

  // panel (lazy-built once)
  function campBuild() {
    let el = document.getElementById('darkCampPanel');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'darkCampPanel';
    el.className = 'panel';
    el.style.cssText = 'position:fixed;left:50%;top:92px;transform:translateX(-50%);z-index:24;width:360px;max-width:92vw;padding:14px 16px;background:rgba(20,8,2,0.88);backdrop-filter:blur(10px);border:1px solid rgba(255,120,20,0.35);border-radius:12px;display:none;box-shadow:0 8px 40px rgba(0,0,0,0.6)';
    document.body.appendChild(el);
    return el;
  }

  function _campRefresh() {
    const el = document.getElementById('darkCampPanel');
    if (!el) return;
    if (!S.camp.on) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const lvl = S.camp.level || 1;
    const out = S.camp.fireOut;
    const pct = Math.max(0, Math.min(100, Math.round((S.camp.fuel / (CFG.CAMP.BASE_FUEL + CFG.CAMP.FUEL_PER_WOOD * 3)) * 100)));
    let flames = '';
    for (let i = 1; i <= 4; i++) flames += i <= lvl ? '🔥' : '·';
    let h = '<div style="display:flex;justify-content:space-between;align-items:center">';
    h += '<div style="font-family:\'Orbitron\',monospace;font-size:13px;color:#ff9933">🏕 CAMP · ' + CAMP_NAMES[S.camp.at].toUpperCase() + ' CLEARING</div>';
    h += '<button onclick="DarkRealm.campBreak()" style="font-family:\'Share Tech Mono\',monospace;font-size:9px;padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#ffaa66;cursor:pointer">✕ BREAK</button>';
    h += '</div>';
    h += '<div style="margin-top:10px;font-family:\'Share Tech Mono\',monospace;font-size:11px;color:' + (out ? '#ff4040' : '#ffcc88') + '">' + (out ? '💀 FIRE OUT — REKINDLE NOW!' : flames + ' FIRE Lv ' + lvl + '/4') + '</div>';
    h += '<div style="margin-top:6px;height:8px;background:rgba(255,120,20,0.15);border-radius:5px"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#ff6622,#ffcc44);border-radius:5px"></div></div>';
    h += '<div style="font-size:9px;font-family:\'Share Tech Mono\',monospace;color:rgba(255,170,80,0.6);margin-top:4px">Fuel ' + Math.floor(S.camp.fuel) + 's · Wolf pack circling every 16s · Fire scorches the pack</div>';
    h += '<div style="display:flex;gap:8px;margin-top:10px">';
    if (out) {
      h += '<button onclick="DarkRealm.campRekindle()" style="flex:1;font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:8px;border-radius:8px;border:1px solid rgba(255,60,60,0.5);background:rgba(255,30,30,0.12);color:#ff6060;cursor:pointer">🔥 REKINDLE</button>';
    }
    h += '<button onclick="DarkRealm.campAddWood()" style="flex:1;font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:8px;border-radius:8px;border:1px solid rgba(255,150,40,0.4);background:rgba(255,120,20,0.1);color:#ffaa44;cursor:pointer">🪵 FEED WOOD (+' + CFG.CAMP.FUEL_PER_WOOD + 's' + (lvl < CFG.CAMP.MAX_LEVEL ? ', +1 Lv' : '') + ')</button>';
    h += '<button onclick="DarkRealm.campBreak()" style="flex:1;font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#dde;cursor:pointer">🏕 CAMP (F)</button>';
    h += '</div>';
    h += '<div style="margin-top:8px;font-size:8px;font-family:\'Share Tech Mono\',monospace;color:rgba(255,180,90,0.45)">Bigger fires burn more of the pack · Move away to break camp · Slain pack drops 💵 gold</div>';
    el.innerHTML = h;
  }

  // hearts tick while fire burns; fuel drains; packs stalk in; fire scorches
  function _updateCamp(dt, player, enemies) {
    const cf = S.campfires[S.camp.at];
    if (!cf || !player) { campBreak('🏕 Camp lost.'); return; }
    const dx = player.col - cf.col, dy = player.row - cf.row;
    if (Math.sqrt(dx * dx + dy * dy) > CFG.CAMPFIRE_RADIUS + 3) {
      campBreak('⚠ You wandered off — the fire is left behind.');
      return;
    }
    const burning = S.camp.fuel > 0 && !S.camp.fireOut;

    if (burning && window.playerHP !== undefined) {
      window.playerHP = Math.min(window.playerMaxHP || 100, window.playerHP + CFG.CAMP.REGEN_HP * dt / 1000);
    }
    if (S.camp.fuel > 0) {
      S.camp.fuel = Math.max(0, S.camp.fuel - dt / 1000);
      if (S.camp.fuel <= 0) {
        S.camp.fireOut = true;
        addLog('💀 THE FIRE IS OUT — the pack closes in! Rekindle NOW!', '#ff0000');
        if (typeof toast === 'function') toast('💀 FIRE OUT! Rekindle before the wolves overwhelm you!');
        _spawnPack(cf, enemies, true);
      }
    }
    S.camp.packTimer += dt;
    if (S.camp.packTimer >= CFG.CAMP.PACK_TIME) {
      S.camp.packTimer = 0;
      _spawnPack(cf, enemies, false);
    }
    S.camp.repelTimer += dt;
    if (S.camp.repelTimer >= CFG.CAMP.REPEL_TIME) {
      S.camp.repelTimer = 0;
      if (burning) _campRepel(cf);
    }
    _campRefresh();
  }

  function _spawnPack(cf, enemies, ambush) {
    if (!enemies || !window.walkable) return;
    const night = (typeof window.tod !== 'undefined')
      ? ((Math.cos(window.tod * 6.283185) + 1) / 2) > 0.5
      : true;
    const lvl = S.camp.level || 1;
    let size = ambush ? (5 + lvl * 2) : (2 + Math.floor(lvl * 0.7) + (night ? 1 : 0));
    size = Math.min(10, size);
    const knightFlavor = S.forestZone >= 4;   // deep forest: bonehounds + cultists (the knight ranks)
    const pool = knightFlavor ? ['direwolf', 'bonehound', 'cultist'] : ['wolf', 'wolf', 'direwolf'];
    const scale = 1 + (S.forestZone - 1) * 0.1;
    const seed = Date.now();
    let placed = 0;
    for (let i = 0; i < size; i++) {
      const ang = (i / size) * 6.283 + Math.random() * 0.7;
      const rad = 4.6 + Math.random() * 2.0;
      const c = Math.round(cf.col + Math.cos(ang) * rad);
      const r = Math.round(cf.row + Math.sin(ang) * rad);
      if (window.walkable && !window.walkable(c, r)) continue;
      const kind = pool[(Math.random() * pool.length) | 0];
      const st = PK_STATS[kind] || PK_STATS.wolf;
      enemies.push({
        id: 'pack' + seed + '_' + i,
        kind: kind,
        col: c + 0.5, row: r + 0.5,
        tc: c, tr: r,
        hp: st.hp * scale, maxhp: st.hp * scale,
        speed: st.speed, dmg: st.dmg, r: st.r,
        atkCd: Math.random(),
        dead: false, hitFlash: 0,
        aggro: 12, bob: Math.random() * 6.28,
        campPack: true
      });
      placed++;
    }
    if (placed) {
      S.camp.packCount += placed;
      addLog((ambush ? '💀 AMBUSH! ' : '🐺 ') + placed + (knightFlavor ? ' knights+lupines ' : ' wolves ') + 'circle the camp.', ambush ? '#ff4040' : '#ff8844');
    }
  }

  function _campRepel(cf) {
    if (!window.enemies || !window.enemies.length) return;
    const lvl = S.camp.level || 1;
    const maxKill = lvl * CFG.CAMP.REPEL_PER_LEVEL;
    const rad = CFG.CAMP.RADIUS + (lvl - 1) * CFG.CAMP.RADIUS_PER_LEVEL;
    let burst = 0;
    window.enemies.forEach(function (e) {
      if (e.dead || !e.campPack) return;
      if (burst >= maxKill) return;
      const d = Math.hypot(e.col - cf.col, e.row - cf.row);
      if (d < rad) { e.dead = true; e.hitFlash = 1; burst++; }
    });
    if (burst) {
      addLog('🔥 The fire scorches ' + burst + ' of the pack away!', '#ff8800');
      if (typeof toast === 'function') toast('🔥 ' + burst + ' wolves burned by your fire!');
    }
  }

  // ── Gate Guardian Spawn ─────────────────────────────────────────────────────
  function _spawnGateGuardian() {
    if (!window.enemies || !window.Combat) return;
    const GW = window.GW || 52, GH = window.GH || 52;
    window.enemies.push({
      id: '_gguard_' + Date.now(),
      kind: 'gate_guardian',
      col: Math.round(GW * 0.5) + (Math.random() * 6 - 3),
      row: Math.round(GH * 0.35) + (Math.random() * 4 - 2),
      tc: GW / 2, tr: GH / 2,
      hp: 160, maxhp: 160, speed: 1.4, dmg: 28, r: 1.2, atkCd: 1.5,
      dead: false, hitFlash: 0, aggro: 10, bob: Math.random() * 6.28
    });
    addLog('☠ Gate Guardian summoned!', '#cc0000');
  }

  // ── Enemy Kill Hook ─────────────────────────────────────────────────────────
  function onEnemyKill(enemy) {
    if (!enemy) return;
    // Castle ward kills count even outside the forest phase
    if (enemy.towerKnight || enemy.basementMob) _onCastleKill(enemy);
    if (!S.active || S.phase !== 'forest') return;
    S.killCount++;
    S.contrib.kills++;
    const zone = S.forestZone;
    S.poolSparks += 10 * zone; // contribution to prize pool
    if (enemy && enemy.campPack) {
      const gold = 3 * zone;
      if (window.wallet && typeof window.wallet.add === 'function') {
        window.wallet.add(gold);
        if (typeof addFloat === 'function') { try { addFloat(enemy.col, enemy.row, '💵+' + gold, '#ffe9a8'); } catch (_) {} }
      }
    }
    if (S.killCount % 10 === 0) {
      addLog('◈ ' + S.killCount + ' enemies slain — Zone ' + zone, '#44cc88');
    }
    _updateHud();
  }

  // ── Rewards Distribution ───────────────────────────────────────────────────
  function _distributeRewards(outcome) {
    const totalScore = S.contrib.kills * 10
      + S.contrib.gateDmg * 0.05
      + S.contrib.dragonDmg * 0.02
      + S.contrib.chainBreaks * 100;
    const cosmetics = [];
    let conquerGold = 0, conquerSparks = 0;
    if (outcome === 'victory') {
      // First-conqueror bounty decays: the first siege of the keep is a legend,
      // repeat runs settle into useful gear (wallet/sparks granted below).
      let priorClears = 0;
      try { priorClears = JSON.parse(localStorage.getItem('shaddai.drRewards') || '[]').length; } catch (_) {}
      if (priorClears === 0) {
        conquerGold = 150; conquerSparks = 50;
        cosmetics.push({ id: 'dragon_scale', name: 'Dragon Scale Armor', rarity: 'legendary' });
        cosmetics.push({ id: 'first_conqueror', name: 'First Conqueror of the Keep', rarity: 'epic' });
      } else if (priorClears <= 2) {
        conquerGold = 75;
        cosmetics.push({ id: 'chain_breaker', name: 'Chain Breaker Badge', rarity: 'epic' });
        if (S.contrib.gateDmg > 500) cosmetics.push({ id: 'gate_cracker', name: 'Gate Cracker Badge', rarity: 'rare' });
      } else if (priorClears <= 5) {
        conquerGold = 30;
        cosmetics.push({ id: 'keep_raider', name: 'Keep Raider Mark', rarity: 'rare' });
      } else {
        conquerGold = 15; conquerSparks = 15;
        cosmetics.push({ id: 'ashes_of_conquest', name: 'Ashes of Conquest', rarity: 'common' });
      }
    }
    if (S.contrib.kills >= 50) cosmetics.push({ id: 'shadow_slayer', name: 'Shadow Slayer Cape', rarity: 'rare' });

    if (conquerGold > 0 && window.wallet && typeof window.wallet.add === 'function') {
      try {
        window.wallet.add(conquerGold);
        addLog('💵 Conqueror bounty: +' + conquerGold + ' gold!', '#ffe9a8');
      } catch (_) {}
    }
    if (conquerSparks > 0 && window.__sparks && typeof window.__sparks.add === 'function') {
      try {
        window.__sparks.add('siege', conquerSparks, 'Conqueror bounty');
        addLog('⚡ Conqueror bounty: +' + conquerSparks + ' Sparks!', '#ffcc00');
      } catch (_) {}
    }

    // Save rewards locally
    try {
      const existing = JSON.parse(localStorage.getItem('shaddai.drRewards') || '[]');
      cosmetics.forEach(function (c) { existing.push(Object.assign(c, { earned: Date.now() })); });
      localStorage.setItem('shaddai.drRewards', JSON.stringify(existing.slice(-30)));
    } catch (_) {}
    // Send Sparks reward to backend economy
    try {
      fetch('/api/siege/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kills: S.contrib.kills,
          chainBreaks: S.contrib.chainBreaks,
          gateDmg: S.contrib.gateDmg,
          dragonDmg: S.contrib.dragonDmg,
          poolSparks: S.poolSparks,
          outcome: outcome
        })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.awarded) addLog('⚡ +' + d.awarded + ' Sparks awarded to account!', '#ffcc00');
      }).catch(function () {});
    } catch (_) {}

    addLog('◈ Score: ' + totalScore.toFixed(0) + ' pts', '#e8c45c');
    cosmetics.forEach(function (c) { addLog('🏆 Earned: ' + c.name + ' [' + c.rarity.toUpperCase() + ']', '#ffcc00'); });
  }

  // ── Dragon 2D Canvas Silhouette ────────────────────────────────────────────
  function _drawDragon(ctx, cam, TW, TH, W, H) {
    // Dragon hovers above the castle center
    var dcol = 28, drow = 9;
    var sx = (dcol - drow) * TW / 2 - (cam.col - cam.row) * TW / 2 + W / 2;
    var sy = (dcol + drow) * TH / 2 - (cam.col + cam.row) * TH / 2 + H / 2 - 80;
    if (sx < -250 || sx > W + 250 || sy < -250 || sy > H + 250) return;

    var t = Date.now();
    var hover = Math.sin(t / 620) * 9;
    var cy = sy + hover;
    var flash = S.dragonFlash > 0;
    var rage = (S.dragonPhase === 'raging');
    var wingFlap = Math.sin(t / 380) * 20;

    ctx.save();

    // Ground glow aura
    var grd = ctx.createRadialGradient(sx, sy + 20, 10, sx, sy + 20, 130);
    grd.addColorStop(0, rage ? 'rgba(255,40,0,0.4)' : 'rgba(110,0,220,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(sx, sy + 20, 130, 50, 0, 0, Math.PI * 2); ctx.fill();

    // Cast shadow on ground
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx, sy + 40, 75, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    var bCol = flash ? '#fff' : (rage ? '#2e0000' : '#0b0518');
    var wCol = flash ? '#fff' : (rage ? '#4a0000' : '#140622');
    var acCol = flash ? '#fff' : (rage ? '#ff4400' : '#7700cc');

    // ── LEFT WING ────────────────────────────────────────────────────────────
    ctx.fillStyle = wCol;
    ctx.beginPath();
    ctx.moveTo(sx - 10, cy - 22);
    ctx.quadraticCurveTo(sx - 95, cy - 65 + wingFlap, sx - 148, cy - 18 + wingFlap);
    ctx.quadraticCurveTo(sx - 98, cy + 24, sx - 32, cy + 10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = flash ? '#fff' : 'rgba(180,0,60,0.35)';
    ctx.lineWidth = 1.5;
    for (var wi = 0; wi < 3; wi++) {
      ctx.beginPath();
      ctx.moveTo(sx - 12 - wi * 7, cy - 18 - wi * 3);
      ctx.quadraticCurveTo(sx - 78 - wi * 18, cy - 46 + wingFlap + wi * 5, sx - 132 - wi * 8, cy - 6 + wingFlap);
      ctx.stroke();
    }

    // ── RIGHT WING ───────────────────────────────────────────────────────────
    ctx.fillStyle = wCol;
    ctx.beginPath();
    ctx.moveTo(sx + 10, cy - 22);
    ctx.quadraticCurveTo(sx + 95, cy - 65 + wingFlap, sx + 148, cy - 18 + wingFlap);
    ctx.quadraticCurveTo(sx + 98, cy + 24, sx + 32, cy + 10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = flash ? '#fff' : 'rgba(180,0,60,0.35)';
    for (var wi2 = 0; wi2 < 3; wi2++) {
      ctx.beginPath();
      ctx.moveTo(sx + 12 + wi2 * 7, cy - 18 - wi2 * 3);
      ctx.quadraticCurveTo(sx + 78 + wi2 * 18, cy - 46 + wingFlap + wi2 * 5, sx + 132 + wi2 * 8, cy - 6 + wingFlap);
      ctx.stroke();
    }

    // ── BODY ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = bCol;
    ctx.beginPath(); ctx.ellipse(sx, cy, 46, 28, 0, 0, Math.PI * 2); ctx.fill();
    if (!flash) {
      ctx.fillStyle = rage ? '#420000' : '#1c0636';
      for (var si = -3; si <= 3; si++) {
        for (var sj = -1; sj <= 1; sj++) {
          ctx.beginPath(); ctx.arc(sx + si * 12, cy + sj * 10, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // Dorsal spines
    ctx.fillStyle = acCol;
    for (var ri = -3; ri <= 3; ri++) {
      ctx.beginPath();
      ctx.moveTo(sx + ri * 13, cy - 26);
      ctx.lineTo(sx + ri * 13 - 5, cy - 44);
      ctx.lineTo(sx + ri * 13 + 5, cy - 44);
      ctx.closePath(); ctx.fill();
    }

    // ── TAIL ─────────────────────────────────────────────────────────────────
    ctx.strokeStyle = bCol; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - 32, cy + 2);
    ctx.quadraticCurveTo(sx - 82, cy + 35, sx - 104, cy + 8);
    ctx.quadraticCurveTo(sx - 126, cy - 14, sx - 116, cy - 36);
    ctx.stroke();
    ctx.fillStyle = acCol;
    ctx.beginPath();
    ctx.moveTo(sx - 114, cy - 34); ctx.lineTo(sx - 132, cy - 56); ctx.lineTo(sx - 118, cy - 36);
    ctx.closePath(); ctx.fill();

    // ── HEAD ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = bCol;
    ctx.beginPath(); ctx.ellipse(sx + 42, cy - 16, 23, 16, -0.3, 0, Math.PI * 2); ctx.fill();
    // Horns
    ctx.fillStyle = flash ? '#fff' : '#260048';
    ctx.beginPath(); ctx.moveTo(sx + 36, cy - 28); ctx.lineTo(sx + 31, cy - 54); ctx.lineTo(sx + 41, cy - 30); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx + 52, cy - 26); ctx.lineTo(sx + 60, cy - 50); ctx.lineTo(sx + 56, cy - 28); ctx.closePath(); ctx.fill();
    // Jaw
    ctx.fillStyle = bCol;
    ctx.beginPath(); ctx.ellipse(sx + 57, cy - 8, 13, 7, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ece8c0';
    for (var ti = 0; ti < 4; ti++) {
      ctx.beginPath();
      ctx.moveTo(sx + 46 + ti * 5, cy - 4); ctx.lineTo(sx + 44 + ti * 5, cy + 4); ctx.lineTo(sx + 48 + ti * 5, cy - 4);
      ctx.closePath(); ctx.fill();
    }
    // Glowing eyes
    var eyePulse = 0.7 + 0.3 * Math.sin(t / 220);
    ctx.globalAlpha = eyePulse * 0.6;
    ctx.fillStyle = rage ? '#ff8800' : '#cc00ff';
    ctx.beginPath(); ctx.arc(sx + 39, cy - 19, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 54, cy - 19, 11, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff1100';
    ctx.beginPath(); ctx.arc(sx + 39, cy - 19, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 54, cy - 19, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcc44';
    ctx.beginPath(); ctx.arc(sx + 40, cy - 20, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 55, cy - 20, 2, 0, Math.PI * 2); ctx.fill();

    // ── CHAINS (chains phase only) ────────────────────────────────────────────
    if (S.phase === 'chains' && S.chains) {
      var CFG_CHAINS = S.chains.length;
      S.chains.forEach(function (c, i) {
        if (c.broken) return;
        var angle = (i / CFG_CHAINS) * Math.PI * 2 - 0.4;
        var ax = sx + Math.cos(angle) * 56;
        var ay = cy + Math.sin(angle) * 30;
        var ex = sx + Math.cos(angle) * 170;
        var ey = cy + Math.sin(angle) * 100 + 50;
        var pct = c.hp / c.maxHp;
        ctx.strokeStyle = 'rgba(' + Math.round(100 + 120 * pct) + ',0,' + Math.round(220 - 180 * pct) + ',0.75)';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 4]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(160,0,255,0.5)';
        ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill();
      });
    }

    // ── FIRE BREATH BUILD-UP ──────────────────────────────────────────────────
    var breathMax = (S.dragonPhase === 'raging') ? 3200 : 5000;
    if (S.dragonBreath > breathMax * 0.65) {
      var breathPct = (S.dragonBreath - breathMax * 0.65) / (breathMax * 0.35);
      for (var pi = 0; pi < 10; pi++) {
        var pa = (Math.random() - 0.1) * 0.7;
        var pd = (Math.random() * 65 + 18) * breathPct;
        var px = sx + 72 + Math.cos(pa) * pd;
        var py = cy - 9 + Math.sin(pa) * pd * 0.5;
        ctx.globalAlpha = 0.55 * (1 - pi / 10) * breathPct;
        ctx.fillStyle = (pi % 2 === 0) ? '#ff5500' : '#ff2200';
        ctx.beginPath(); ctx.arc(px, py, (9 - pi * 0.7) * breathPct, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ── Canvas Render ──────────────────────────────────────────────────────────
  function render(ctx, cam, TW, TH) {
    if (!S.active && S.phase !== 'victory' && S.phase !== 'defeat') return;
    if (window.regionSel !== 'darkforest') return;
    ctx.save();
    const W = ctx.canvas.width / (window.DPR || 1);
    const H = ctx.canvas.height / (window.DPR || 1);

    // ── Dark vignette overlay (always in dark realm) ───────────────────────
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.82);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(8,0,20,0.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // ── Basement vault chest marker ─────────────────────────────────────────
    if (!S.chestLooted && (S.phase === 'chains' || S.phase === 'final' || S.phase === 'victory') && cam) {
      const cdx = 31, cdr = 11;
      const sx = (cdx - cdr) * TW / 2 - (cam.col - cam.row) * TW / 2 + W / 2;
      const sy = (cdx + cdr) * TH / 2 - (cam.col + cam.row) * TH / 2 + H / 2;
      if (sx > -80 && sx < W + 80 && sy > -80 && sy < H + 80) {
        const pulse = 0.3 + 0.18 * Math.sin(Date.now() / 300);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#e8c45c';
        ctx.beginPath(); ctx.ellipse(sx, sy + 6, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 0.55 + 0.45 * pulse;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🔒', sx, sy - 8);
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = 'rgba(232,196,92,0.9)';
        ctx.fillText('BASEMENT VAULT', sx, sy + 2);
        ctx.globalAlpha = 1;
      }
    }

    // ── Dragon battle atmosphere — red pulse on wing buff hit ─────────────
    if ((S.phase === 'chains' || S.phase === 'final') && S.dragonFlash > 0) {
      const flashAlpha = Math.min(0.35, (S.dragonFlash / 200) * 0.35);
      const fvig = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.8);
      fvig.addColorStop(0, 'rgba(0,0,0,0)');
      fvig.addColorStop(1, 'rgba(200,0,0,' + flashAlpha + ')');
      ctx.fillStyle = fvig;
      ctx.fillRect(0, 0, W, H);
    }
    // Purple pulse on chain break
    if (S.phase === 'chains') {
      const breakPulse = 0.05 + 0.06 * Math.sin(Date.now() / 700);
      const pvig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
      pvig.addColorStop(0, 'rgba(0,0,0,0)');
      pvig.addColorStop(1, 'rgba(80,0,160,' + breakPulse + ')');
      ctx.fillStyle = pvig;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Campfire beacons (a lit camp grows the fire the player stands by) ────
    S.campfires.forEach(function (cf, i) {
      const sx = (cf.col - cf.row) * TW / 2 - (cam.col - cam.row) * TW / 2 + W / 2;
      const sy = (cf.col + cf.row) * TH / 2 - (cam.col + cam.row) * TH / 2 + H / 2;
      const lvl = (S.camp.on && S.camp.at === i) ? S.camp.level : 0;
      const out = (S.camp.on && S.camp.at === i) && S.camp.fireOut;
      const grow = lvl > 0 ? (1 + lvl * 0.55) : 1;
      const rad = 34 * grow;
      const r = out ? 80 : 255, g = out ? 60 : 136, b = out ? 40 : 0;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (out ? 0.35 : 0.25 + 0.1 * Math.sin(Date.now() / 400));
      const grd = ctx.createRadialGradient(sx, sy, 4, sx, sy, rad);
      grd.addColorStop(0, 'rgb(' + r + ',' + g + ',' + b + ')');
      grd.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, 6.28); ctx.fill();
      ctx.restore();
      ctx.fillStyle = out ? '#556677' : '#ffaa22';
      ctx.font = 'bold ' + Math.round(16 * Math.min(2, grow)) + 'px Share Tech Mono';
      ctx.textAlign = 'center'; ctx.fillText(out ? '💨' : '🔥', sx, sy - 4);
      ctx.fillStyle = lvl > 0 ? 'rgba(255,220,120,0.85)' : (out ? 'rgba(120,140,160,0.6)' : 'rgba(255,200,80,0.7)');
      ctx.font = '8px Share Tech Mono';
      ctx.fillText(lvl > 0 ? ('FIRE Lv ' + lvl) : (out ? 'FIRE OUT — REKINDLE' : 'CAMPFIRE'), sx, sy + 12);
    });

    // ── Red eyes: wolves/knight pack stalking the camp ──────────────────────
    if (window.enemies && S.camp.on && !S.camp.fireOut) {
      window.enemies.forEach(function (e) {
        if (!e || e.dead || !e.campPack) return;
        const ex = (e.col - e.row) * TW / 2 - (cam.col - cam.row) * TW / 2 + W / 2;
        const ey = (e.col + e.row) * TH / 2 - (cam.col + cam.row) * TH / 2 + H / 2;
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 130 + e.bob * 7);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse * 0.9;
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.arc(ex - 3, ey - 6, 1.6, 0, 6.28); ctx.arc(ex + 3, ey - 6, 1.6, 0, 6.28);
        ctx.fill();
        ctx.restore();
      });
    }

    // ── DRAGON VISUAL (chains + final phases) ─────────────────────────────────
    if (S.phase === 'chains' || S.phase === 'final') {
      _drawDragon(ctx, cam, TW, TH, W, H);
    }

    // ── Gate HP bar (gate/chains/final phases) ─────────────────────────────
    if (S.phase === 'gate' || S.phase === 'chains' || S.phase === 'final') {
      const barW = 260, barH = 16, bx = W / 2 - barW / 2, by = 16;
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.beginPath(); ctx.roundRect(bx - 4, by - 4, barW + 8, barH + 26, 6); ctx.fill();
      if (S.phase === 'gate') {
        const pct = S.gateHP / S.gateMaxHP;
        _drawBar(ctx, bx, by + 16, barW, barH - 4, pct, '#884400', '#ff6600', 'CASTLE GATE HP · ' + S.gateHP + '/' + S.gateMaxHP, by + 12);
      } else {
        const pct = S.dragonHP / S.dragonMaxHP;
        _drawBar(ctx, bx, by + 16, barW, barH - 4, pct, '#440000', '#ff0000', '☠ DRAGON HP · ' + S.dragonHP + '/' + S.dragonMaxHP, by + 12);
        // Chain indicators
        S.chains.forEach(function (c, i) {
          const cx2 = bx + (i / CFG.CHAINS) * barW;
          ctx.fillStyle = c.broken ? '#224422' : '#440044';
          ctx.fillRect(cx2 + 2, by + 36, barW / CFG.CHAINS - 4, 10);
          const cp = c.hp / c.maxHp;
          ctx.fillStyle = c.broken ? '#004400' : '#cc00ff';
          ctx.fillRect(cx2 + 2, by + 36, (barW / CFG.CHAINS - 4) * cp, 10);
          ctx.fillStyle = c.broken ? '#336633' : '#ff66ff';
          ctx.font = '7px Share Tech Mono'; ctx.textAlign = 'center';
          ctx.fillText(c.broken ? 'BROKEN' : ('C' + (i + 1)), cx2 + barW / CFG.CHAINS / 2, by + 44);
        });
      }
    }

    // ── Moat blocked phase bar ────────────────────────────────────────────
    if (S.phase === 'moat') {
      const barW = 260, barH = 16, bx = W / 2 - barW / 2, by = 16;
      ctx.fillStyle = 'rgba(0,10,50,0.88)';
      ctx.beginPath(); ctx.roundRect(bx - 4, by - 4, barW + 8, barH + 26, 6); ctx.fill();
      const pct = S.moatLevel / 100;
      _drawBar(ctx, bx, by + 16, barW, barH - 4, pct, '#001040', '#1a55ee',
        '💧 CASTLE MOAT · ' + Math.round(S.moatLevel) + '% FULL', by + 12);
      ctx.fillStyle = 'rgba(80,140,255,0.6)'; ctx.font = '8px Share Tech Mono'; ctx.textAlign = 'center';
      ctx.fillText('VISIT SUN SHRINE IN SHADDAI CITY TO DRY THE MOAT', W / 2, by + 40);
    }

    // ── Forest zone / kill counter ─────────────────────────────────────────
    if (S.phase === 'forest') {
      const zoneGoal = CFG.FOREST_ZONE_KILLS * S.forestZone;
      const pct = Math.min(1, S.killCount / (CFG.FOREST_ZONE_KILLS * CFG.FOREST_ZONES));
      const barW = 220, bx = W / 2 - barW / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.beginPath(); ctx.roundRect(bx - 4, 12, barW + 8, 30, 6); ctx.fill();
      _drawBar(ctx, bx, 28, barW, 8, pct, '#1a0a30', '#9900ff', '☠ ZONE ' + S.forestZone + ' · ' + S.killCount + ' SLAIN', 24);
    }

    // ── Downed overlay ─────────────────────────────────────────────────────
    if (S.downedAt) {
      ctx.fillStyle = 'rgba(60,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      const secsLeft = Math.ceil(S.downedAutoReviveTimer / 1000);
      ctx.fillStyle = '#ff4040'; ctx.font = 'bold 18px Orbitron, monospace'; ctx.textAlign = 'center';
      ctx.fillText('☠ DOWNED', W / 2, H / 2 - 20);
      ctx.fillStyle = 'rgba(255,180,180,0.8)'; ctx.font = '12px Share Tech Mono';
      ctx.fillText('Reach a campfire · auto-revive in ' + secsLeft + 's', W / 2, H / 2 + 4);
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  function _drawBar(ctx, x, y, w, h, pct, bgCol, fillCol, label, labelY) {
    ctx.fillStyle = bgCol; ctx.fillRect(x, y, w, h);
    const flash = S.dragonFlash > 0 ? 0.4 : 0;
    ctx.fillStyle = flash ? '#ffffff' : fillCol;
    ctx.globalAlpha = flash ? 0.6 + flash : 1;
    ctx.fillRect(x, y, w * pct, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 9px Share Tech Mono'; ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, labelY || y - 4);
  }

  // ── Panel UI ────────────────────────────────────────────────────────────────
  function openPanel() {
    let el = document.getElementById('darkRealmPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'darkRealmPanel';
      el.className = 'panel';
      el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:25;width:min(520px,96vw);max-height:86vh;overflow-y:auto;padding:22px 24px;background:rgba(8,0,20,0.97);border:1px solid rgba(153,0,255,0.35)';
      document.body.appendChild(el);
    }
    _refreshPanel();
    el.classList.remove('hide');
  }

  function _refreshPanel() {
    const el = document.getElementById('darkRealmPanel');
    if (!el || el.classList.contains('hide')) return;

    const timeToNext = Math.max(0, S.nextScheduled - Date.now());
    const hr = Math.floor(timeToNext / 3600000);
    const mn = Math.floor((timeToNext % 3600000) / 60000);

    let h = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">';
    h += '<div><div style="font-family:\'Orbitron\',monospace;font-size:17px;font-weight:900;color:#cc44ff">☠ DARK REALM SIEGE</div>';
    h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;color:rgba(153,0,255,0.5);letter-spacing:.1em;margin-top:2px">EVERY 2 HOURS · FOREST → GATE → DRAGON</div></div>';
    h += '<button onclick="document.getElementById(\'darkRealmPanel\').classList.add(\'hide\')" style="font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:7px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.5);cursor:pointer">CLOSE</button>';
    h += '</div>';

    if (!S.active) {
      h += '<div style="padding:14px;background:rgba(30,0,60,0.5);border:1px solid rgba(153,0,255,0.2);border-radius:10px;margin-bottom:14px">';
      h += '<div style="font-family:\'Orbitron\',monospace;font-size:13px;color:#cc44ff">NEXT SIEGE</div>';
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:22px;font-weight:700;color:#e8f0ff;margin:6px 0">' + hr + 'h ' + mn + 'm</div>';
      h += '<div style="font-size:9px;font-family:\'Share Tech Mono\',monospace;color:rgba(200,150,255,0.5)">Board the Terminal Train to enter when siege opens</div>';
      h += '<button onclick="DarkRealm.openSiege()" style="margin-top:10px;font-size:9px;font-family:\'Share Tech Mono\',monospace;padding:6px 14px;border-radius:6px;border:1px solid rgba(255,60,60,0.3);background:rgba(255,20,20,0.06);color:#ff6060;cursor:pointer">⚔ FORCE OPEN (DEV)</button>';
      h += '</div>';
    } else {
      const phaseMap = { forest:'🌲 CLEARING THE FOREST', moat:'💧 MOAT BLOCKS THE CASTLE', gate:'⚔ ASSAULT THE GATES', chains:'⛓ BREAK THE CHAINS', final:'☠ SLAY THE DRAGON', victory:'🏆 VICTORY!', defeat:'☠ DEFEAT' };
      h += '<div style="padding:12px 14px;background:rgba(100,0,200,0.12);border:1px solid rgba(153,0,255,0.4);border-radius:10px;margin-bottom:14px">';
      h += '<div style="font-family:\'Orbitron\',monospace;font-size:13px;color:#cc44ff">' + (phaseMap[S.phase] || S.phase.toUpperCase()) + '</div>';
      if (S.phase === 'forest') {
        const pct = Math.min(100, (S.killCount / (CFG.FOREST_ZONE_KILLS * CFG.FOREST_ZONES) * 100)).toFixed(0);
        h += '<div style="font-size:9px;font-family:\'Share Tech Mono\',monospace;color:rgba(200,150,255,0.7);margin-top:4px">Zone ' + S.forestZone + '/' + CFG.FOREST_ZONES + ' · ' + S.killCount + ' enemies slain · ' + pct + '% to gates</div>';
      }
      if (S.phase === 'moat') {
        h += '<div style="margin-top:8px"><div style="height:10px;background:rgba(0,0,80,.3);border-radius:5px"><div style="height:100%;width:' + Math.round(S.moatLevel) + '%;background:linear-gradient(90deg,#1a44cc,#2266ff);border-radius:5px"></div></div>';
        h += '<div style="font-size:9px;font-family:\'Share Tech Mono\',monospace;color:#4488ff;margin-top:4px">Moat: ' + Math.round(S.moatLevel) + '% full — must reach 0% to cross</div>';
        h += '<div style="margin-top:8px;padding:8px;background:rgba(0,20,80,.3);border:1px solid rgba(80,120,255,.25);border-radius:8px;font-size:9px;font-family:\'Share Tech Mono\',monospace;color:rgba(100,160,255,.7)">Contribute at the <b style="color:#88aaff">Sun Shrine</b> in SHADDAI City · 100 Sparks → −2% moat<br>Siege completions drain 5% · Monthly full reset</div>';
        h += '</div>';
      }
      if (S.phase === 'gate') {
        const pct = (S.gateHP / S.gateMaxHP * 100).toFixed(0);
        h += '<div style="margin-top:8px"><div style="height:10px;background:rgba(255,80,0,0.15);border-radius:5px"><div style="height:100%;width:' + pct + '%;background:#ff6600;border-radius:5px"></div></div>';
        h += '<div style="font-size:9px;font-family:\'Share Tech Mono\',monospace;color:#ff8800;margin-top:4px">Gate HP: ' + S.gateHP + '/' + S.gateMaxHP + '</div></div>';
        h += '<div style="display:flex;gap:8px;margin-top:10px">';
        h += '<button onclick="DarkRealm.attackGate(150)" style="flex:1;font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:8px;border-radius:8px;border:1px solid rgba(255,100,0,0.4);background:rgba(255,60,0,0.1);color:#ff8040;cursor:pointer">⚔ ATTACK GATE (-150 HP)</button>';
        h += '<button onclick="DarkRealm.attackGate(400)" style="flex:1;font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:8px;border-radius:8px;border:1px solid rgba(255,180,0,0.4);background:rgba(255,140,0,0.1);color:#ffaa00;cursor:pointer">💥 SIEGE RATION STRIKE (-400 HP)</button>';
        h += '</div>';
      }
      if (S.phase === 'chains' || S.phase === 'final') {
        const dp = (S.dragonHP / S.dragonMaxHP * 100).toFixed(0);
        h += '<div style="margin-top:8px"><div style="height:12px;background:rgba(180,0,0,0.2);border-radius:5px"><div style="height:100%;width:' + dp + '%;background:linear-gradient(90deg,#880000,#ff2200);border-radius:5px;transition:width .3s"></div></div>';
        h += '<div style="font-size:9px;font-family:\'Share Tech Mono\',monospace;color:#ff4400;margin-top:3px">Dragon HP: ' + S.dragonHP + '/' + S.dragonMaxHP + '</div></div>';
        if (S.phase === 'chains') {
          h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">';
          S.chains.forEach(function (c, i) {
            h += '<button onclick="DarkRealm.attackChain(' + i + ')" ' + (c.broken ? 'disabled' : '') + ' style="font-family:\'Share Tech Mono\',monospace;font-size:9px;padding:8px;border-radius:8px;border:1px solid rgba(' + (c.broken ? '80,200,80,0.3' : '200,0,255,0.4') + ');background:rgba(' + (c.broken ? '0,80,0,0.1' : '80,0,160,0.12') + ');color:' + (c.broken ? '#44aa44' : '#dd66ff') + ';cursor:' + (c.broken ? 'default' : 'pointer') + '">';
            h += (c.broken ? '✅ CHAIN ' + (i + 1) + ' BROKEN' : '⛓ CHAIN ' + (i + 1) + ' — HP ' + c.hp + ' — BREAK!');
            h += '</button>';
          });
          h += '</div>';
        }
        h += '<button onclick="DarkRealm.attackDragon(200)" style="width:100%;margin-top:8px;font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:10px;border-radius:8px;border:1px solid rgba(255,0,0,0.4);background:rgba(200,0,0,0.12);color:#ff4444;cursor:pointer">⚔ STRIKE THE DRAGON (-200 HP)</button>';
      }
      h += '</div>';
    }

    // Contribution
    h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:.12em;color:rgba(153,0,255,0.5);margin-bottom:8px">YOUR CONTRIBUTION</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px">';
    for (var [k, v, ico] of [['kills',S.contrib.kills,'☠'],['gateDmg',Math.round(S.contrib.gateDmg),'⚔'],['dragonDmg',Math.round(S.contrib.dragonDmg),'🔥'],['chainBreaks',S.contrib.chainBreaks,'⛓']]) {
      h += '<div style="padding:8px;background:rgba(30,0,60,0.4);border:1px solid rgba(153,0,255,0.15);border-radius:8px;text-align:center">';
      h += '<div style="font-size:14px">' + ico + '</div>';
      h += '<div style="font-family:\'Orbitron\',monospace;font-size:13px;color:#e8f0ff">' + v + '</div>';
      h += '<div style="font-size:7px;font-family:\'Share Tech Mono\',monospace;color:rgba(200,150,255,0.5)">' + k.toUpperCase() + '</div></div>';
    }
    h += '</div>';

    // Siege log
    if (S.log.length > 0) {
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:.12em;color:rgba(200,150,255,0.4);margin-bottom:6px">SIEGE LOG</div>';
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:10px;line-height:1.7;padding:10px;background:rgba(0,0,0,0.4);border-radius:8px;max-height:130px;overflow-y:auto">';
      S.log.slice(0, 10).forEach(function (e) { h += '<div style="color:' + e.color + '">' + e.msg + '</div>'; });
      h += '</div>';
    }

    // Hall of Champions — earned cosmetics from past sieges
    var drRewards = [];
    try { drRewards = JSON.parse(localStorage.getItem('shaddai.drRewards') || '[]'); } catch (_) {}
    if (drRewards.length > 0) {
      var rarityColor = { legendary: '#ffcc00', epic: '#cc44ff', rare: '#4488ff', uncommon: '#44bb44', common: '#aaaaaa' };
      h += '<div style="margin-top:14px">';
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:.12em;color:rgba(255,200,80,0.6);margin-bottom:8px">🏆 YOUR HALL OF CHAMPIONS</div>';
      h += '<div style="display:flex;flex-direction:column;gap:5px">';
      drRewards.slice(-6).reverse().forEach(function (r) {
        var col = rarityColor[r.rarity] || '#aaaaaa';
        var age = Date.now() - (r.earned || 0);
        var when = age < 60000 ? 'just now' : age < 3600000 ? Math.floor(age / 60000) + 'm ago' : age < 86400000 ? Math.floor(age / 3600000) + 'h ago' : Math.floor(age / 86400000) + 'd ago';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(' + (r.rarity === 'legendary' ? '60,40,0' : r.rarity === 'epic' ? '40,0,60' : '0,20,60') + ',0.5);border:1px solid ' + col + '28;border-radius:7px">';
        h += '<span style="font-family:\'Share Tech Mono\',monospace;font-size:10px;color:' + col + '">🏅 ' + r.name + '</span>';
        h += '<span style="font-family:\'Share Tech Mono\',monospace;font-size:8px;color:rgba(255,255,255,.3)">' + when + '</span>';
        h += '</div>';
      });
      h += '</div></div>';
    }

    el.innerHTML = h;
  }

  // ── Results Screen ─────────────────────────────────────────────────────────
  function _showResults(outcome) {
    const el = document.getElementById('darkRealmPanel');
    if (!el) return;
    el.classList.remove('hide');
    const score = S.contrib.kills * 10 + Math.round(S.contrib.gateDmg * 0.05) + Math.round(S.contrib.dragonDmg * 0.02) + S.contrib.chainBreaks * 100;
    let h = '<div style="text-align:center;padding:20px 0">';
    h += '<div style="font-family:\'Orbitron\',monospace;font-size:26px;font-weight:900;color:' + (outcome === 'victory' ? '#ffcc00' : '#ff3333') + ';margin-bottom:10px">' + (outcome === 'victory' ? '🏆 VICTORY' : '☠ DEFEATED') + '</div>';
    h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:14px;color:#e8f0ff;margin-bottom:18px">CONTRIBUTION SCORE: <b style="color:#cc44ff">' + score + '</b> pts</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">';
    for (var [label, val, icon] of [['KILLS',S.contrib.kills,'☠'],['GATE DMG',Math.round(S.contrib.gateDmg),'⚔'],['DRAGON DMG',Math.round(S.contrib.dragonDmg),'🔥'],['CHAINS',S.contrib.chainBreaks,'⛓']]) {
      h += '<div style="padding:10px;background:rgba(30,0,60,0.5);border-radius:8px"><div style="font-size:18px">' + icon + '</div>';
      h += '<div style="font-family:\'Orbitron\',monospace;font-size:14px;color:#fff">' + val + '</div>';
      h += '<div style="font-size:8px;font-family:\'Share Tech Mono\',monospace;color:rgba(200,150,255,.6)">' + label + '</div></div>';
    }
    h += '</div>';
    const rewards = JSON.parse(localStorage.getItem('shaddai.drRewards') || '[]');
    const latest = rewards.filter(function (r) { return Date.now() - r.earned < 120000; });
    if (latest.length) {
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;color:rgba(255,200,80,.7);margin-bottom:8px;letter-spacing:.1em">REWARDS EARNED</div>';
      h += '<div style="display:flex;flex-direction:column;gap:6px">';
      latest.forEach(function (r) { h += '<div style="padding:8px 12px;background:rgba(255,200,0,0.08);border:1px solid rgba(255,200,0,0.25);border-radius:8px;font-family:\'Share Tech Mono\',monospace;font-size:11px;color:#ffcc44">🏆 ' + r.name + ' <span style="color:rgba(255,200,80,.5)">[' + r.rarity.toUpperCase() + ']</span></div>'; });
      h += '</div>';
    }
    h += '<button onclick="document.getElementById(\'darkRealmPanel\').classList.add(\'hide\')" style="margin-top:20px;width:100%;font-family:\'Share Tech Mono\',monospace;font-size:11px;padding:12px;border-radius:8px;border:1px solid rgba(153,0,255,0.4);background:rgba(60,0,120,0.2);color:#cc44ff;cursor:pointer">CLOSE</button>';
    h += '</div>';
    el.innerHTML = h;
  }

  // ── HUD text ───────────────────────────────────────────────────────────────
  function _updateHud() {
    const el = document.getElementById('siegeTxt');
    const btn = document.getElementById('siegeBtn');
    if (!el) return;
    if (window.regionSel !== 'darkforest') return;
    if (S.active) {
      const phaseShort = { forest:'ZONE '+S.forestZone, moat:'MOAT '+Math.round(S.moatLevel)+'%', gate:'GATES', chains:'CHAINS', final:'DRAGON', victory:'VICTORY', defeat:'DEFEAT' };
      el.textContent = '☠ ' + (phaseShort[S.phase] || S.phase.toUpperCase());
      el.style.color = '#cc44ff';
      if (btn) btn.classList.add('siege-active');
    } else {
      const hr = Math.floor(Math.max(0, S.nextScheduled - Date.now()) / 3600000);
      el.textContent = '☠ DARK REALM · ' + hr + 'h';
      el.style.color = '#cc44ff';
      if (btn) btn.classList.remove('siege-active');
    }
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  function _savePersist() {
    try {
      localStorage.setItem('shaddai.darkRealm', JSON.stringify({
        active: S.active, phase: S.phase, nextScheduled: S.nextScheduled,
        gateHP: S.gateHP, dragonHP: S.dragonHP, killCount: S.killCount,
        chains: S.chains.map(function (c) { return { hp: c.hp, broken: c.broken }; }),
        contrib: S.contrib, poolSparks: S.poolSparks,
      }));
    } catch (_) {}
  }

  function _loadPersist() {
    try {
      const d = JSON.parse(localStorage.getItem('shaddai.darkRealm') || 'null');
      if (!d) return;
      S.active = d.active || false;
      S.phase = d.phase || 'idle';
      S.nextScheduled = d.nextScheduled || 0;
      S.gateHP = d.gateHP || CFG.GATE_HP;
      S.dragonHP = d.dragonHP || CFG.DRAGON_HP;
      S.killCount = d.killCount || 0;
      S.poolSparks = d.poolSparks || 0;
      if (d.chains && d.chains.length === CFG.CHAINS) {
        S.chains = d.chains.map(function (c, i) { return { id: i, hp: c.hp, maxHp: CFG.CHAIN_HP, broken: c.broken }; });
      }
      if (d.contrib) S.contrib = d.contrib;
    } catch (_) {}
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init, update, render, openPanel, openSiege, endSiege,
    attackGate, attackChain, attackDragon,
    onEnemyKill, addDrought, searchCampfireCache, nearCampfire,
    campToggle, campAddWood, campRekindle, campBreak,
    get active() { return S.active; },
    get phase() { return S.phase; },
    get moatLevel() { return S.moatLevel; },
    get isDown() { return !!S.downedAt; },
    _updateHud,
    _spawnWave,
  };

})();

// ── Hook into game loop ────────────────────────────────────────────────────
window.updateDarkRealm = function (dt, player, enemies) {
  if (window.DarkRealm) DarkRealm.update(dt, player, enemies);
};
window.renderDarkRealm = function (ctx, cam, TW, TH) {
  if (window.DarkRealm) DarkRealm.render(ctx, cam, TW || 84, TH || 42);
};
