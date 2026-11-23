/* ============================================================================
 * SHADDAI · story-2d.js — STORY MODE for the Classic 2D World (game.html)
 * ----------------------------------------------------------------------------
 * 2026-11-22 redesign (FFTA storybook + RuneScape gated realms):
 *  - The game opens with a STORYBOOK: framed illustrated pages you turn,
 *    skippable, shown once — then the guided tutorial start takes over.
 *  - The campaign is ONE CHAPTER PER REALM. Each chapter is a quest chain
 *    of STAGES (multi-step objectives checked against the game's own live
 *    stats), spoken by a council agent in role.
 *  - A chapter ends at the GATE RITE: pay the rite's gold at the Story
 *    panel to complete the realm — RealmProgress then unlocks the NEXT
 *    realm. Home realm first; the world opens one realm at a time.
 *
 * Progress persists in localStorage 'shaddai.story2d' and survives reloads.
 * Defensive: if the game globals are absent, it simply never shows itself.
 *
 * API: window.Story2D = { open(), close(), intro(), state(), reset(), CHAPTERS }
 * ==========================================================================*/
(function (root) {
  'use strict';
  var KEY = 'shaddai.story2d';

  function gv(name) { try { return (0, eval)(name); } catch (e) { return undefined; } }
  function toast(m) { var t = gv('toast'); if (typeof t === 'function') { try { t(m); } catch (e) {} } }
  function qstat(k) { var q = gv('quest'); return q ? (q[k] || 0) : 0; }
  function doneCount() { var d = gv('questDone'); return d ? Object.keys(d).length : 0; }
  function lvl() { var lf = gv('levelFor'), cr = gv('credits'); return (typeof lf === 'function' && typeof cr === 'number') ? lf(cr) : 1; }
  function inRegion(id) { var r = gv('region'); return !!r && r.id === id; }
  function held(id) { var v = gv('inv'); return v ? (v[id] || 0) : 0; }
  function pay(rw) {
    try { (0, eval)('money = (typeof money === "number" ? money : 0) + ' + (rw.m | 0)); } catch (e) {}
    var ax = gv('addXP'); if (typeof ax === 'function' && rw.x) { try { ax(rw.x); } catch (e) {} }
    var sv = gv('saveEcon'); if (typeof sv === 'function') { try { sv(); } catch (e) {} }
  }

  // ---- chapters: one per realm, in RealmProgress.ORDER ---------------------
  var CHAPTERS = [
    { id: 'meadow-road', realm: 'meadow', n: 1, title: 'The Keeper\'s Road', who: 'SHADDAI', color: '#ffd45c',
      text: 'Welcome to Green Meadow, keeper. Everything here runs on honest work — swing an axe, cast a line, take a bounty. Prove the Meadow can trust you, and the road beyond opens.',
      stages: [
        { obj: 'Earn your first Gold (work, fish or fight)', check: function () { return qstat('earn') >= 1; } },
        { obj: 'Complete and claim any Bounty Board quest', check: function () { return doneCount() >= 1; } },
        { obj: 'Defeat 3 foes in the fields', check: function () { return qstat('kills') >= 3; } }
      ], rw: { m: 60, x: 30 } },
    { id: 'forest-trial', realm: 'forest', n: 2, title: 'The Wildwood Trial', who: 'ORACLE', color: '#8b7bf0',
      text: 'I have seen the Wildwood test you, keeper. Walk under its green dark, fill your pack with its timber, and answer what moves between the trees.',
      stages: [
        { obj: 'Travel to the Wildwood', check: function () { return inRegion('forest') || visited('forest'); } },
        { obj: 'Carry 5 Wood at once (chop trees with an axe)', check: function () { return held('wood') >= 5; } },
        { obj: 'Reach 10 total foe defeats', check: function () { return qstat('kills') >= 10; } }
      ], rw: { m: 90, x: 45 } },
    { id: 'beach-lights', realm: 'beach', n: 3, title: 'Harbour Lights', who: 'TURTLE', color: '#00ff9c',
      text: 'Slow water, steady hands. Sunny Harbor feeds half the realm — work its docks, then sell the catch where the prices sing.',
      stages: [
        { obj: 'Travel to Sunny Harbor', check: function () { return inRegion('beach') || visited('beach'); } },
        { obj: 'Catch 8 fish', check: function () { return qstat('fish') >= 8; } },
        { obj: 'Sell 3 goods at market', check: function () { return qstat('sell') >= 3; } }
      ], rw: { m: 110, x: 55 } },
    { id: 'suburb-quiet', realm: 'suburb', n: 4, title: 'Quiet Streets', who: 'QUILL', color: '#5fe0ff',
      text: 'Every street in the Suburbs is a sentence someone is living. Walk them, work them, and let the Board remember your name.',
      stages: [
        { obj: 'Travel to The Suburbs', check: function () { return inRegion('suburb') || visited('suburb'); } },
        { obj: 'Earn 300 Gold in total', check: function () { return qstat('earn') >= 300; } },
        { obj: 'Claim 3 Bounty Board quests in total', check: function () { return doneCount() >= 3; } }
      ], rw: { m: 140, x: 70 } },
    { id: 'city-ledger', realm: 'city', n: 5, title: 'The Downtown Ledger', who: 'ZEROX', color: '#00c8ff',
      text: 'Downtown runs on flow, keeper. Goods in, goods out, prices honest. Move the market and the city moves with you.',
      stages: [
        { obj: 'Travel to Downtown', check: function () { return inRegion('city') || visited('city'); } },
        { obj: 'Sell 8 goods at market', check: function () { return qstat('sell') >= 8; } },
        { obj: 'Reach Level 3', check: function () { return lvl() >= 3; } }
      ], rw: { m: 180, x: 90 } },
    { id: 'desert-coin', realm: 'desert', n: 6, title: 'Dust and Coin', who: 'ZEROX', color: '#00c8ff',
      text: 'Dust Canyon pays the stubborn. The oases hide fish, the dunes hide teeth — bring both home.',
      stages: [
        { obj: 'Travel to Dust Canyon', check: function () { return inRegion('desert') || visited('desert'); } },
        { obj: 'Reach 20 total foe defeats', check: function () { return qstat('kills') >= 20; } },
        { obj: 'Catch 15 fish', check: function () { return qstat('fish') >= 15; } }
      ], rw: { m: 220, x: 110 } },
    { id: 'volcano-ember', realm: 'volcano', n: 7, title: 'The Ember Test', who: 'PIKADON', color: '#ff5a4d',
      text: 'Emberfields is where I send guards who think they are ready. Prove it: stand in the heat, clear the field, come back richer.',
      stages: [
        { obj: 'Travel to Emberfields', check: function () { return inRegion('volcano') || visited('volcano'); } },
        { obj: 'Reach 35 total foe defeats', check: function () { return qstat('kills') >= 35; } },
        { obj: 'Earn 1,200 Gold in total', check: function () { return qstat('earn') >= 1200; } }
      ], rw: { m: 280, x: 140 } },
    { id: 'council-mark', realm: 'agentcity', n: 8, title: 'The Council\'s Mark', who: 'SHADDAI', color: '#ffd45c',
      text: 'You stand in my city now, keeper. One last measure before the Dark: let the Board and your own growth speak for you.',
      stages: [
        { obj: 'Enter SHADDAI City', check: function () { return inRegion('agentcity') || visited('agentcity'); } },
        { obj: 'Claim 6 Bounty Board quests in total', check: function () { return doneCount() >= 6; } },
        { obj: 'Reach Level 4', check: function () { return lvl() >= 4; } }
      ], rw: { m: 350, x: 180 } },
    { id: 'dark-keeper', realm: 'darkforest', n: 9, title: 'Into the Dark', who: 'ORACLE', color: '#8b7bf0',
      text: 'The last page, keeper. Go into the Dark Realm. Stand under its black canopy, let your blade answer what moves there — and come back a legend.',
      stages: [
        { obj: 'Enter the Dark Realm', check: function (S) { return !!S.darkSeen || inRegion('darkforest'); } },
        { obj: 'Reach 60 total foe defeats', check: function () { return qstat('kills') >= 60; } },
        { obj: 'Reach Level 5', check: function () { return lvl() >= 5; } }
      ], rw: { m: 500, x: 260 } }
  ];
  function visited(id) { return !!S.seen[id]; }

  function load() {
    try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && typeof j.idx === 'number') { j.stg = j.stg || {}; j.seen = j.seen || {}; return j; } } catch (e) {}
    return { started: false, idx: 0, done: {}, darkSeen: false, finished: false, shownFor: -1, stg: {}, seen: {}, introSeen: false };
  }
  var S = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function stageOf(c) { return S.stg[c.id] || 0; }
  function gateReady(c) { return stageOf(c) >= c.stages.length; }

  // ---- shared CSS ------------------------------------------------------------
  function css() {
    if (document.getElementById('story2dCss')) return;
    var st = document.createElement('style'); st.id = 'story2dCss';
    st.textContent =
      '#story2dBtn{position:fixed;top:64px;right:16px;z-index:41;font-family:Orbitron,monospace;font-weight:700;font-size:11px;letter-spacing:2px;' +
      'padding:9px 14px;border-radius:10px;cursor:pointer;color:#04060d;border:1px solid rgba(255,212,92,.7);' +
      'background:linear-gradient(180deg,#ffd45c,#d99b1c);box-shadow:0 0 18px rgba(255,212,92,.35)}' +
      '#story2dChip{position:fixed;top:106px;right:16px;z-index:41;max-width:250px;font-family:"Share Tech Mono",monospace;font-size:10px;letter-spacing:1px;' +
      'color:#cfe6ff;background:rgba(6,10,18,.78);border:1px solid rgba(95,224,255,.35);border-radius:8px;padding:7px 10px;backdrop-filter:blur(4px)}' +
      '#story2dPanel{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(2,4,10,.55)}' +
      '#story2dPanel .card{width:min(560px,92vw);max-height:86vh;overflow:auto;background:linear-gradient(160deg,#101722,#0a0f18);border:1px solid rgba(255,212,92,.45);' +
      'border-radius:14px;padding:22px 24px;color:#eaf3fb;font-family:"Share Tech Mono",monospace;box-shadow:0 24px 70px rgba(0,0,0,.7)}' +
      '#story2dPanel h1{font-family:Orbitron,monospace;font-size:19px;letter-spacing:3px;color:#ffd45c;margin:0 0 4px}' +
      '#story2dPanel .who{font-size:10px;letter-spacing:2px;text-transform:uppercase}' +
      '#story2dPanel .txt{font-size:13px;line-height:1.55;color:#d7e5f5;margin:8px 0 12px}' +
      '#story2dPanel .ch{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border:1px solid rgba(255,255,255,.09);border-radius:9px;margin-bottom:8px}' +
      '#story2dPanel .ch.cur{border-color:rgba(255,212,92,.55);background:rgba(255,212,92,.06)}' +
      '#story2dPanel .ch.done{opacity:.62}.ch.lock{opacity:.4}' +
      '#story2dPanel .ch b{font-size:13px}#story2dPanel .ch .o{font-size:11px;opacity:.75}' +
      '#story2dPanel .stg{font-size:11px;margin:3px 0 0 4px;opacity:.85}#story2dPanel .stg.on{color:#ffd45c;opacity:1}' +
      '#story2dPanel button{font-family:Orbitron,monospace;font-weight:700;font-size:11px;letter-spacing:2px;padding:10px 16px;border-radius:8px;cursor:pointer;' +
      'border:1px solid rgba(255,212,92,.7);background:linear-gradient(180deg,#ffd45c,#d99b1c);color:#04060d}' +
      '#story2dPanel button.ghost{background:transparent;color:#cfe6ff;border-color:rgba(207,230,255,.35)}' +
      '#story2dPanel button:disabled{opacity:.45;cursor:default}' +
      /* storybook */
      '#storyBook{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:radial-gradient(90% 90% at 50% 40%,#1a1408,#05060a 75%)}' +
      '#storyBook .book{width:min(620px,94vw);background:linear-gradient(165deg,#f3e6c8,#e2d0a4);color:#2a2013;border-radius:6px 14px 14px 6px;' +
      'box-shadow:0 30px 80px rgba(0,0,0,.8),inset 6px 0 18px rgba(120,90,30,.35);padding:26px 30px 22px;font-family:Georgia,"Times New Roman",serif;position:relative}' +
      '#storyBook .book:before{content:"";position:absolute;left:10px;top:12px;bottom:12px;width:2px;background:rgba(120,90,30,.4)}' +
      '#storyBook h1{font-size:21px;letter-spacing:2px;margin:0 0 4px;color:#5a3d10;font-variant:small-caps}' +
      '#storyBook .pg{font-size:11px;letter-spacing:2px;color:#8a6d35;text-transform:uppercase;margin-bottom:10px}' +
      '#storyBook img{width:100%;height:210px;object-fit:cover;border:3px solid #8a6d35;border-radius:4px;box-shadow:0 6px 18px rgba(60,40,5,.35)}' +
      '#storyBook .tx{font-size:15.5px;line-height:1.65;margin:14px 2px 16px;min-height:76px}' +
      '#storyBook .row{display:flex;justify-content:space-between;align-items:center}' +
      '#storyBook button{font-family:Georgia,serif;font-weight:700;font-size:13px;letter-spacing:1px;padding:9px 18px;border-radius:6px;cursor:pointer;' +
      'border:1px solid #8a6d35;background:linear-gradient(180deg,#ffd45c,#d99b1c);color:#2a2013}' +
      '#storyBook button.ghost{background:transparent;color:#8a6d35}';
    document.head.appendChild(st);
  }

  // ---- storybook opening -------------------------------------------------------
  var PAGES = [
    { img: 'hero/meadow.png', cap: 'Page I · Where It Begins',
      tx: 'There is a valley where the grass keeps accounts. Every coin earned honestly, every fish pulled from the Silver Stream, every foe turned away from the roads — the valley remembers, and it pays its keepers in kind.' },
    { img: 'hero/forest.png', cap: 'Page II · The Locked Roads',
      tx: 'Nine realms ring the valley, and nine gates stand shut. The old law is simple: a realm opens only to a keeper who has finished the one before it. Work. Trade. Fight. Grow. The gates are listening.' },
    { img: 'hero/darkforest.png', cap: 'Page III · What Waits',
      tx: 'At the far edge waits the Dark Realm, where the Shadow Keep stands and something old circles above it. This book will take you there — one realm, one chapter, one gate at a time. Turn the page, keeper. Your tutor is waiting.' }
  ];
  var book = null, pageIdx = 0;
  function closeBook() { if (book && book.parentNode) book.parentNode.removeChild(book); book = null; S.introSeen = true; save(); }
  function openIntro() {
    css(); closeBook(); pageIdx = 0;
    book = document.createElement('div'); book.id = 'storyBook';
    document.body.appendChild(book); renderPage();
  }
  function renderPage() {
    if (!book) return;
    var p = PAGES[pageIdx], last = pageIdx === PAGES.length - 1;
    book.innerHTML = '<div class="book"><h1>The Keeper\'s Road</h1><div class="pg">' + p.cap + '</div>' +
      '<img src="' + p.img + '" alt="" onerror="this.style.display=\'none\'">' +
      '<div class="tx">' + p.tx + '</div>' +
      '<div class="row"><button class="ghost" id="sbSkip">Skip the story</button>' +
      '<button id="sbNext">' + (last ? '▶ Begin in Green Meadow' : 'Turn the page →') + '</button></div></div>';
    document.getElementById('sbSkip').addEventListener('click', closeBook);
    document.getElementById('sbNext').addEventListener('click', function () {
      if (last) { closeBook(); if (!S.started) { S.started = true; S.shownFor = 0; save(); toast('📖 Story begun: Ch 1 · ' + CHAPTERS[0].title); } }
      else { pageIdx++; renderPage(); }
    });
  }

  // ---- story panel -------------------------------------------------------------
  var btn = null, panel = null, chip = null;
  function inGame() { var st = gv('state'); return st === 'world' || st === 'interior'; }
  function ensureUI() {
    if (btn || !document.body) return;
    css();
    btn = document.createElement('button'); btn.id = 'story2dBtn'; btn.textContent = '📖 STORY';
    btn.style.display = 'none'; btn.addEventListener('click', open); document.body.appendChild(btn);
    chip = document.createElement('div'); chip.id = 'story2dChip'; chip.style.display = 'none'; document.body.appendChild(chip);
  }
  function close() { if (panel && panel.parentNode) panel.parentNode.removeChild(panel); panel = null; }
  function realmName(id) { return (root.RealmProgress && RealmProgress.NAMES[id]) || id; }
  function open() {
    ensureUI(); close();
    panel = document.createElement('div'); panel.id = 'story2dPanel';
    var h = '<div class="card">';
    if (!S.started) {
      h += '<h1>📖 STORY MODE</h1><div class="who" style="color:#ffd45c">THE KEEPER\'S ROAD · ONE CHAPTER PER REALM</div>' +
        '<div class="txt">Nine realms, nine chapters, nine gates. Finish a realm\'s chapter, perform its Gate Rite, and the next realm opens. ' +
        'You start where every keeper starts: Green Meadow.</div>' +
        '<button id="story2dBegin">▶ BEGIN THE STORY</button> <button class="ghost" id="story2dX">Not now</button>';
    } else if (S.finished) {
      h += '<h1>👑 REALM KEEPER</h1><div class="who" style="color:#ffd45c">THE KEEPER\'S ROAD · COMPLETE</div>' +
        '<div class="txt">You walked the whole road — Meadow to Dark Realm, gate by gate. The Realm is yours. The Bounty Board still turns, and the roads still need you.</div>' +
        '<button class="ghost" id="story2dX">Close</button>';
    } else {
      var cur = CHAPTERS[S.idx];
      h += '<h1>📖 THE KEEPER\'S ROAD</h1><div class="who" style="color:' + cur.color + '">' + cur.who + ' · CHAPTER ' + cur.n + ' OF 9 · ' + realmName(cur.realm).toUpperCase() + '</div>' +
        '<div class="txt">“' + cur.text + '”</div>';
      CHAPTERS.forEach(function (c, i) {
        var cls = S.done[c.id] ? 'done' : (i === S.idx ? 'cur' : 'lock');
        var mark = S.done[c.id] ? '✓' : (i === S.idx ? '▶' : '🔒');
        h += '<div class="ch ' + cls + '"><div>' + mark + '</div><div><b>Ch ' + c.n + ' · ' + c.title + '</b>';
        if (i === S.idx) {
          var so = stageOf(c);
          c.stages.forEach(function (st, si) {
            h += '<div class="stg' + (si === so ? ' on' : '') + '">' + (si < so ? '✓' : (si === so ? '▶' : '·')) + ' ' + st.obj + '</div>';
          });
          if (gateReady(c)) {
            var cost = root.RealmProgress ? RealmProgress.gateCost(c.realm) : 25;
            h += '<div class="stg on">▶ All stages complete — the Gate Rite awaits (💵' + cost + ')</div>';
          } else {
            h += '<div class="o">Reward 💵' + c.rw.m + ' · +' + c.rw.x + ' XP · then the Gate Rite opens ' + (CHAPTERS[i + 1] ? realmName(CHAPTERS[i + 1].realm) : 'the end') + '</div>';
          }
        } else if (S.done[c.id]) {
          h += '<div class="o">Complete (+💵' + c.rw.m + ' · +' + c.rw.x + ' XP)</div>';
        } else {
          h += '<div class="o">Locked — finish the realm before it</div>';
        }
        h += '</div></div>';
      });
      if (gateReady(cur)) {
        var cost2 = root.RealmProgress ? RealmProgress.gateCost(cur.realm) : 25;
        var money = gv('money'); var can = typeof money === 'number' && money >= cost2;
        h += '<button id="story2dGate"' + (can ? '' : ' disabled') + '>◈ PERFORM THE GATE RITE · 💵' + cost2 + '</button> ';
        if (!can) h += '<span style="font-size:11px;opacity:.7">You carry 💵' + (money | 0) + ' — earn the rite\'s price first.</span> ';
      }
      h += '<button class="ghost" id="story2dX">Close</button>';
    }
    h += '</div>';
    panel.innerHTML = h; document.body.appendChild(panel);
    var x = document.getElementById('story2dX'); if (x) x.addEventListener('click', close);
    var b = document.getElementById('story2dBegin');
    if (b) b.addEventListener('click', function () { S.started = true; S.shownFor = 0; save(); open(); toast('📖 Story begun: Ch 1 · ' + CHAPTERS[0].title); });
    var g = document.getElementById('story2dGate');
    if (g) g.addEventListener('click', function () { performGate(CHAPTERS[S.idx]); });
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
  }

  // ---- the Gate Rite: a realm's completion gate --------------------------------
  function performGate(c) {
    if (!c || S.done[c.id] || !gateReady(c)) return;
    var cost = root.RealmProgress ? RealmProgress.gateCost(c.realm) : 25;
    var money = gv('money');
    if (typeof money !== 'number' || money < cost) { toast('◈ The Gate Rite costs 💵' + cost + ' — earn a little more first.'); return; }
    try { (0, eval)('money = money - ' + cost); } catch (e) { return; }
    S.done[c.id] = true; pay(c.rw);
    var unlocked = null;
    if (root.RealmProgress) unlocked = RealmProgress.complete(c.realm);
    toast('◈ Gate Rite complete: ' + c.title + '  +💵' + c.rw.m + ' · +' + c.rw.x + ' XP' + (unlocked ? '  ·  🗺 ' + realmName(unlocked) + ' is OPEN' : ''));
    S.idx++;
    if (S.idx >= CHAPTERS.length) { S.finished = true; save(); setTimeout(open, 500); }
    else { S.shownFor = S.idx; save(); setTimeout(open, 500); }
  }

  // ---- progression ---------------------------------------------------------------
  function tick() {
    ensureUI(); if (!btn) return;
    var show = inGame();
    btn.style.display = show ? '' : 'none';
    if (!show) { chip.style.display = 'none'; return; }
    var r = gv('region');
    if (r && r.id) { if (!S.seen[r.id]) { S.seen[r.id] = 1; save(); } if (r.id === 'darkforest') S.darkSeen = true; }
    // storybook opening: once, the first time a fresh keeper enters the world
    if (!S.introSeen && !S.started && !book) { openIntro(); return; }
    if (!S.started || S.finished) { chip.style.display = 'none'; return; }
    var cur = CHAPTERS[S.idx]; if (!cur) { chip.style.display = 'none'; return; }
    var so = stageOf(cur);
    chip.style.display = '';
    if (so < cur.stages.length) {
      var st = cur.stages[so];
      chip.innerHTML = '📖 <b>Ch ' + cur.n + ' · ' + cur.title + '</b> (' + (so + 1) + '/' + cur.stages.length + ')<br>' + st.obj;
      if (st.check(S)) {
        S.stg[cur.id] = so + 1; save();
        toast('📖 Stage complete: ' + st.obj + (so + 1 >= cur.stages.length ? ' — the Gate Rite awaits in the Story panel!' : ''));
      }
    } else {
      chip.innerHTML = '📖 <b>Ch ' + cur.n + ' · ' + cur.title + '</b><br>◈ Gate Rite ready — open 📖 STORY to complete ' + realmName(cur.realm) + '.';
    }
  }
  setInterval(tick, 800);

  root.Story2D = {
    open: open, close: close, intro: openIntro,
    state: function () { return JSON.parse(JSON.stringify(S)); },
    reset: function () { S = { started: false, idx: 0, done: {}, darkSeen: false, finished: false, shownFor: -1, stg: {}, seen: {}, introSeen: false }; save(); },
    CHAPTERS: CHAPTERS
  };
})(window);
