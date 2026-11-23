/* ============================================================================
 * SHADDAI · quest-log.js — THE QUEST LOG (2026-11-22 redesign)
 * ----------------------------------------------------------------------------
 * RuneScape-style quest log + FFTA-style ranked mission board in one panel:
 *   📖 STORY      — the current realm chapter, its stages, its Gate Rite.
 *   🗺 REALMS     — the realm chain: ✓ completed · ▶ current · 🔒 locked
 *                   with the requirement spelled out.
 *   📜 COMMISSIONS — active agent quests (from npc-dialog.js) with live
 *                   progress bars, plus each agent's role.
 *   ⚔ BOUNTY BOARD — the FFTA mission board: every bounty ranked
 *                   BRONZE / SILVER / GOLD by its goal, dispatch flavour,
 *                   progress, and claim-in-place (uses the game's own
 *                   claimQuest — same ledger, same rules).
 * Button + Q key. Defensive: missing globals simply hide their section.
 * ==========================================================================*/
(function (root) {
  'use strict';
  function gv(name) { try { return (0, eval)(name); } catch (e) { return undefined; } }
  function esc(s) { var e = gv('esc'); return typeof e === 'function' ? e(String(s)) : String(s).replace(/[<>&]/g, ''); }

  var ROLES = {
    shaddai: 'Elder · Quest-Giver', zerox: 'Market Banker', oracle: 'Seer of the Realm',
    turtle: 'Chef & Fisher', nexus: 'Master Smith', quill: 'Realm Scribe', pikadon: 'Guard Captain'
  };
  var NAMES = {
    shaddai: 'SHADDAI', zerox: 'ZEROX', oracle: 'ORACLE', turtle: 'TURTLE', nexus: 'NEXUS', quill: 'QUILL', pikadon: 'PIKADON'
  };
  function rankOf(q) {
    if (q.goal >= 1000 || q.goal >= 40) return { r: 'GOLD', c: '#ffd45c' };
    if (q.goal >= 150 || q.goal >= 20) return { r: 'SILVER', c: '#c8ccd4' };
    return { r: 'BRONZE', c: '#d99a68' };
  }
  var DISPATCH = [
    'Posted at dawn. The Board pays on proof, not promises.',
    'A guild courier pinned this one. Fresh ink, fair coin.',
    'Stamped by the scribe. Ranked, witnessed, binding.',
    'The captain countersigned this notice himself.'
  ];

  var panel = null, btn = null;
  function css() {
    if (document.getElementById('qlogCss')) return;
    var s = document.createElement('style'); s.id = 'qlogCss';
    s.textContent =
      '#qlogBtn{position:fixed;top:64px;right:118px;z-index:41;font-family:Orbitron,monospace;font-weight:700;font-size:11px;letter-spacing:2px;' +
      'padding:9px 14px;border-radius:10px;cursor:pointer;color:#0a1410;border:1px solid rgba(0,229,160,.7);' +
      'background:linear-gradient(180deg,#4fe07a,#1f9e57);box-shadow:0 0 18px rgba(0,229,160,.3)}' +
      '#qlogPanel{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(2,4,10,.55)}' +
      '#qlogPanel .card{width:min(600px,94vw);max-height:88vh;overflow:auto;background:linear-gradient(160deg,#101722,#0a0f18);border:1px solid rgba(0,229,160,.45);' +
      'border-radius:14px;padding:22px 24px;color:#eaf3fb;font-family:"Share Tech Mono",monospace;box-shadow:0 24px 70px rgba(0,0,0,.7)}' +
      '#qlogPanel h1{font-family:Orbitron,monospace;font-size:18px;letter-spacing:3px;color:#4fe07a;margin:0 0 2px}' +
      '#qlogPanel h2{font-family:Orbitron,monospace;font-size:12px;letter-spacing:2px;color:#ffd45c;margin:18px 0 8px}' +
      '#qlogPanel .row{border:1px solid rgba(255,255,255,.09);border-radius:9px;padding:9px 11px;margin-bottom:8px}' +
      '#qlogPanel .row.cur{border-color:rgba(255,212,92,.55);background:rgba(255,212,92,.05)}' +
      '#qlogPanel .dim{opacity:.55}#qlogPanel .sm{font-size:11px;opacity:.78;line-height:1.5}' +
      '#qlogPanel .bar{height:6px;background:rgba(255,255,255,.12);border-radius:4px;margin-top:6px;overflow:hidden}' +
      '#qlogPanel .bar i{display:block;height:100%}' +
      '#qlogPanel .rank{font-size:9px;letter-spacing:1.5px;padding:2px 7px;border-radius:5px;border:1px solid;font-weight:700}' +
      '#qlogPanel button{font-family:Orbitron,monospace;font-weight:700;font-size:11px;letter-spacing:1.5px;padding:8px 14px;border-radius:8px;cursor:pointer;' +
      'border:1px solid rgba(255,212,92,.7);background:linear-gradient(180deg,#ffd45c,#d99b1c);color:#04060d}' +
      '#qlogPanel button.ghost{background:transparent;color:#cfe6ff;border-color:rgba(207,230,255,.35)}';
    document.head.appendChild(s);
  }
  function ensureBtn() {
    if (btn || !document.body) return;
    css();
    btn = document.createElement('button'); btn.id = 'qlogBtn'; btn.textContent = '📜 QUESTS';
    btn.style.display = 'none'; btn.addEventListener('click', open); document.body.appendChild(btn);
  }
  function close() { if (panel && panel.parentNode) panel.parentNode.removeChild(panel); panel = null; }
  root.__qlogClose = close;

  function bar(pct, color) { return '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%;background:' + color + '"></i></div>'; }

  function open() {
    ensureBtn(); close();
    panel = document.createElement('div'); panel.id = 'qlogPanel';
    var h = '<div class="card"><h1>📜 QUEST LOG</h1><div class="sm">One realm at a time. Finish a chapter, perform its Gate Rite, and the road opens.</div>';

    // ── story ──
    var sd = root.Story2D && Story2D.state();
    h += '<h2>📖 STORY — THE KEEPER\'S ROAD</h2>';
    if (!sd || !sd.started) {
      h += '<div class="row"><b>Not begun</b><div class="sm">Open 📖 STORY (top right) and begin Chapter 1 in Green Meadow.</div></div>';
    } else if (sd.finished) {
      h += '<div class="row"><b>👑 Realm Keeper</b><div class="sm">Every chapter complete, every gate opened. The Bounty Board still turns below.</div></div>';
    } else if (root.Story2D) {
      var c = Story2D.CHAPTERS[sd.idx];
      if (c) {
        var so = (sd.stg && sd.stg[c.id]) || 0;
        h += '<div class="row cur"><b>Ch ' + c.n + ' · ' + esc(c.title) + '</b> <span class="sm">— ' + esc(c.who) + ' · ' + esc((RealmProgress.NAMES[c.realm] || c.realm)) + '</span>';
        c.stages.forEach(function (st, i) {
          h += '<div class="sm">' + (i < so ? '✓' : (i === so ? '▶' : '·')) + ' ' + esc(st.obj) + '</div>';
        });
        if (so >= c.stages.length) h += '<div class="sm" style="color:#ffd45c">◈ Gate Rite ready — open 📖 STORY to complete this realm (💵' + RealmProgress.gateCost(c.realm) + ').</div>';
        else h += '<div class="sm">Reward on completion: 💵' + c.rw.m + ' · +' + c.rw.x + ' XP</div>';
        h += '</div>';
      }
    }

    // ── realms ──
    if (root.RealmProgress) {
      h += '<h2>🗺 REALMS</h2>';
      var cur = RealmProgress.currentRealm();
      RealmProgress.ORDER.forEach(function (id) {
        var done = RealmProgress.isCompleted(id), un = RealmProgress.isUnlocked(id);
        var mark = done ? '✓' : (id === cur ? '▶' : (un ? '·' : '🔒'));
        h += '<div class="row' + (id === cur && !done ? ' cur' : '') + (un ? '' : ' dim') + '"><b>' + mark + ' ' + esc(RealmProgress.NAMES[id] || id) + '</b>' +
          '<div class="sm">' + (done ? 'Realm complete — chapter finished, Gate Rite performed.' : (id === cur ? 'Your current realm. Finish its chapter to open the next.' : (un ? 'Open. Its chapter waits in the Story.' : 'Locked — ' + esc(RealmProgress.reqText(id))))) + '</div></div>';
      });
    }

    // ── agent commissions ──
    h += '<h2>📜 AGENT COMMISSIONS</h2>';
    var anyQ = false;
    if (root.AgentDialog && AgentDialog._load) {
      var db = AgentDialog._load();
      Object.keys(db).forEach(function (k) {
        var r = db[k]; if (!r || !r.active) return; anyQ = true;
        var a = r.active, p = AgentDialog.progress(a), pct = Math.round(p / a.goal * 100);
        h += '<div class="row"><b>' + a.ico + ' ' + esc(a.text) + '</b><div class="sm">For ' + esc(NAMES[k] || k.toUpperCase()) + ' · ' + esc(ROLES[k] || '') +
          ' · Reward 💵' + a.rw.m + ' · ' + a.rw.x + ' XP · ⚡' + a.rw.s + (p >= a.goal ? ' — <span style="color:#4fe07a">ready to turn in</span>' : '') + '</div>' + bar(pct, p >= a.goal ? '#4fe07a' : '#5fe0ff') + '</div>';
      });
    }
    if (!anyQ) h += '<div class="row dim"><b>No active commissions</b><div class="sm">Walk up to a council agent (look for the gold <b>!</b>) and ask for work. Each has a role — and pays in Gold, XP and Sparks.</div></div>';

    // ── bounty board (FFTA mission board) ──
    var QUESTS = gv('QUESTS'), quest = gv('quest'), questDone = gv('questDone'), qp = gv('questProg');
    if (Array.isArray(QUESTS) && typeof qp === 'function') {
      h += '<h2>⚔ BOUNTY BOARD — GUILD MISSIONS</h2><div class="sm" style="margin-bottom:8px">' + DISPATCH[(Math.random() * DISPATCH.length) | 0] + ' Missions never expire.</div>';
      QUESTS.forEach(function (q, i) {
        var prog = qp(q), done = questDone && questDone[q.id], met = prog >= q.goal, rk = rankOf(q);
        h += '<div class="row"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + q.ico + ' ' + esc(q.name) + '</b>' +
          '<span class="rank" style="color:' + rk.c + ';border-color:' + rk.c + '">' + rk.r + ' MISSION</span></div>' +
          '<div class="sm">' + esc(q.desc) + ' · Reward 💵' + q.rw.m + ' · +' + q.rw.x + ' XP · ' + Math.min(prog, q.goal) + '/' + q.goal + '</div>' +
          bar(Math.round(Math.min(prog, q.goal) / q.goal * 100), done ? '#4fe07a' : (met ? '#f2c14e' : '#5fe0ff')) +
          (done ? '<div class="sm" style="color:#4fe07a;margin-top:5px">✓ Claimed</div>' : (met ? '<div style="margin-top:7px"><button onclick="__qlogClaim(\'' + q.id + '\')">CLAIM REWARD</button></div>' : '')) + '</div>';
      });
    }

    h += '<div style="margin-top:14px;text-align:right"><button class="ghost" id="qlogX">Close</button></div></div>';
    panel.innerHTML = h; document.body.appendChild(panel);
    document.getElementById('qlogX').addEventListener('click', close);
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
  }
  root.__qlogClaim = function (id) {
    var cq = gv('claimQuest');
    if (typeof cq === 'function') { try { cq(id); } catch (e) {} }
    open(); // re-render with the claim applied
  };

  document.addEventListener('keydown', function (e) {
    if ((e.key === 'q' || e.key === 'Q') && !panel) {
      var st = gv('state');
      var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
      if ((st === 'world' || st === 'interior') && !typing) open();
    } else if (e.key === 'Escape' && panel) close();
  });

  setInterval(function () {
    ensureBtn(); if (!btn) return;
    var st = gv('state');
    btn.style.display = (st === 'world' || st === 'interior') ? '' : 'none';
  }, 700);

  root.QuestLog = { open: open, close: close };
})(window);
