/* Fallible Engine v1 — agent engine where council bots play IMPERFECTLY on purpose.
 * Stable personalities, softmax move selection (temperature from personality x focus,
 * tilt degrades focus after losses), emergent outcomes (never scripted, never forced
 * draws), every decision recorded as a trace, Elo per agent per game, between-match
 * learning (evaluation weights nudged toward choices that preceded wins).
 * Pure JS, no dependencies. Exposes window.FallibleEngine in the browser; in Node
 * (vm harness) it also sets module.exports. Games must still work if this file
 * fails to load — they keep their built-in bots as fallback.
 * Persistence: localStorage keys fallible.agents.v1 / fallible.traces.v1.
 * Design: ~/workspace/shaddai-agent-engine-design.md — E1, 2026-11-21.
 * E8, 2026-11-21: per-tag learning — each tag is credited/blamed by how
 * much more it was picked in a match than its own historical pick share
 * (baseline-relative credit), so agents develop actual strategies instead
 * of a uniform confidence shift.
 * E10, 2026-11-21: per-game trace caps + chunked export. The old single
 * global cap (newest 5000 traces, any game) starved whichever game ran
 * first in a multi-game batch. Each game now keeps its own newest
 * MAX_TRACES_PER_GAME traces, under a global MAX_TRACES_TOTAL ceiling
 * (localStorage budget guard). Every drop is counted per game
 * (droppedByGame) and reported by stats() and in export chunk headers —
 * never silent. exportTraces() stays pure JSONL; exportTracesChunked(n)
 * splits it into labelled chunks and exportTracesByGame(g) exports one
 * game, so a batch bigger than any cap still exports completely.
 * E28, 2026-11-21: API VERSIONING. Two version numbers, kept separate:
 *   - VERSION ('1.3.1') is the ENGINE release (semver: MAJOR = breaking
 *     API change, MINOR = new capability, PATCH = fix). It is exposed as
 *     FallibleEngine.VERSION and stamped on every persisted store.
 *   - TRACE_FORMAT_VERSION (1) is the ON-DISK trace format: the shape of
 *     one JSONL trace line and of the persisted store envelope. It only
 *     increments when a reader written for the old shape could misread
 *     the new one. Every trace line now carries v:<format>; the store
 *     envelope carries formatVersion + engineVersion.
 * Compatibility rule (fail closed, never silently misread):
 *   - No version fields at all = legacy (v1.0.0–v1.2.0 output): accepted,
 *     reported as legacy-unversioned, stamped on next save.
 *   - formatVersion == TRACE_FORMAT_VERSION: accepted.
 *   - formatVersion > TRACE_FORMAT_VERSION: REJECTED — the store loads
 *     as empty in memory, stats().lastLoadRejected names it, and persist()
 *     refuses to write while the rejection stands, so an old engine can
 *     never clobber a newer store. checkCompatibility() is the public
 *     probe for this: consumers (league page, trace-report.js, games)
 *     call it before trusting a store, export, or chunk header.
 * Storage keys stay fallible.agents.v1 / fallible.traces.v1 while the
 * format is v1; a format bump is the ONLY event that renames the keys
 * (v1 -> v2), and then the old key is read once for migration, never
 * overwritten. The agents snapshot (fallible.agents.v1) is a plain map
 * with no envelope; its version is the traces store's engineVersion,
 * written by the same persist() call.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FallibleEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var VERSION = '1.3.1';
  // E28: on-disk trace format version. Increments ONLY when a reader for
  // the old shape could misread the new one; engine VERSION moves freely.
  var TRACE_FORMAT_VERSION = 1;
  var START_ELO = 1200;
  var K_FACTOR = 24;
  // E10: per-game caps replace the old single global cap. Each game keeps
  // its own newest traces, so a long batch in one game cannot starve
  // another; the global ceiling is only a localStorage budget guard.
  var MAX_TRACES_PER_GAME = 5000; // cap stored decision traces, per game
  var MAX_TRACES_TOTAL = 10000;   // global ceiling across all games
  var MAX_MATCHES = 1000;     // cap stored match records
  var WEIGHT_CLAMP = 0.5;     // learning weights bounded to [-0.5, 0.5]
  var WIN_NUDGE = 0.02;       // per-pick weight nudge on a win, scaled by learnRate
  var LOSS_NUDGE = 0.01;      // per-pick weight nudge on a loss, scaled by learnRate

  // ---- Personalities: the 8 council bots. Every value in 0..1. ----
  var PERSONALITIES = {
    ASIMOV:   { aggression: 0.50, caution: 0.50, risk: 0.40, focus: 0.90, tilt: 0.15, curiosity: 0.40, learnRate: 0.60 },
    SHADDAI:  { aggression: 0.35, caution: 0.65, risk: 0.30, focus: 0.85, tilt: 0.10, curiosity: 0.45, learnRate: 0.50 },
    ZEROX:    { aggression: 0.90, caution: 0.15, risk: 0.90, focus: 0.55, tilt: 0.85, curiosity: 0.50, learnRate: 0.70 },
    ORACLE:   { aggression: 0.20, caution: 0.70, risk: 0.25, focus: 0.85, tilt: 0.10, curiosity: 0.85, learnRate: 0.55 },
    NEXUS:    { aggression: 0.55, caution: 0.40, risk: 0.60, focus: 0.65, tilt: 0.40, curiosity: 0.80, learnRate: 0.75 },
    TURTLE:   { aggression: 0.25, caution: 0.85, risk: 0.20, focus: 0.80, tilt: 0.05, curiosity: 0.30, learnRate: 0.35 },
    QUILL:    { aggression: 0.50, caution: 0.35, risk: 0.65, focus: 0.60, tilt: 0.45, curiosity: 0.90, learnRate: 0.65 },
    PIKADON:  { aggression: 0.30, caution: 0.80, risk: 0.25, focus: 0.90, tilt: 0.15, curiosity: 0.35, learnRate: 0.45 }
  };

  // ---- Storage shim: localStorage in the browser, in-memory under Node. ----
  var memStore = {};
  var store = {
    get: function (k) {
      try {
        if (typeof localStorage !== 'undefined') return localStorage.getItem(k);
      } catch (e) { /* storage unavailable: fall through to memory */ }
      return Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null;
    },
    set: function (k, v) {
      try {
        if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return; }
      } catch (e) { /* fall through to memory */ }
      memStore[k] = v;
    }
  };
  var AGENTS_KEY = 'fallible.agents.v1';
  var TRACES_KEY = 'fallible.traces.v1';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---- Agent state ----
  // createAgent(id) -> { id, personality, weights:{}, elo:{perGame}, form:[], tiltLevel }
  function createAgent(id) {
    var p = PERSONALITIES[id];
    if (!p) throw new Error('FallibleEngine: unknown agent id ' + id);
    return {
      id: id,
      personality: clone(p),
      weights: {},            // tag -> learned bonus, starts at 0
      tagCounts: {},          // E8: running picks per tag (learning baseline)
      tagDecisions: 0,        // E8: total tagged decisions (baseline denominator)
      elo: {},                // gameId -> rating (defaults to START_ELO)
      form: [],               // recent outcomes, newest last, max 10: 'W' | 'L' | 'D'
      tiltLevel: 0            // 0..1, rises on losses, cools on wins
    };
  }

  function eloOf(agent, gameId) {
    return agent.elo[gameId] || START_ELO;
  }

  // Temperature: low focus / high tilt / time pressure => hotter (more blunders).
  // Patient high-focus bots (SHADDAI, ORACLE, PIKADON) run cold; ZEROX runs hot.
  function temperature(agent, context) {
    var p = agent.personality;
    var timePressure = (context && typeof context.timePressure === 'number')
      ? context.timePressure : 0;
    var focusNow = p.focus * (1 - agent.tiltLevel * p.tilt);
    var t = 0.10 + (1 - focusNow) * 0.55 + timePressure * 0.25;
    return Math.max(0.05, Math.min(1.5, t));
  }

  function softmaxPick(options, temp, rand) {
    // options: [{key, score, tag?}] — scores are the GAME's heuristic; engine
    // adds the agent's learned weight for the option's tag, then softmax-samples.
    var max = -Infinity, i, s;
    var eff = new Array(options.length);
    for (i = 0; i < options.length; i++) {
      eff[i] = options[i].score; // weights applied by caller via effectiveScores
    }
    for (i = 0; i < options.length; i++) if (eff[i] > max) max = eff[i];
    var sum = 0, exps = new Array(options.length);
    for (i = 0; i < options.length; i++) {
      exps[i] = Math.exp((eff[i] - max) / temp);
      sum += exps[i];
    }
    var r = (rand || Math.random)() * sum;
    for (i = 0; i < options.length; i++) {
      r -= exps[i];
      if (r <= 0) return i;
    }
    return options.length - 1;
  }

  // decide(agent, gameId, options, context) -> { pick, trace }
  // pick is the chosen option object; trace is the recorded decision entry.
  function decide(agent, gameId, options, context) {
    if (!options || options.length === 0) throw new Error('FallibleEngine.decide: no options');
    var temp = temperature(agent, context || {});
    var scored = options.map(function (o) {
      var w = (o.tag && agent.weights[o.tag]) ? agent.weights[o.tag] : 0;
      return { key: o.key, score: o.score, tag: o.tag || null, effScore: o.score + w };
    });
    var idx = softmaxPick(scored.map(function (s) {
      return { key: s.key, score: s.effScore };
    }), temp);
    var pick = options[idx];
    var entry = {
      v: TRACE_FORMAT_VERSION, // E28: every trace line carries its format
      t: Date.now(),
      gameId: gameId,
      agentId: agent.id,
      options: scored,
      pick: pick.key,
      pickTag: pick.tag || null,
      temperature: +temp.toFixed(4),
      tiltLevel: +agent.tiltLevel.toFixed(4)
    };
    recordTrace(entry);
    return { pick: pick, trace: entry };
  }

  // ---- Traces + matches (in-memory + persisted, capped per game) ----
  var traces = [];   // decision entries
  var matches = [];  // match records {gameId, agentId, opponentId, outcome, decisions}
  var traceCount = 0;               // lifetime traces ever recorded
  var droppedByGame = {};          // E10: traces dropped by the caps, per game
  var traceCountsByGame = {};      // E10: stored traces per game (derived)
  var loaded = false;

  function droppedTotal() {
    var n = 0;
    Object.keys(droppedByGame).forEach(function (g) { n += droppedByGame[g]; });
    return n;
  }

  // ---- E28: version compatibility (fail closed) ----
  // lastLoadRejected: null, or {formatVersion, engineVersion, reason} when
  // this engine refused a newer store. loadBlocked: while true, persist()
  // refuses to write, so an old engine can never clobber a newer store.
  var lastLoadRejected = null;
  var loadBlocked = false;

  // checkCompatibility(input) -> {ok, formatVersion, engineVersion, reason}
  // Accepts a persisted store object, one trace entry, a '# ...' chunk
  // header line, or a parsed header object {version, format, ...}.
  //   ok + 'legacy-unversioned': no version fields anywhere (v1.0.0–v1.2.0
  //     output); readable as format 1, stamped on next save.
  //   ok + 'compatible': formatVersion == TRACE_FORMAT_VERSION.
  //   !ok + 'unsupported-format-version': formatVersion newer than this
  //     engine understands — do NOT read it, do NOT overwrite it.
  //   !ok + 'invalid-format-version': a version field that is not a number.
  function checkCompatibility(input) {
    var formatVersion = null, engineVersion = null, source = null;
    if (typeof input === 'string') {
      if (input.charAt(0) !== '#') {
        return { ok: false, formatVersion: null, engineVersion: null, reason: 'unparseable-input' };
      }
      source = {};
      input.slice(1).trim().split(/\s+/).forEach(function (tok) {
        var eq = tok.indexOf('=');
        if (eq > 0) source[tok.slice(0, eq)] = tok.slice(eq + 1);
      });
    } else if (input && typeof input === 'object') {
      source = input;
    } else {
      return { ok: false, formatVersion: null, engineVersion: null, reason: 'unparseable-input' };
    }
    if (typeof source.formatVersion !== 'undefined') {
      formatVersion = source.formatVersion;
      engineVersion = (typeof source.engineVersion === 'string') ? source.engineVersion : null;
    } else if (typeof source.v !== 'undefined') {
      formatVersion = source.v; // single trace entry
    } else if (typeof source.format !== 'undefined') {
      formatVersion = source.format; // parsed chunk header
      engineVersion = (typeof source.version === 'string') ? source.version : null;
    }
    if (formatVersion === null || formatVersion === undefined) {
      return { ok: true, formatVersion: null, engineVersion: engineVersion, reason: 'legacy-unversioned' };
    }
    var n = (typeof formatVersion === 'number') ? formatVersion : Number(formatVersion);
    if (isNaN(n) || Math.floor(n) !== n) {
      return { ok: false, formatVersion: null, engineVersion: engineVersion, reason: 'invalid-format-version' };
    }
    if (n > TRACE_FORMAT_VERSION) {
      return { ok: false, formatVersion: n, engineVersion: engineVersion, reason: 'unsupported-format-version' };
    }
    return { ok: true, formatVersion: n, engineVersion: engineVersion, reason: 'compatible' };
  }

  // E10: enforce the caps on the in-memory array, oldest-first, counting
  // every drop per game. Called after each push and after loading a store
  // (a store written under different caps may arrive over-cap).
  function enforceCaps() {
    var g, i;
    var over = true;
    while (over) {
      over = false;
      for (g in traceCountsByGame) {
        if (traceCountsByGame[g] > MAX_TRACES_PER_GAME) {
          for (i = 0; i < traces.length; i++) {
            if (traces[i].gameId === g) {
              traces.splice(i, 1);
              traceCountsByGame[g]--;
              droppedByGame[g] = (droppedByGame[g] || 0) + 1;
              over = true;
              break;
            }
          }
        }
      }
    }
    while (traces.length > MAX_TRACES_TOTAL) {
      var dropped = traces.shift();
      traceCountsByGame[dropped.gameId]--;
      droppedByGame[dropped.gameId] = (droppedByGame[dropped.gameId] || 0) + 1;
    }
  }

  function rebuildCounts() {
    traceCountsByGame = {};
    traces.forEach(function (e) {
      traceCountsByGame[e.gameId] = (traceCountsByGame[e.gameId] || 0) + 1;
    });
  }

  function loadPersisted() {
    if (loaded) return;
    loaded = true;
    try {
      var a = store.get(AGENTS_KEY);
      if (a) persistedAgents = JSON.parse(a);
      var t = store.get(TRACES_KEY);
      if (t) {
        var parsed = JSON.parse(t);
        // E28: a store from a NEWER engine is rejected, not misread — and
        // the rejection blocks later writes (see persist) so this engine
        // can never clobber data it cannot understand.
        var compat = checkCompatibility(parsed);
        if (!compat.ok) {
          lastLoadRejected = {
            formatVersion: compat.formatVersion,
            engineVersion: compat.engineVersion,
            reason: compat.reason
          };
          loadBlocked = true;
          traces = []; matches = []; traceCount = 0;
          droppedByGame = {}; traceCountsByGame = {};
          persistedAgents = {}; // future agent snapshots are not ours to use
          return;
        }
        traces = parsed.traces || [];
        matches = parsed.matches || [];
        traceCount = parsed.traceCount || traces.length;
        // E10 fields; old (v1.1.0) stores lack them and load clean as 0.
        droppedByGame = parsed.droppedByGame || {};
        if (parsed.caps) {
          if (typeof parsed.caps.perGame === 'number') MAX_TRACES_PER_GAME = parsed.caps.perGame;
          if (typeof parsed.caps.total === 'number') MAX_TRACES_TOTAL = parsed.caps.total;
        }
        rebuildCounts();
        enforceCaps();
      }
    } catch (e) { /* corrupted store: start clean */ }
  }

  var persistedAgents = {};

  function persist() {
    // E28: never write over a store this engine refused to read.
    if (loadBlocked) return;
    try {
      store.set(AGENTS_KEY, JSON.stringify(persistedAgents));
      store.set(TRACES_KEY, JSON.stringify({
        formatVersion: TRACE_FORMAT_VERSION, // E28: versioned envelope
        engineVersion: VERSION,
        traces: traces,
        matches: matches.slice(-MAX_MATCHES),
        traceCount: traceCount,
        droppedByGame: droppedByGame,
        caps: { perGame: MAX_TRACES_PER_GAME, total: MAX_TRACES_TOTAL }
      }));
    } catch (e) { /* storage full/unavailable: in-memory state still valid */ }
  }

  function recordTrace(entry) {
    loadPersisted();
    traces.push(entry);
    traceCount++;
    traceCountsByGame[entry.gameId] = (traceCountsByGame[entry.gameId] || 0) + 1;
    enforceCaps();
    // Persist throttled: stringifying the whole capped store on every decision
    // is O(n^2) over a batch. Flush every 200 traces; recordResult flushes too.
    if (traceCount % 200 === 0) persist();
  }

  // applyMatchSide(agent, gameId, opponentId, outcome, trace, forced)
  // Shared per-agent update behind recordResult/recordMatch: Elo (K=24 vs
  // opponent, vs 1200 field for solo), form, tilt, learned-weight nudges,
  // persisted agent snapshot. forced = {myElo, oppElo, next} overrides the
  // Elo computation (paired matches compute both sides from live ratings).
  // Returns {elo, delta, tiltLevel, eloBefore, oppElo, decisions}.
  // Pushes NO match record — callers own the record shape (see below).
  function applyMatchSide(agent, gameId, opponentId, outcome, trace, forced) {
    loadPersisted();
    if (outcome !== 'win' && outcome !== 'loss' && outcome !== 'draw') {
      throw new Error('FallibleEngine.recordResult: bad outcome ' + outcome);
    }
    var myElo, oppElo, next;
    if (forced) {
      myElo = forced.myElo; oppElo = forced.oppElo; next = forced.next;
    } else {
      myElo = eloOf(agent, gameId);
      oppElo = START_ELO;
      if (opponentId && persistedAgents[opponentId]) {
        oppElo = persistedAgents[opponentId].elo[gameId] || START_ELO;
      }
      var expected = 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
      var actual = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      next = Math.round(myElo + K_FACTOR * (actual - expected));
    }
    agent.elo[gameId] = next;

    // Form: newest last, keep last 10.
    agent.form.push(outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'D');
    if (agent.form.length > 10) agent.form = agent.form.slice(-10);

    // Tilt: losses raise it (scaled by personality tilt), wins cool it.
    var p = agent.personality;
    if (outcome === 'loss') agent.tiltLevel = Math.min(1, agent.tiltLevel + 0.12 * p.tilt + 0.03);
    else if (outcome === 'win') agent.tiltLevel = Math.max(0, agent.tiltLevel - 0.15);
    else agent.tiltLevel = Math.max(0, agent.tiltLevel - 0.05);

    // E8 per-tag learning (baseline-relative credit): each tag is credited /
    // blamed by how much MORE it was picked in this match than its own
    // historical pick share — win -> over-used tags rise, under-used fall;
    // loss -> the reverse. A tag that features more in wins than in losses
    // rises even on a losing agent, and vice versa, so agents develop
    // actual strategies (per-tag divergence) instead of the v1.0.0 uniform
    // confidence shift. The baseline is the agent's running pick share per
    // tag (Laplace-smoothed; uniform over this match's tags when no history
    // yet). Draws: no nudge (no signal). Bounded so learning never explodes.
    var entries = Array.isArray(trace) ? trace : (trace ? [trace] : []);
    if (outcome !== 'draw' && entries.length > 0) {
      var dir = outcome === 'win' ? 1 : -1;
      var step = (outcome === 'win' ? WIN_NUDGE : LOSS_NUDGE) * p.learnRate * dir;
      var counts = {}, tagged = 0;
      entries.forEach(function (e) {
        if (!e || !e.pickTag) return;
        counts[e.pickTag] = (counts[e.pickTag] || 0) + 1;
        tagged++;
      });
      if (tagged > 0) {
        var tagsUsed = Object.keys(counts);
        var distinct = Object.keys(agent.tagCounts).length || tagsUsed.length;
        var total = agent.tagDecisions || 0;
        tagsUsed.forEach(function (tag) {
          var share = counts[tag] / tagged;
          var expected = total > 0
            ? ((agent.tagCounts[tag] || 0) + 1) / (total + distinct)
            : 1 / tagsUsed.length;
          var w = (agent.weights[tag] || 0) + step * (share - expected);
          agent.weights[tag] = Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, +w.toFixed(4)));
        });
      }
      // Fold this match into the running baseline AFTER computing expected.
      Object.keys(counts).forEach(function (tag) {
        agent.tagCounts[tag] = (agent.tagCounts[tag] || 0) + counts[tag];
      });
      agent.tagDecisions = (agent.tagDecisions || 0) + tagged;
    }

    persistedAgents[agent.id] = {
      id: agent.id, weights: agent.weights, elo: agent.elo,
      form: agent.form, tiltLevel: agent.tiltLevel,
      tagCounts: agent.tagCounts, tagDecisions: agent.tagDecisions
    };
    persist();
    return {
      elo: next, delta: next - myElo, tiltLevel: agent.tiltLevel,
      eloBefore: myElo, oppElo: oppElo, decisions: entries.length
    };
  }

  // recordResult(agent, gameId, opponentId|null, outcome, trace)
  // Single-agent result (solo games, or direct calls): one match record.
  function recordResult(agent, gameId, opponentId, outcome, trace) {
    var r = applyMatchSide(agent, gameId, opponentId, outcome, trace, null);
    matches.push({
      gameId: gameId, agentId: agent.id, opponentId: opponentId || null,
      outcome: outcome, decisions: r.decisions, t: Date.now(),
      eloBefore: r.eloBefore, eloAfter: r.elo, oppElo: r.oppElo
    });
    if (matches.length > MAX_MATCHES) matches = matches.slice(-MAX_MATCHES);
    persist();
    return { elo: r.elo, delta: r.delta, tiltLevel: r.tiltLevel };
  }

  // Opponent Elo lookup helper for harnesses that hold both agents in memory:
  // recordResult reads persisted state, so callers that simulate a match should
  // pass the opponent's agent object via recordMatch (below) instead.

  // recordMatch(a, b, gameId, outcomeForA, traceA, traceB)
  // One match, ONE record: both sides rated against the other's live rating,
  // then a single canonical record (agentId = a, outcome from a's perspective,
  // both sides' pre/post Elo). Counting matches from the record list is exact.
  function recordMatch(a, b, gameId, outcomeForA, traceA, traceB) {
    var eloA = eloOf(a, gameId), eloB = eloOf(b, gameId);
    function eloDelta(me, opp, outcome) {
      var exp = 1 / (1 + Math.pow(10, (opp - me) / 400));
      var act = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      return Math.round(me + K_FACTOR * (act - exp)) - me;
    }
    var dA = eloDelta(eloA, eloB, outcomeForA);
    var flip = outcomeForA === 'win' ? 'loss' : outcomeForA === 'loss' ? 'win' : 'draw';
    var dB = eloDelta(eloB, eloA, flip);
    var rA = applyMatchSide(a, gameId, b.id, outcomeForA, traceA,
      { myElo: eloA, oppElo: eloB, next: eloA + dA });
    var rB = applyMatchSide(b, gameId, a.id, flip, traceB,
      { myElo: eloB, oppElo: eloA, next: eloB + dB });
    matches.push({
      gameId: gameId, agentId: a.id, opponentId: b.id,
      outcome: outcomeForA, decisions: rA.decisions + rB.decisions, t: Date.now(),
      eloBefore: eloA, eloAfter: eloA + dA, oppElo: eloB, oppEloAfter: eloB + dB
    });
    if (matches.length > MAX_MATCHES) matches = matches.slice(-MAX_MATCHES);
    persist();
    return { a: { elo: a.elo[gameId], delta: dA }, b: { elo: b.elo[gameId], delta: dB } };
  }

  // loadAgent(id): createAgent hydrated from persisted state (weights, Elo,
  // form, tilt) so a page can keep playing the same agents across sessions.
  function loadAgent(id) {
    loadPersisted();
    var ag = createAgent(id);
    var saved = persistedAgents[id];
    if (saved) {
      if (saved.weights) ag.weights = clone(saved.weights);
      if (saved.tagCounts) ag.tagCounts = clone(saved.tagCounts);
      if (typeof saved.tagDecisions === 'number') ag.tagDecisions = saved.tagDecisions;
      if (saved.elo) ag.elo = clone(saved.elo);
      if (saved.form) ag.form = saved.form.slice();
      if (typeof saved.tiltLevel === 'number') ag.tiltLevel = saved.tiltLevel;
    }
    return ag;
  }

  // standings(): persisted per-agent state for the league page. Every council
  // id is present; agents with no matches yet show start Elo and empty form.
  function standings() {
    loadPersisted();
    var out = {};
    Object.keys(PERSONALITIES).forEach(function (id) {
      var s = persistedAgents[id];
      out[id] = s ? clone(s) : {
        id: id, weights: {}, elo: {}, form: [], tiltLevel: 0
      };
    });
    return out;
  }

  // recentMatches(n): newest-first match records (with pre/post Elo, so the
  // league page can spot upsets honestly). Read-only copy.
  function recentMatches(n) {
    loadPersisted();
    var list = matches.slice(-(n || 20)).reverse();
    return clone(list);
  }

  function exportTraces() {
    loadPersisted();
    return traces.map(function (e) { return JSON.stringify(e); }).join('\n');
  }

  // E10: one game's traces only, pure JSONL (same shape as exportTraces).
  function exportTracesByGame(gameId) {
    loadPersisted();
    return traces.filter(function (e) { return e.gameId === gameId; })
      .map(function (e) { return JSON.stringify(e); }).join('\n');
  }

  // E10: chunked export. Returns [{index, totalChunks, lines, header, text}]
  // where text is a `# ...` header line (parseable key=value pairs, skipped
  // by trace-report.js) followed by at most chunkSize JSONL lines. The
  // chunks concatenate back to exportTraces() exactly, in order.
  function exportTracesChunked(chunkSize) {
    loadPersisted();
    if (!chunkSize || chunkSize < 1 || Math.floor(chunkSize) !== chunkSize) {
      throw new Error('FallibleEngine.exportTracesChunked: chunkSize must be a positive integer');
    }
    var totalChunks = Math.max(1, Math.ceil(traces.length / chunkSize));
    var out = [];
    var gamesSeen = {};
    traces.forEach(function (e) { gamesSeen[e.gameId] = true; });
    var gamesList = Object.keys(gamesSeen).sort().join(',');
    for (var c = 0; c < totalChunks; c++) {
      var slice = traces.slice(c * chunkSize, (c + 1) * chunkSize);
      var chunkGames = {};
      slice.forEach(function (e) { chunkGames[e.gameId] = true; });
      var header = '# fallible-traces version=' + VERSION +
        ' format=' + TRACE_FORMAT_VERSION +
        ' chunk=' + (c + 1) + '/' + totalChunks +
        ' lines=' + slice.length +
        ' storedTotal=' + traces.length +
        ' droppedTotal=' + droppedTotal() +
        ' capPerGame=' + MAX_TRACES_PER_GAME +
        ' capTotal=' + MAX_TRACES_TOTAL +
        ' games=' + Object.keys(chunkGames).sort().join(',');
      out.push({
        index: c + 1, totalChunks: totalChunks, lines: slice.length,
        header: header,
        text: header + '\n' + slice.map(function (e) { return JSON.stringify(e); }).join('\n')
      });
    }
    return out;
  }

  function stats() {
    loadPersisted();
    return {
      version: VERSION, formatVersion: TRACE_FORMAT_VERSION,
      lastLoadRejected: lastLoadRejected ? clone(lastLoadRejected) : null,
      traceCount: traceCount,
      tracesStored: traces.length, matchesStored: matches.length,
      agentsPersisted: Object.keys(persistedAgents).length,
      tracesStoredByGame: clone(traceCountsByGame),
      droppedByGame: clone(droppedByGame),
      droppedTotal: droppedTotal(),
      caps: { perGame: MAX_TRACES_PER_GAME, total: MAX_TRACES_TOTAL }
    };
  }

  function reset() {
    traces = []; matches = []; traceCount = 0; persistedAgents = {}; loaded = true;
    droppedByGame = {}; traceCountsByGame = {};
    lastLoadRejected = null; loadBlocked = false; // E28: clear rejection
    MAX_TRACES_PER_GAME = 5000; MAX_TRACES_TOTAL = 10000;
    persist();
  }

  // Test-only seam: swap the in-memory store so harnesses can isolate runs.
  function _resetForTest() { reset(); }

  // E10 test-only seam: shrink the caps so a harness can prove the drop
  // machinery actually drops and counts, without playing 5000+ decisions.
  // Resets the trace store first so the probe starts clean; caps return to
  // defaults on the next _resetForTest().
  function _setCapsForTest(perGame, total) {
    if (!perGame || !total || perGame < 1 || total < 1) {
      throw new Error('FallibleEngine._setCapsForTest: caps must be positive');
    }
    traces = []; matches = []; traceCount = 0;
    droppedByGame = {}; traceCountsByGame = {};
    lastLoadRejected = null; loadBlocked = false; // E28: clear rejection
    MAX_TRACES_PER_GAME = perGame; MAX_TRACES_TOTAL = total;
    loaded = true;
    persist();
  }

  return {
    VERSION: VERSION,
    TRACE_FORMAT_VERSION: TRACE_FORMAT_VERSION,
    checkCompatibility: checkCompatibility,
    START_ELO: START_ELO,
    K_FACTOR: K_FACTOR,
    PERSONALITIES: PERSONALITIES,
    createAgent: createAgent,
    loadAgent: loadAgent,
    standings: standings,
    recentMatches: recentMatches,
    decide: decide,
    recordResult: recordResult,
    recordMatch: recordMatch,
    exportTraces: exportTraces,
    exportTracesByGame: exportTracesByGame,
    exportTracesChunked: exportTracesChunked,
    // E48: explicit flush — persist() is throttled (every 200 traces), so a
    // game that saves mid-season must be able to land the unflushed traces
    // before the tab closes, or a fresh load silently loses up to 199 of them.
    flush: function () { persist(); },
    stats: stats,
    temperature: temperature,
    eloOf: eloOf,
    _resetForTest: _resetForTest,
    _setCapsForTest: _setCapsForTest
  };
});
