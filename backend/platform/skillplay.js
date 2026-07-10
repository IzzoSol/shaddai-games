'use strict';
// ============================================================================
// backend/platform/skillplay.js — SHADDAI cross-game SKILLPLAY ability engine
//
// ONE scalable, DETERMINISTIC system that maps an agent's REAL skills onto a
// game's abilities. Works for the 7 council agents AND any forged agent — a
// forged agent's equipped skills are tagged (via affinity.js KEYWORD_TAGS) into
// the 10-trait profile, then scored against each game's ability catalog. No
// randomness: same skills → same abilities, every time. Add a game by adding a
// catalog entry below; add an ability by adding one row. Nothing else changes.
//
// Pure + deterministic. Depends only on affinity.js.
// ============================================================================

const { agentAffinity } = require('./affinity');

// ── PER-GAME ABILITY CATALOGS ────────────────────────────────────────────────
// Each ability: { id, name, desc, effect, tags:{trait:weight} }
//   effect = a keyword the game frontend reads to apply the boost.
//   tags   = which of the 10 affinity traits this ability expresses. The matcher
//            scores an agent's trait-profile against these to auto-assign kits.
// ~8 abilities per game so SKILLPLAY has a full, meaningful pick list.
const CATALOGS = {
  gridiron: [
    { id:'cannon_arm',    name:'Cannon Arm',    desc:'Elite throw zip + accuracy on deep/mid routes.',        effect:'throwAccuracy+', tags:{ precision:3, analysis:1 } },
    { id:'field_general', name:'Field General', desc:'Reads coverage, decides fast under pressure.',           effect:'decision+',      tags:{ analysis:3, support:2 } },
    { id:'sticky_hands',  name:'Sticky Hands',  desc:'Catches contested + off-target throws.',                 effect:'catching+',      tags:{ control:3, precision:2 } },
    { id:'ankle_breaker', name:'Ankle Breaker', desc:'Juke step leaves defenders grasping air.',               effect:'evasion+',       tags:{ speed:3, control:2 } },
    { id:'truck_stick',   name:'Truck Stick',   desc:'Runs through the first tackle for extra yards.',         effect:'runPower+',      tags:{ power:3, aggression:1 } },
    { id:'burner',        name:'Burner',        desc:'Top-end speed that wins every deep route.',              effect:'speed+',         tags:{ speed:3, aggression:1 } },
    { id:'lockdown',      name:'Lockdown',      desc:'Blanket man coverage erases a receiver.',                effect:'coverage+',      tags:{ defense:3, reaction:2 } },
    { id:'big_hit',       name:'Big Hit',       desc:'Thunderous tackle jars the ball loose.',                 effect:'tackle+',        tags:{ power:2, defense:2 } },
    { id:'ball_hawk',     name:'Ball Hawk',     desc:'Reads the QB and breaks on the ball for picks.',         effect:'interception+',  tags:{ reaction:3, analysis:2 } },
    { id:'pass_rush',     name:'Pass Rush',     desc:'Relentless edge pressure collapses the pocket.',         effect:'passRush+',      tags:{ aggression:3, power:2 } },
  ],
  hoops: [
    { id:'sharpshooter',  name:'Sharpshooter',  desc:'Deadly from range — buries contested jumpers.',          effect:'shooting+',      tags:{ precision:3, analysis:1 } },
    { id:'crossover',     name:'Ankle Breaker', desc:'Vicious crossover creates instant separation.',          effect:'handles+',       tags:{ speed:3, control:2 } },
    { id:'poster',        name:'Poster Dunker', desc:'Rises over anyone at the rim for the slam.',             effect:'dunk+',          tags:{ power:3, aggression:2 } },
    { id:'clamps',        name:'Clamps',        desc:'On-ball stopper who erases the primary scorer.',         effect:'defense+',       tags:{ defense:3, reaction:2 } },
    { id:'floor_general', name:'Floor General', desc:'Runs the offense, finds the open cutter.',               effect:'assist+',        tags:{ support:3, analysis:2 } },
    { id:'motor',         name:'Motor',         desc:'Never tires — full-speed possessions all game.',         effect:'stamina+',       tags:{ endurance:3, defense:1 } },
    { id:'pickpocket',    name:'Pickpocket',    desc:'Lightning hands jump passing lanes for steals.',         effect:'steal+',         tags:{ reaction:3, speed:2 } },
    { id:'glass_cleaner', name:'Glass Cleaner', desc:'Dominates the boards on both ends.',                     effect:'rebound+',       tags:{ power:2, defense:2 } },
  ],
  dodgeball: [
    { id:'cannon_throw',  name:'Cannon Throw',  desc:'Rockets the ball — brutal to catch, hits hard.',        effect:'throwPower+',    tags:{ power:3, precision:2 } },
    { id:'quick_dodge',   name:'Quick Dodge',   desc:'Blistering sidestep slips incoming shots.',              effect:'dodge+',         tags:{ speed:3, reaction:2 } },
    { id:'sniper',        name:'Sniper',        desc:'Pinpoint aim tags opponents at any range.',              effect:'accuracy+',      tags:{ precision:3, analysis:1 } },
    { id:'iron_catch',    name:'Iron Catch',    desc:'Snags hard throws to eliminate the thrower.',            effect:'catch+',         tags:{ control:3, reaction:2 } },
    { id:'blitzer',       name:'Blitzer',       desc:'Rushes the line to press and overwhelm.',                effect:'press+',         tags:{ aggression:3, speed:1 } },
    { id:'wall',          name:'Human Wall',    desc:'Soaks pressure and outlasts the barrage.',               effect:'guard+',         tags:{ defense:3, endurance:2 } },
    { id:'trick_shot',    name:'Trick Shot',    desc:'Curves and banks throws around blockers.',               effect:'curve+',         tags:{ precision:2, control:2 } },
    { id:'relentless',    name:'Relentless',    desc:'Keeps attacking deep into every round.',                 effect:'endurance+',     tags:{ endurance:3, aggression:1 } },
  ],
  soccer: [
    { id:'finisher',      name:'Finisher',      desc:'Clinical in the box — buries the chance.',               effect:'shot+',          tags:{ precision:3, aggression:2 } },
    { id:'playmaker',     name:'Playmaker',     desc:'Threads killer passes and unlocks defenses.',            effect:'pass+',          tags:{ support:3, control:2 } },
    { id:'speedster',     name:'Speedster',     desc:'Burns past defenders on the flank.',                     effect:'speed+',         tags:{ speed:3, aggression:1 } },
    { id:'wall',          name:'Back Wall',     desc:'Immovable in defense, wins every duel.',                 effect:'defense+',       tags:{ defense:3, power:2 } },
    { id:'free_kick_ace', name:'Set-Piece Ace', desc:'Bends free kicks into the top corner.',                  effect:'setPiece+',      tags:{ precision:3, control:2 } },
    { id:'engine',        name:'Engine',        desc:'Box-to-box stamina, presses all match.',                 effect:'stamina+',       tags:{ endurance:3, support:1 } },
    { id:'interceptor',   name:'Interceptor',   desc:'Reads the pass and steps in to win it.',                 effect:'intercept+',     tags:{ reaction:3, defense:2 } },
    { id:'dribble_king',  name:'Dribble King',  desc:'Close control glides through traffic.',                  effect:'dribble+',       tags:{ control:3, speed:2 } },
  ],
  shooting: [
    { id:'dead_eye',      name:'Dead Eye',      desc:'Pinpoint targeting — every shot counts.',                effect:'accuracy+',      tags:{ precision:3, analysis:2 } },
    { id:'rapid_fire',    name:'Rapid Fire',    desc:'Blistering fire rate floods the field.',                 effect:'fireRate+',      tags:{ speed:3, aggression:2 } },
    { id:'shield_wall',   name:'Shield Wall',   desc:'Reinforced shields soak heavy damage.',                  effect:'shield+',        tags:{ defense:3, endurance:2 } },
    { id:'evasive',       name:'Evasive',       desc:'Twitch reflexes weave through fire.',                    effect:'dodge+',         tags:{ speed:2, reaction:3 } },
    { id:'homing_lock',   name:'Homing Lock',   desc:'Smart rounds track and curve to targets.',               effect:'homing+',        tags:{ analysis:3, reaction:2 } },
    { id:'power_core',    name:'Power Core',    desc:'Overcharged rounds hit far harder.',                     effect:'damage+',        tags:{ power:3, precision:1 } },
    { id:'overcharge',    name:'Overcharge',    desc:'Special weapon recharges faster.',                       effect:'specialCd+',     tags:{ power:2, aggression:2 } },
    { id:'steady_hands',  name:'Steady Hands',  desc:'Tight spread keeps every bolt on line.',                 effect:'spread+',        tags:{ precision:3, control:2 } },
  ],
};

// game-id aliases → canonical catalog key
const GAME_ALIAS = {
  football: 'gridiron', gridiron: 'gridiron',
  basketball: 'hoops', hoops: 'hoops', 'neon-hoops': 'hoops',
  dodgeball: 'dodgeball',
  soccer: 'soccer', 'shaddai-soccer': 'soccer',
  shooting: 'shooting', starfall: 'shooting', 'shaddai-shooting': 'shooting',
};

function canonicalGame(game) {
  return GAME_ALIAS[String(game || '').toLowerCase()] || String(game || '').toLowerCase();
}

// ── catalog(game) → full ability list for SKILLPLAY selection ────────────────
function catalog(game) {
  const g = canonicalGame(game);
  return (CATALOGS[g] || []).map(a => ({ ...a, tags: { ...a.tags } }));
}

function listGames() { return Object.keys(CATALOGS); }

// ── score(profile, ability) → 0..1 ───────────────────────────────────────────
// Weighted dot of the agent's trait profile against the ability's trait weights,
// normalized by the ability's max weight so a focused profile scores ~1.
function score(profile, ability) {
  let dot = 0, wmax = 0;
  for (const [tag, w] of Object.entries(ability.tags)) {
    dot += (profile[tag] || 0) * w;
    if (w > wmax) wmax = w;
  }
  return wmax > 0 ? +Math.min(1, dot / wmax).toFixed(4) : 0;
}

// ── kitForAgent(game, {skills, agentName}, n) ────────────────────────────────
// DETERMINISTIC auto-match: an agent's REAL skills (+ intrinsic council domain)
// → trait profile → top-N abilities for this game. Ties broken by catalog order
// (stable). Works identically for council + forged agents.
function kitForAgent(game, opts = {}, n = 3) {
  const g = canonicalGame(game);
  const abilities = CATALOGS[g] || [];
  if (!abilities.length) return { game: g, profile: {}, abilities: [] };
  const skills = opts.skills || opts.skillIds || [];
  const profile = agentAffinity(skills, opts.agentName || opts.agent || '');
  const ranked = abilities
    .map((a, i) => ({ a, i, s: score(profile, a) }))
    .sort((x, y) => (y.s - x.s) || (x.i - y.i))          // score desc, then stable catalog order
    .slice(0, Math.max(1, n))
    .map(({ a, s }) => ({ id: a.id, name: a.name, desc: a.desc, effect: a.effect, match: s }));
  return { game: g, profile, abilities: ranked };
}

module.exports = { CATALOGS, GAME_ALIAS, canonicalGame, catalog, listGames, score, kitForAgent };
