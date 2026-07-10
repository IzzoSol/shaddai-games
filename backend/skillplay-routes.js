'use strict';
// ============================================================================
// backend/skillplay-routes.js — cross-game SKILLPLAY ability API
//
// Mount: app.use('/api/skillplay', require('./skillplay-routes'))
//
// Endpoints:
//   GET /api/skillplay/games              → list of games + ability counts
//   GET /api/skillplay/:game/catalog      → full ~8-ability pick list (SKILLPLAY)
//   GET /api/skillplay/:game/kit/:id      → DETERMINISTIC auto-matched abilities
//                                            for a council OR forged agent, from
//                                            their REAL skills. ?n=3 caps count.
//
// Scalable by design: a new forged agent needs no config — their equipped skills
// are tagged + scored against the game catalog automatically (see skillplay.js).
// ============================================================================

const express = require('express');
const router = express.Router();

const skillplay = require('./platform/skillplay');
const { agentAffinity } = require('./platform/affinity');

let operatives = null;
try { operatives = require('./lib/operatives'); } catch (_) { operatives = null; }

const COUNCIL = new Set(['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON']);

// GET /api/skillplay/games
router.get('/games', (_req, res) => {
  const games = skillplay.listGames().map(g => ({ game: g, abilities: skillplay.catalog(g).length }));
  res.json({ ok: true, games });
});

// GET /api/skillplay/:game/catalog
router.get('/:game/catalog', (req, res) => {
  const abilities = skillplay.catalog(req.params.game);
  if (!abilities.length) return res.status(404).json({ ok: false, error: 'unknown game' });
  res.json({ ok: true, game: skillplay.canonicalGame(req.params.game), abilities });
});

// GET /api/skillplay/:game/kit/:id?n=3
router.get('/:game/kit/:id', (req, res) => {
  try {
    const game = req.params.game;
    if (!skillplay.catalog(game).length) return res.status(404).json({ ok: false, error: 'unknown game' });
    const n = Math.max(1, Math.min(8, parseInt(req.query.n, 10) || 3));

    const raw = String(req.params.id || '').trim();
    const up = raw.toUpperCase();

    // Council agent — intrinsic domain only (no equipped skills)
    if (COUNCIL.has(up)) {
      const kit = skillplay.kitForAgent(game, { agentName: up, skills: [] }, n);
      return res.json({ ok: true, id: up, kind: 'council', ...kit });
    }

    // Forged operative — pull REAL equipped skills and auto-match
    const opId = raw.startsWith('op:') ? raw.slice(3) : raw;
    const op = operatives && operatives.get ? operatives.get(opId) : null;
    if (op) {
      const skills = Array.isArray(op.tools) ? op.tools : [];
      const kit = skillplay.kitForAgent(game, { agentName: op.codename || '', skills }, n);
      return res.json({ ok: true, id: op.id, kind: 'operative', codename: op.codename || null, archetype: op.archetype || null, ...kit });
    }

    // Unknown — neutral profile still yields a deterministic (if generic) kit
    const kit = skillplay.kitForAgent(game, { agentName: raw, skills: [] }, n);
    return res.json({ ok: true, id: raw, kind: 'unknown', ...kit });
  } catch (err) {
    console.error('[skillplay-routes] kit error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
