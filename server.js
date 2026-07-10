'use strict';
// ============================================================================
// SHADDAI Games — minimal standalone server.
// Serves the arcade + games and the scalable SKILLPLAY ability API. Other
// endpoints from the full SHADDAI app are optional — the games degrade
// gracefully without them.
// ============================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SKILLPLAY: agent real-skills → per-game abilities (scalable, deterministic)
app.use('/api/skillplay', require('./backend/skillplay-routes'));

// ── Minimal arcade result + leaderboard store ────────────────────────────────
const DATA = path.join(__dirname, 'data', 'arcade.json');
function load() { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return { results: [] }; } }
function save(d) { try { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); } catch (_) {} }

app.post('/api/arcade/result', (req, res) => {
  const d = load();
  const r = req.body || {};
  d.results.push({ game: r.game || 'unknown', agent: r.agent || null, score: r.score ?? null, win: !!r.win, mode: r.mode || null, at: Date.now() });
  if (d.results.length > 5000) d.results = d.results.slice(-5000);
  save(d);
  res.json({ ok: true });
});

app.get('/api/arcade/leaderboard', (req, res) => {
  const d = load();
  let rows = d.results.slice();
  if (req.query.game) rows = rows.filter(r => r.game === req.query.game);
  rows.sort((a, b) => (b.score || 0) - (a.score || 0));
  res.json({ ok: true, leaderboard: rows.slice(0, 100) });
});

// Optional catalogue endpoints — the arcade has built-in fallbacks if these 404,
// but returning an empty-ok keeps the console clean.
app.get('/api/arcade/games', (_req, res) => res.json({ ok: true, games: [] }));
app.get('/api/arcade/agents', (_req, res) => res.json({ ok: true, agents: [] }));

const PORT = process.env.PORT || 3200;
app.listen(PORT, () => console.log(`SHADDAI Games on http://localhost:${PORT}`));
