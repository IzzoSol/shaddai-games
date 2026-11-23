/* ============================================================================
 * SHADDAI · tutorial-2d.js — TUTORIAL ISLAND-STYLE GUIDED START (2026-11-22)
 * ----------------------------------------------------------------------------
 * RuneScape pattern: a new keeper does not get dropped into the open world.
 * ASIMOV the Tutor waits by the Green Meadow spawn and walks the player
 * through a short guided sequence — move, talk, chop, quest — and only
 * then does the realm open up (the storybook has already set the stage).
 *
 * Steps persist in localStorage 'shaddai.tutorial2d'. Fully skippable.
 * Defensive like story-2d.js: reads game globals via indirect eval, never
 * throws into the game loop.
 *
 * API: window.Tutorial2D = { state(), reset(), talk() }
 * ==========================================================================*/
(function (root) {
  'use strict';
  var KEY = 'shaddai.tutorial2d';
  function gv(name) { try { return (0, eval)(name); } catch (e) { return undefined; } }
  function toast(m) { var t = gv('toast'); if (typeof t === 'function') { try { t(m); } catch (e) {} } }

  function load() {
    try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && typeof j.step === 'number') return j; } catch (e) {}
    return { step: 0, done: false, skipped: false, startCol: -1, startRow: -1, wood0: -1 };
  }
  var S = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  var STEPS = [
    { title: 'Find your feet', text: 'Walk with WASD or the arrow keys (or the on-screen pad). Move a few steps — go on, the Meadow is patient.' },
    { title: 'Meet your tutor', text: 'That is ASIMOV, your tutor, waiting by the spawn. Walk up to him and press E (or tap B) to talk.' },
    { title: 'Hands on a tool', text: 'Your axe is in slot 1. Stand beside a tree and use it (SPACE / tap A) until you have chopped some Wood.' },
    { title: 'Take your first quest', text: 'Find SHADDAI — the elder in gold — and press E. Choose “Any work for me?” and accept. That is how keepers earn.' },
    { title: 'The realm is yours', text: 'Tutorial complete. Open 📖 STORY for Chapter 1, finish Green Meadow, and the Gate Rite will open the Wildwood. Good walking, keeper.' }
  ];

  // ---- ASIMOV, the tutor NPC ---------------------------------------------------
  var tutor = null;
  function ensureTutor() {
    var st = gv('state'); if (st !== 'world') return;
    var r = gv('region'); if (!r || r.id !== 'meadow') return;
    var npcs = gv('npcs'); if (!Array.isArray(npcs)) return;
    if (tutor && npcs.indexOf(tutor) >= 0) return;
    var p = gv('player'); if (!p) return;
    if (S.startCol < 0) { S.startCol = p.col; S.startRow = p.row; save(); }
    var rig = { kit: 'tactics', helm: 'circlet', helmColor: '#c8ccd4', robot: true, skin: '#aeb6bf', cap: '#9aa4ad',
      shirt: '#5a6068', pants: '#3a3f47', shoe: '#22262c', led: '#5fe0ff', emblem: '#5fe0ff', __phase: 2.2 };
    tutor = { rig: rig, name: 'ASIMOV', accent: '#5fe0ff', tutor: true, agent: true, stay: true,
      col: S.startCol + 2, row: S.startRow + 1, tc: S.startCol + 2, tr: S.startRow + 1,
      pause: 1, speed: 0.5, __hub: { col: S.startCol + 2, row: S.startRow + 1 } };
    npcs.push(tutor);
  }
  function nearTutor() {
    if (!tutor) return false;
    var p = gv('player'); if (!p) return false;
    return Math.hypot(tutor.col - p.col, tutor.row - p.row) < 2.0;
  }

  // ---- tutor dialog --------------------------------------------------------------
  var dlg = null;
  var LINES = [
    'ASIMOV: Welcome to Green Meadow, keeper. I am ASIMOV — I teach new arrivals how this world works. Everything is stacked, solid and real here; so is the work.',
    'ASIMOV: Three habits will carry you: use your TOOLS (slot keys, SPACE to swing), TALK to the council (E beside an agent), and finish what you start — realms open one at a time to those who complete them.',
    'ASIMOV: SHADDAI the elder gives the realm\'s first quests. The Bounty Board lists more. When Green Meadow is finished, the Story panel holds the Gate Rite — that is your road out, and onward.'
  ];
  function css() {
    if (document.getElementById('tut2dCss')) return;
    var s = document.createElement('style'); s.id = 'tut2dCss';
    s.textContent =
      '#tut2dBar{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:42;width:min(520px,92vw);' +
      'background:rgba(6,10,18,.88);border:1px solid rgba(95,224,255,.45);border-radius:12px;padding:10px 14px;color:#eaf3fb;' +
      'font-family:"Share Tech Mono",monospace;backdrop-filter:blur(4px);box-shadow:0 10px 30px rgba(0,0,0,.5)}' +
      '#tut2dBar .h{font-family:Orbitron,monospace;font-size:11px;letter-spacing:2px;color:#5fe0ff;margin-bottom:3px}' +
      '#tut2dBar .t{font-size:12px;line-height:1.5;color:#d7e5f5}' +
      '#tut2dBar .row{display:flex;justify-content:space-between;align-items:center;margin-top:7px}' +
      '#tut2dBar .dots{font-size:11px;letter-spacing:3px;color:#5fe0ff}' +
      '#tut2dBar button{font-family:Orbitron,monospace;font-size:10px;letter-spacing:1px;padding:5px 10px;border-radius:7px;cursor:pointer;' +
      'background:transparent;color:#9fb4c8;border:1px solid rgba(159,180,200,.4)}' +
      '#tut2dDlg{position:fixed;inset:0;z-index:61;display:flex;align-items:flex-end;justify-content:center;background:rgba(2,4,10,.35)}' +
      '#tut2dDlg .box{width:min(600px,94vw);margin-bottom:9vh;background:rgba(6,9,15,.96);border:1px solid rgba(95,224,255,.5);border-radius:12px;' +
      'padding:16px 18px;color:#eaf3fb;font-family:"Share Tech Mono",monospace;font-size:13.5px;line-height:1.6;box-shadow:0 14px 44px rgba(0,0,0,.65)}' +
      '#tut2dDlg button{margin-top:12px;font-family:Orbitron,monospace;font-weight:700;font-size:11px;letter-spacing:2px;padding:9px 16px;border-radius:8px;cursor:pointer;' +
      'border:1px solid rgba(95,224,255,.7);background:linear-gradient(180deg,#5fe0ff,#1f9ec4);color:#04060d}';
    document.head.appendChild(s);
  }
  var lineIdx = 0;
  function talk() {
    if (!nearTutor() && gv('state') !== 'world') return;
    css(); closeDlg();
    dlg = document.createElement('div'); dlg.id = 'tut2dDlg';
    dlg.innerHTML = '<div class="box"><div>' + LINES[lineIdx % LINES.length] + '</div><button id="tut2dNext">' + (lineIdx === LINES.length - 1 ? 'Thanks, ASIMOV' : 'And then? →') + '</button></div>';
    document.body.appendChild(dlg);
    document.getElementById('tut2dNext').addEventListener('click', function () {
      lineIdx++;
      if (S.step === 1) { S.step = 2; S.wood0 = -1; save(); toast('🎓 Tutorial: now try your axe on a tree.'); }
      if (lineIdx >= LINES.length) { lineIdx = 0; closeDlg(); } else talk();
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDlg(); });
  }
  function closeDlg() { if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg); dlg = null; }
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'e' || e.key === 'E') && nearTutor() && !dlg) {
      var st = gv('state'); if (st === 'world') { e.stopImmediatePropagation(); talk(); }
    }
  }, true);

  // ---- guided-step banner ---------------------------------------------------------
  var bar = null;
  function ensureBar() {
    if (bar || !document.body) return;
    css();
    bar = document.createElement('div'); bar.id = 'tut2dBar'; bar.style.display = 'none';
    document.body.appendChild(bar);
  }
  function renderBar() {
    var st = STEPS[S.step]; if (!st) return;
    bar.innerHTML = '<div class="h">🎓 TUTORIAL · STEP ' + (S.step + 1) + ' OF ' + STEPS.length + ' — ' + st.title.toUpperCase() + '</div>' +
      '<div class="t">' + st.text + '</div>' +
      '<div class="row"><span class="dots">' + STEPS.map(function (_, i) { return i < S.step ? '●' : (i === S.step ? '◉' : '○'); }).join(' ') + '</span>' +
      '<button id="tut2dSkip">Skip tutorial</button></div>';
    var sk = document.getElementById('tut2dSkip');
    if (sk) sk.addEventListener('click', function () { S.done = true; S.skipped = true; save(); bar.style.display = 'none'; toast('🎓 Tutorial skipped — ASIMOV remains by the Meadow spawn if you need him.'); });
  }

  function tick() {
    var st = gv('state');
    if (st !== 'world' || S.done) { if (bar) bar.style.display = 'none'; return; }
    // tutorial only runs in the home realm for a keeper who hasn't finished it
    var story = root.Story2D && Story2D.state();
    if (story && story.finished) { S.done = true; save(); return; }
    ensureTutor(); ensureBar(); if (!bar) return;
    bar.style.display = ''; renderBar();
    var p = gv('player'); if (!p) return;
    if (S.startCol < 0) { S.startCol = p.col; S.startRow = p.row; save(); }
    switch (S.step) {
      case 0: if (Math.hypot(p.col - S.startCol, p.row - S.startRow) >= 2.5) { S.step = 1; save(); toast('🎓 Tutorial: find ASIMOV, your tutor.'); } break;
      case 1: break; // advanced by talking to ASIMOV (see talk())
      case 2: {
        var inv = gv('inv'); var wood = inv ? (inv.wood || 0) : 0;
        if (S.wood0 < 0) S.wood0 = wood;
        if (wood > S.wood0) { S.step = 3; save(); toast('🎓 Tutorial: last step — take a quest from SHADDAI.'); }
        break; }
      case 3: {
        try {
          var db = JSON.parse(root.localStorage.getItem('shaddai.agentQuests') || '{}');
          var any = Object.keys(db).some(function (k) { return db[k] && (db[k].active || (db[k].done | 0) > 0); });
          var sd = root.Story2D && Story2D.state();
          if (any || (sd && sd.started)) { S.step = 4; save(); }
        } catch (e) {}
        break; }
      case 4: S.done = true; save(); bar.style.display = 'none'; toast('🎓 Tutorial complete — the realm is yours.'); break;
    }
  }
  setInterval(tick, 500);

  root.Tutorial2D = {
    state: function () { return JSON.parse(JSON.stringify(S)); },
    reset: function () { S = { step: 0, done: false, skipped: false, startCol: -1, startRow: -1, wood0: -1 }; tutor = null; save(); },
    talk: talk
  };
})(window);
