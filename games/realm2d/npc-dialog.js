/* SHADDAI AGENT DIALOGS (2D) — the 7 operative agents as quest-givers.
 * Walk up to an agent + E → letterboxed cutscene dialog: TALK · QUEST · TRADE · ASK.
 * AGENTIC: each agent scores every quest it could give against its persona, its own
 * stock needs and what YOU can actually do right now, then picks the best one and says
 * why. Trust grows per agent with every turn-in → bigger quests, bigger pay.
 * Rewards: gold + XP + ⚡ sparks on the ONE ledger (sparks-ledger.js).
 * Reads game.html globals (classic-script scope): npcs, BOTS, GOODS, inv, money, quest,
 * region, player, state, toast, saveEcon, addXP, openBotShop, botCfgFor, apiPost, esc.
 * Persisted in localStorage 'shaddai.agentQuests'.
 */
(function () {
  if (window.AgentDialog) return;
  var STORE = 'shaddai.agentQuests';

  // ── personas: what each agent cares about (weights over quest kinds) + voice ──
  var PERSONA = {
    shaddai: { w: { fetch: 1.0, hunt: 1.3, earn: 1.2, arcade: 0.8, fish: 0.7, sell: 0.8 }, title: 'Elder · Quest-Giver of the Realm',
      hi: ['The realm grows because people like you walk it.', 'Crown standard today, traveler?', 'Every agent here answers to one idea: build together.'],
      talk: ['Sparks are one ledger — 2D, 3D, arcade, dashboard. Earn anywhere, spend everywhere.', 'The Colosseum pays champions. The market pays the patient.', 'I placed the realms like a compass. The city is the center — everything else radiates out.'] },
    oracle: { w: { fetch: 1.1, fish: 1.3, earn: 0.7, arcade: 0.9, hunt: 0.6, sell: 1.0 }, title: 'Seer of the Realm',
      hi: ['I saw you coming three ticks ago.', 'Knowledge is the only good that never depletes.', 'Ask, and I will answer what the data allows.'],
      talk: ['The water holds a Void-Pearl — one in a hundred casts. Patience is a strategy.', 'Prices drift by region. Buy where it is common, sell where it is rare.', 'Night brings the lamps out. Day brings the traders.'] },
    quill: { w: { fetch: 1.2, sell: 1.3, fish: 0.9, earn: 0.8, arcade: 1.0, hunt: 0.7 }, title: 'Realm Scribe',
      hi: ['Ah — a new chapter walks in.', 'Every trade is a sentence. Every quest, a paragraph.', 'I write the realm down so it remembers you.'],
      talk: ['A good story needs stakes. The arcade has them — entry fees, real payouts.', 'Sell what you gather; the dealer bounty rewards the bold.', 'Someone once fished for a week for one pearl. I wrote it all down.'] },
    turtle: { w: { fetch: 1.4, fish: 1.0, sell: 1.0, earn: 0.7, arcade: 0.6, hunt: 0.5 }, title: 'Chef & Fisher',
      hi: ['Slow is smooth. Smooth is beautiful.', 'Your home could use a little craft, friend.', 'Wood, hide, water — honest materials make honest rooms.'],
      talk: ['A room tells you who lives in it. Decorate yours — press the room theme button inside.', 'I check every pixel twice. The realm deserves it.', 'The forest gives wood freely if you ask with an axe.'] },
    nexus: { w: { fetch: 1.5, hunt: 1.0, earn: 0.9, sell: 0.8, arcade: 0.7, fish: 0.5 }, title: 'Master Smith of the Forge',
      hi: ['Raw input, refined output. What are you bringing?', 'The forge never sleeps. Neither do I.', 'Systems nominal. You?'],
      talk: ['Ore in, tools out. The loop is the product.', 'Upgrade your weapon at the forge — fish count as materials.', 'Every system in this world shares one heartbeat: the sparks ledger.'] },
    zerox: { w: { earn: 1.5, sell: 1.3, arcade: 1.1, fetch: 0.9, hunt: 0.6, fish: 0.6 }, title: 'Market Banker',
      hi: ['Liquidity is love. What are you trading?', 'Goods flow where prices are fair.', 'Markets open. Spreads tight. Talk to me.'],
      talk: ['SHADDAI Coin moves with the market — buy fear, sell hype.', 'The bank pays you to wait. Few people listen.', 'Arcade fees fund the pots. Win and the pot flows back to you.'] },
    pikadon: { w: { hunt: 1.5, fetch: 1.0, arcade: 1.0, earn: 0.7, sell: 0.7, fish: 0.6 }, title: 'Guard Captain',
      hi: ['Identity verified. Proceed.', 'I audit everything. Including you.', 'Safe trades only. What do you need?'],
      talk: ['The darkforest is not safe after dark. Bring a sword.', 'Every payout in the arcade is checked — one claim per paid entry.', 'Trust is earned in increments. So is my respect.'] },
  };

  // ── persistence ──
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
  function save(db) { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) {} }
  function rec(db, key) { return db[key] || (db[key] = { trust: 0, done: 0, last: [], active: null }); }
  function tier(trust) { return trust >= 6 ? 3 : trust >= 3 ? 2 : trust >= 1 ? 1 : 0; }
  function stat(k) { return (typeof quest !== 'undefined' && quest && quest[k]) || 0; }
  function ledger() { return window.ShdSparks; }
  function cfgOf(bot) { return (typeof botCfgFor === 'function' && botCfgFor(bot)) || { key: 'shaddai', name: 'SHADDAI', accent: '#e8c45c', buys: [] }; }
  function goodOf(id) { return (typeof GOODS !== 'undefined' ? GOODS : []).find(function (g) { return g.id === id; }); }
  function held(id) { return (typeof inv !== 'undefined' && inv[id]) || 0; }

  // ── the agentic brain: enumerate candidate quests, score them, pick the best ──
  function candidates(cfg, t) {
    var mult = 1 + t * 0.5, out = [];
    (cfg.buys || []).forEach(function (b) {
      var g = goodOf(b[0]); if (!g) return;
      var qty = 2 + t + (Math.random() * 2 | 0);
      out.push({ kind: 'fetch', good: g.id, goal: qty, ico: g.ico,
        text: 'Bring me ' + qty + ' × ' + g.name + '.',
        rw: { m: Math.round(g.base * b[1] * qty * 1.6 * mult), x: 12 * qty, s: Math.round((3 + qty) * mult) },
        need: b[1], why: 'I pay ' + b[1] + '× for ' + g.name + ' — my racks run thin' + (held(g.id) ? ', and you already carry ' + held(g.id) : '') });
    });
    var n;
    n = 3 + t * 2; out.push({ kind: 'fish', stat: 'fish', goal: n, ico: '🎣', text: 'Catch ' + n + ' fish.', rw: { m: 20 * n, x: 10 * n, s: Math.round(2 * n * mult) }, why: 'the docks feed the city' });
    n = 3 + t * 2; out.push({ kind: 'hunt', stat: 'kills', goal: n, ico: '⚔️', text: 'Defeat ' + n + ' foes.', rw: { m: 28 * n, x: 14 * n, s: Math.round(2 * n * mult) }, why: 'the roads need clearing' });
    n = 150 * (t + 1); out.push({ kind: 'earn', stat: 'earn', goal: n, ico: '💰', text: 'Earn ' + n + ' gold.', rw: { m: Math.round(n * 0.3), x: Math.round(n * 0.15), s: Math.round(4 * mult) }, why: 'a working economy is a living one' });
    n = 3 + t * 2; out.push({ kind: 'sell', stat: 'sell', goal: n, ico: '🤝', text: 'Sell ' + n + ' goods at market.', rw: { m: 25 * n, x: 10 * n, s: Math.round(2 * n * mult) }, why: 'goods must move' });
    n = 1 + (t >= 2 ? 1 : 0); out.push({ kind: 'arcade', stat: 'arcadeWins', goal: n, ico: '🎮', text: 'Win ' + n + ' arcade match' + (n > 1 ? 'es' : '') + '.', rw: { m: 60 * n, x: 30 * n, s: Math.round(12 * n * mult) }, why: 'the arcade is where agents prove reflexes' });
    return out;
  }
  function feasibility(c) {
    var sp = ledger() ? ledger().get() : 0, rid = (typeof region !== 'undefined' && region && region.id) || '';
    switch (c.kind) {
      case 'fetch': return 0.8 + Math.min(1, held(c.good) / c.goal) * 0.8;
      case 'fish': return (held('rod') ? 1 : 0.35) * (/beach|meadow|forest/.test(rid) ? 1.2 : 1);
      case 'hunt': return (window.enemies && window.enemies.length ? 1.2 : 0.7) * (/darkforest|volcano|desert/.test(rid) ? 1.2 : 1);
      case 'arcade': return sp >= 10 ? 1 : 0.2;
      case 'sell': return 0.9 + Math.min(0.5, (typeof GOODS !== 'undefined' ? GOODS : []).reduce(function (a, g) { return a + held(g.id); }, 0) / 10);
      default: return 1;
    }
  }
  function decide(bot) {
    var cfg = cfgOf(bot), P = PERSONA[cfg.key] || PERSONA.shaddai, db = load(), r = rec(db, cfg.key), t = tier(r.trust);
    var best = null;
    candidates(cfg, t).forEach(function (c) {
      var recent = r.last.indexOf(c.kind) >= 0 ? 0.45 : 1;          // don't repeat yourself
      var need = c.kind === 'fetch' ? 0.6 + (c.need || 1) * 0.4 : 1;  // agents want what they pay most for
      c.score = (P.w[c.kind] || 0.5) * feasibility(c) * need * recent * (0.85 + Math.random() * 0.3);
      if (!best || c.score > best.score) best = c;
    });
    return best;
  }
  function progress(a) {
    if (!a) return 0;
    if (a.kind === 'fetch') return Math.min(a.goal, held(a.good));
    return Math.max(0, Math.min(a.goal, stat(a.stat) - a.base));
  }

  // ── public markers for the world renderer: '!' offer, '?' ready to turn in, '…' in progress ──
  function marker(bot) {
    var cfg = cfgOf(bot), r = load()[cfg.key];
    if (!r || !r.active) return '!';
    return progress(r.active) >= r.active.goal ? '?' : '…';
  }

  // ── UI: letterbox cutscene + dialog box ──
  var root, box, textEl, nameEl, choicesEl, askEl, cur = null, typer = 0, prevState = null;
  function css() {
    if (document.getElementById('agentDialogCss')) return;
    var s = document.createElement('style'); s.id = 'agentDialogCss';
    s.textContent = '#agentDialog{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:inherit}'
      + '#agentDialog .lb{position:absolute;left:0;right:0;height:0;background:#000;transition:height .28s ease}'
      + '#agentDialog.on .lb{height:9vh}#agentDialog .lb.t{top:0}#agentDialog .lb.b{bottom:0}'
      + '#agentDialog .box{position:absolute;left:50%;bottom:calc(9vh + 12px);transform:translate(-50%,16px);opacity:0;transition:all .25s ease;width:min(640px,calc(100vw - 32px));box-sizing:border-box;background:rgba(6,9,15,.94);border:1px solid rgba(232,196,92,.35);border-radius:12px;padding:14px 16px;pointer-events:auto;color:#eaf3fb;box-shadow:0 10px 40px rgba(0,0,0,.6)}'
      + '#agentDialog.on .box{transform:translate(-50%,0);opacity:1}'
      + '#agentDialog .nm{display:inline-block;font-weight:800;letter-spacing:.12em;font-size:12px;padding:3px 10px;border-radius:6px;border:1px solid;margin-bottom:8px}'
      + '#agentDialog .ttl{font-size:10px;color:#7a8794;margin-left:8px;letter-spacing:.08em}'
      + '#agentDialog .tx{font-size:14px;line-height:1.5;min-height:42px}'
      + '#agentDialog .why{font-size:11px;color:#7a8794;margin-top:6px;font-style:italic}'
      + '#agentDialog .ch{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}'
      + '#agentDialog .ch button{flex:1 1 120px;padding:8px 10px;border-radius:8px;border:1px solid rgba(232,196,92,.35);background:rgba(232,196,92,.06);color:#e8c45c;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;text-align:left}'
      + '#agentDialog .ch button:hover,#agentDialog .ch button:focus{background:rgba(232,196,92,.16);outline:none}'
      + '#agentDialog .ch button .k{opacity:.5;margin-right:6px}'
      + '#agentDialog .ask{display:none;margin-top:10px;gap:6px}#agentDialog .ask.on{display:flex}'
      + '#agentDialog .ask input{flex:1;min-width:0;background:#0e1420;color:#eaf3fb;border:1px solid #2a3346;border-radius:8px;padding:8px;font-family:inherit;font-size:13px}'
      + '#agentDialog .bar{height:5px;background:rgba(255,255,255,.1);border-radius:3px;margin-top:8px;overflow:hidden}#agentDialog .bar i{display:block;height:100%}';
    document.head.appendChild(s);
  }
  function build() {
    if (root) return;
    css();
    root = document.createElement('div'); root.id = 'agentDialog'; root.className = 'hide';
    root.innerHTML = '<div class="lb t"></div><div class="lb b"></div><div class="box"><div><span class="nm"></span><span class="ttl"></span></div>'
      + '<div class="tx"></div><div class="ch"></div><div class="ask"><input maxlength="200" placeholder="Ask anything…"><button>Send</button></div></div>';
    document.body.appendChild(root);
    box = root.querySelector('.box'); nameEl = root.querySelector('.nm'); textEl = root.querySelector('.tx');
    choicesEl = root.querySelector('.ch'); askEl = root.querySelector('.ask');
    askEl.querySelector('button').onclick = sendAsk;
  }
  // say(text, why) types plain text (never parsed as HTML); sayHtml is for our own markup only
  function whyEl(why) { var d = document.createElement('div'); d.className = 'why'; d.textContent = why; return d; }
  function say(text, why) {
    clearInterval(typer);
    var plain = String(text), i = 0;
    textEl.textContent = '';
    typer = setInterval(function () {
      i += 2; textEl.textContent = plain.slice(0, i);
      if (i >= plain.length) { clearInterval(typer); if (why) textEl.appendChild(whyEl(why)); }
    }, 16);
  }
  function sayHtml(html) { clearInterval(typer); textEl.innerHTML = html; }
  function choices(list) {
    choicesEl.innerHTML = '';
    list.forEach(function (c, i) {
      var b = document.createElement('button');
      b.innerHTML = '<span class="k">' + (i + 1) + '</span>' + c[0];
      b.onclick = c[1]; choicesEl.appendChild(b);
    });
  }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function e(s) { return typeof esc === 'function' ? esc(s) : String(s); }

  function open(bot) {
    if (!bot) return false;
    build();
    var cfg = cfgOf(bot), P = PERSONA[cfg.key] || PERSONA.shaddai;
    cur = { bot: bot, cfg: cfg, P: P };
    prevState = (typeof state !== 'undefined') ? state : 'world';
    try { state = 'dialog'; } catch (_) {}
    nameEl.textContent = cfg.name; nameEl.style.color = cfg.accent; nameEl.style.borderColor = cfg.accent;
    root.querySelector('.ttl').textContent = P.title + ' · trust ' + '★'.repeat(tier(rec(load(), cfg.key).trust)) + '☆'.repeat(3 - tier(rec(load(), cfg.key).trust));
    box.style.borderColor = cfg.accent + '66';
    root.classList.remove('hide'); requestAnimationFrame(function () { root.classList.add('on'); });
    try { document.getElementById('prompt').classList.add('hide'); } catch (_) {}
    home(pick(P.hi));
    return true;
  }
  function home(line) {
    var r = rec(load(), cur.cfg.key), a = r.active;
    var qLabel = !a ? '📜 Any work for me?' : progress(a) >= a.goal ? '✅ Turn in quest' : '📜 Quest status';
    askEl.classList.remove('on');
    say(line);
    choices([[qLabel, questMenu], ['💬 Talk', talk], ['🛒 Trade', trade], ['✨ Ask anything', ask], ['👋 Leave', close]]);
  }
  function talk() { say(pick(cur.P.talk)); choices([['↩ Back', function () { home(pick(cur.P.hi)); }], ['👋 Leave', close]]); }
  function trade() { var b = cur.bot; close(); if (typeof openBotShop === 'function') openBotShop(b); }
  function questMenu() {
    var db = load(), r = rec(db, cur.cfg.key), a = r.active;
    if (!a) {
      var q = decide(cur.bot); cur.offer = q;
      say(q.ico + ' ' + q.text + ' Reward: 💵' + q.rw.m + ' · ' + q.rw.x + ' XP · ⚡' + q.rw.s + '.', 'Why this: ' + q.why + '.');
      choices([['✔ Accept', accept], ['🔄 Something else?', function () { var db2 = load(); var r2 = rec(db2, cur.cfg.key); r2.last = [q.kind].concat(r2.last).slice(0, 3); save(db2); questMenu(); }], ['↩ Back', function () { home(pick(cur.P.hi)); }]]);
      return;
    }
    var p = progress(a), done = p >= a.goal, pct = Math.round(p / a.goal * 100);
    sayHtml(a.ico + ' ' + e(a.text) + '<div class="bar"><i style="width:' + pct + '%;background:' + (done ? '#4fe07a' : cur.cfg.accent) + '"></i></div><div class="why">' + p + ' / ' + a.goal + (done ? ' — ready to turn in.' : ' — keep going.') + '</div>');
    choices(done ? [['✅ Turn in', turnIn], ['↩ Back', function () { home(pick(cur.P.hi)); }]]
      : [['↩ Back', function () { home(pick(cur.P.hi)); }], ['✖ Abandon quest', abandon], ['👋 Leave', close]]);
  }
  function accept() {
    var q = cur.offer; if (!q) return;
    var db = load(), r = rec(db, cur.cfg.key);
    r.active = { kind: q.kind, good: q.good || null, stat: q.stat || null, goal: q.goal, ico: q.ico, text: q.text, rw: q.rw, base: q.stat ? stat(q.stat) : 0, t: Date.now() };
    r.last = [q.kind].concat(r.last.filter(function (k) { return k !== q.kind; })).slice(0, 3);
    save(db);
    say('Deal. Come back when it is done — I will be around.', 'Quest accepted: ' + q.text);
    choices([['👋 Leave', close]]);
  }
  function abandon() { var db = load(), r = rec(db, cur.cfg.key); r.active = null; save(db); home('Another time, then.'); }
  function turnIn() {
    var db = load(), r = rec(db, cur.cfg.key), a = r.active;
    if (!a || progress(a) < a.goal) { questMenu(); return; }
    if (a.kind === 'fetch') { inv[a.good] -= a.goal; if (inv[a.good] <= 0) delete inv[a.good]; }
    r.active = null; r.done++; r.trust++;
    save(db);
    try { money += a.rw.m; } catch (_) {}
    try { if (typeof addXP === 'function') addXP(a.rw.x); } catch (_) {}
    if (ledger() && a.rw.s > 0) ledger().add(a.rw.s, 'quest', cur.cfg.name + ' quest: ' + a.text);
    try { if (typeof saveEcon === 'function') saveEcon(); } catch (_) {}
    var up = tier(r.trust) > tier(r.trust - 1);
    say('Paid in full: 💵' + a.rw.m + ' · ' + a.rw.x + ' XP · ⚡' + a.rw.s + '.' + (up ? ' You have earned more of my trust — bigger work awaits.' : ''), up ? 'Trust tier ' + tier(r.trust) + ' unlocked with ' + cur.cfg.name + '.' : '');
    choices([['📜 More work?', questMenu], ['👋 Leave', close]]);
  }
  function ask() {
    say('Ask me anything. If the SHADDAI server is connected, my live brain answers.');
    askEl.classList.add('on');
    var i = askEl.querySelector('input'); i.value = ''; setTimeout(function () { i.focus(); }, 30);
    choices([['↩ Back', function () { home(pick(cur.P.hi)); }]]);
  }
  function offline(q) {
    q = q.toLowerCase();
    if (/spark|money|gold|earn|rich/.test(q)) return 'Quests, trades, the arcade and the Colosseum all pay into one sparks wallet. Start with a quest from me.';
    if (/quest|work|job|help/.test(q)) return 'I always have work. Pick "Any work for me?" and I will choose what fits you best right now.';
    if (/fish|pearl|water/.test(q)) return 'Cast near water, wait for STRIKE, then SPACE fast. One cast in a hundred hides a Void-Pearl.';
    if (/where|map|go|travel/.test(q)) return 'The transit hub takes you between regions. The city sits at the center of the compass.';
    if (/who|you/.test(q)) return 'I am ' + cur.cfg.name + ' — ' + cur.P.title + '. One of seven.';
    return pick(cur.P.talk);
  }
  function sendAsk() {
    var i = askEl.querySelector('input'), q = (i.value || '').trim(); if (!q || !cur) return;
    i.value = ''; say('…');
    var name = cur.cfg.name, c = cur;
    var p = typeof apiPost === 'function' ? apiPost('/api/agents/task', { agentName: name, task: 'Answer in character, one or two sentences, as ' + name + ' in the SHADDAI 2D realm: ' + q }) : Promise.resolve(null);
    p.then(function (d) {
      if (cur !== c) return;
      var out = d && (d.output && (d.output.text || d.output.result) || d.result || d.message);
      say(out ? String(out).slice(0, 400) : offline(q), out ? 'live brain' : 'offline — connect the SHADDAI server for live answers');
    });
  }
  function close() {
    if (!root || !cur) return;
    clearInterval(typer);
    root.classList.remove('on'); askEl.classList.remove('on');
    setTimeout(function () { if (!cur) root.classList.add('hide'); }, 260);
    cur = null;
    try { if (state === 'dialog') state = prevState === 'dialog' ? 'world' : (prevState || 'world'); } catch (_) {}
  }

  // keys: 1-5 pick, Esc leave. Capture phase so the world never sees them while talking.
  addEventListener('keydown', function (ev) {
    if (!cur) return;
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT' && root.contains(document.activeElement);
    ev.stopImmediatePropagation();
    if (typing) { if (ev.key === 'Enter') sendAsk(); if (ev.key === 'Escape') document.activeElement.blur(); return; }
    if (ev.key === 'Escape') { close(); return; }
    var n = parseInt(ev.key, 10);
    if (n >= 1 && n <= 9) { var b = choicesEl.children[n - 1]; if (b) b.click(); }
  }, true);

  // arcade wins feed the 'arcadeWins' quest stat
  function arcadeWin() { try { quest.arcadeWins = (quest.arcadeWins || 0) + 1; if (typeof saveEcon === 'function') saveEcon(); } catch (_) {} }

  window.AgentDialog = { open: open, close: close, marker: marker, decide: decide, progress: progress, arcadeWin: arcadeWin, isOpen: function () { return !!cur; }, _load: load };
})();
