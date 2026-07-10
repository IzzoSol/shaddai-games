'use strict';
// ============================================================================
// backend/platform/affinity.js — SHADDAI Canonical Skill-Affinity Engine
// Supersedes backend/battle-affinity.js (leave the old file in place until
// integration). All existing exports + behavior are preserved; new capabilities
// are purely additive.
//
// CHANGES vs battle-affinity.js:
//   • 'reaction' added as the 10th TAGS trait (reflex, closing, reads)
//   • KEYWORD_TAGS row added for reaction
//   • AGENT_TAGS: PIKADON +reaction:1, ORACLE +reaction:1 (defensive reads)
//   • ROLE_WEIGHTS.gridiron: CB and FS added
//   • ROLE_POOL.gridiron: ['QB','RB','WR','OL','DL','LB','DB','CB','FS']
//   • TRAIT_TO_STAT extended: reaction -> 'defense'
//   • NEUTRAL auto-updates to 1/10 (was 1/9)
//
// Pure + deterministic: no randomness, no I/O, ZERO dependencies.
// TUNING NOTE: the weight tables below are the knobs. Change numbers here to
// re-balance without touching any logic.
// ============================================================================

// ── TAG VOCABULARY ──────────────────────────────────────────────────────────
// 10 gameplay-trait traits every skill/agent maps onto.
const TAGS = [
  'analysis',   // reads the game, decision-making, pattern/intel
  'defense',    // guarding, blocking, protecting
  'aggression', // attacking, forcing the action, press
  'speed',      // agility, burst, transition
  'precision',  // accuracy, aim, clean execution
  'endurance',  // stamina, late-game, durability
  'control',    // ball handling, possession, composure
  'power',      // strength, finishing, physical dominance
  'support',    // playmaking, assists, enabling teammates
  'reaction',   // reflex, anticipation, closing speed, twitch reads   ← NEW
];

const NEUTRAL = 1 / TAGS.length; // auto-updates to 0.1 with 10 tags

// ── EXPLICIT SKILL -> TAGS ──────────────────────────────────────────────────
// Known battle SKILLS (from battle-engine). Values are raw affinity weights
// (any positive scale; normalized later). Edit freely to re-balance.
const SKILL_TAGS = {
  sharpshooter: { precision: 3, analysis: 1 },
  ball_handler: { control: 3, support: 1 },
  speed_demon:  { speed: 3, aggression: 1 },
  lockdown:     { defense: 3, control: 1 },
  high_riser:   { power: 3, aggression: 1 },
  iron_lungs:   { endurance: 3, defense: 1 },
  court_vision: { analysis: 3, support: 2 },
  slasher:      { speed: 2, power: 2, aggression: 1 },
  playmaker:    { support: 3, control: 2, analysis: 1 },
  clutch_gene:  { precision: 2, analysis: 2, endurance: 1 },
  glass_cleaner:{ power: 2, defense: 2 },
  two_way:      { defense: 2, precision: 1, control: 1 },
};

// ── COUNCIL AGENT -> TAGS ────────────────────────────────────────────────────
// The 7 SHADDAI agents carry an intrinsic domain flavor even before skills.
// PIKADON and ORACLE pick up a touch of reaction (security reflexes / intel
// anticipation) on top of their primary traits.
const AGENT_TAGS = {
  SHADDAI: { analysis: 2, support: 2, control: 1, endurance: 1 },          // strategist/leader
  NEXUS:   { control: 2, support: 2, analysis: 1 },                         // architect/playmaker
  ZEROX:   { aggression: 2, power: 2, precision: 1 },                       // wealth/scorer
  ORACLE:  { analysis: 3, precision: 1, reaction: 1 },                      // research/intel — reads before it happens
  TURTLE:  { control: 2, support: 2, speed: 1 },                            // creative/flair
  QUILL:   { precision: 2, analysis: 1, support: 1 },                       // writing/accuracy
  // NOTE: council base-position priors live in sports/football/roles.js
  // (AGENT_ROLE_PRIORS). The skill→position mapping for FORGED agents is handled
  // by KEYWORD_TAGS below and does NOT touch these empty-skill council profiles,
  // so it can't skew council-vs-council balance.
  PIKADON: { defense: 3, power: 1, endurance: 1, reaction: 1 },             // security/guard — reacts to threats fast
};

// ── KEYWORD FALLBACK ─────────────────────────────────────────────────────────
// ANY new/forged skill auto-tags from its name/description. Ordered list of
// {re, tags}; every match contributes. Guarantees non-empty tags via NEUTRAL.
// Multiple rows can fire on one skill — weights stack, giving richer profiles.
// TUNING: keep each row's values at ~2 so stacking stays proportional.
const KEYWORD_TAGS = [
  // ── SECURITY / DEFENSE domain → LB/CB/DB/FS ─────────────────────────────
  { re: /secur|guard|defen|protect|shield|block|lock|firewall|patrol/i,
    tags: { defense: 2, reaction: 1 } },

  // ── ANALYSIS / RESEARCH / STRATEGY domain → QB (+ FS) ───────────────────
  { re: /analy|research|pattern|intel|insight|scout|forecast|predict|data|logic|strateg|audit/i,
    tags: { analysis: 2, precision: 1 } },

  // ── ENGINEERING / CODING domain → QB (analysis + control) ────────────────
  { re: /\bcod(e|ing|er)\b|engineer|architect|develop|backend|api\b|system\b|build/i,
    tags: { analysis: 2, control: 2 } },

  // ── WRITING / CONTENT domain → RB (+ WR): control + speed + endurance ────
  { re: /writ(e|ing|er)|copy|content|narrativ|docs?|author|story|editor|blog|journal/i,
    tags: { control: 2, speed: 1, endurance: 1 } },

  // ── GRAPHICS / VISUAL DESIGN domain → WR/CB: speed + precision + reaction ─
  { re: /graphic|design|visual|render|illustrat|\b3d\b|ui\b|ux\b|art(?:work|ist)?/i,
    tags: { speed: 2, precision: 2, reaction: 1 } },

  // ── MUSIC / AUDIO / MEDIA domain → WR/CB: speed + precision + reaction ────
  { re: /music|audio|sound|media|video|beat|rhythm|mix(?:ing)?|track|produc(e|er|tion)/i,
    tags: { speed: 2, precision: 2, reaction: 1 } },

  // ── FINANCE / WEALTH / TRADING domain → DL/RB: power + aggression ─────────
  { re: /financ|wealth|trad(e|ing)|money|revenue|market|econ|invest|profit|billing/i,
    tags: { power: 2, aggression: 2 } },

  // ── SPEED / AUTOMATION / AGILE domain → WR/RB: speed ────────────────────
  { re: /speed|agil|fast|quick|burst|dash|sprint|swift|transition|automat|realtime/i,
    tags: { speed: 2 } },

  // ── ATTACK / AGGRESSION domain ────────────────────────────────────────────
  { re: /attack|combat|strike|aggress|press|blitz|assault|rush|force/i,
    tags: { aggression: 2 } },

  // ── PRECISION domain ─────────────────────────────────────────────────────
  { re: /aim|snipe|precis|accura|target|sharp|marks|clutch/i,
    tags: { precision: 2 } },

  // ── ENDURANCE domain ─────────────────────────────────────────────────────
  { re: /stamina|endur|durab|iron|lung|relentless|tireless|marathon/i,
    tags: { endurance: 2 } },

  // ── CONTROL / HANDLING domain ────────────────────────────────────────────
  { re: /control|handle|dribble|possess|compos|steady|balance|manag/i,
    tags: { control: 2 } },

  // ── POWER domain ─────────────────────────────────────────────────────────
  { re: /power|strong|strength|heavy|slam|dunk|dominan|muscle|crush/i,
    tags: { power: 2 } },

  // ── SUPPORT / COORDINATION domain → QB/WR: support + control ─────────────
  { re: /support|assist|play\s*mak|enable|team|creat|vision|orchestrat|coordinat|organiz/i,
    tags: { support: 2, control: 1 } },

  // ── REACTION / REFLEX domain ─────────────────────────────────────────────
  { re: /react|reflex|instinct|twitch|closing|jump\s*the\s*route|anticipat|read\s*and\s*react/i,
    tags: { reaction: 2 } },
];

function _mergeInto(dst, src, scale = 1) {
  for (const [k, v] of Object.entries(src || {})) dst[k] = (dst[k] || 0) + v * scale;
  return dst;
}

// ── tagSkill(skill) ───────────────────────────────────────────────────────────
// Accepts a skill id, a name/description string, or a skill object
// ({id,name,desc,description}). Returns a {tag: weight} bag (never empty).
function tagSkill(skill) {
  const out = {};
  let id = '', text = '';
  if (skill && typeof skill === 'object') {
    id = String(skill.id || '').toLowerCase();
    text = [skill.id, skill.name, skill.desc, skill.description].filter(Boolean).join(' ');
  } else {
    id = String(skill || '').toLowerCase();
    text = String(skill || '');
  }
  // (a) explicit known-skill map (by id)
  if (id && SKILL_TAGS[id]) _mergeInto(out, SKILL_TAGS[id]);
  // (a2) explicit council-agent map (a skill named after an agent, e.g. "PIKADON")
  const up = id.toUpperCase();
  if (AGENT_TAGS[up]) _mergeInto(out, AGENT_TAGS[up]);
  // (b) keyword fallback over the full text (name + desc)
  for (const { re, tags } of KEYWORD_TAGS) if (re.test(text)) _mergeInto(out, tags);
  // never crash / never empty: give a flat neutral spread
  if (Object.keys(out).length === 0) for (const t of TAGS) out[t] = NEUTRAL;
  return out;
}

// Normalize a trait bag to a 0..1 profile (sum-normalized, all TAGS present).
function _normalize(bag) {
  const profile = {};
  let total = 0;
  for (const t of TAGS) { const v = Math.max(0, bag[t] || 0); profile[t] = v; total += v; }
  if (total <= 0) { for (const t of TAGS) profile[t] = NEUTRAL; return profile; }
  for (const t of TAGS) profile[t] = +(profile[t] / total).toFixed(4);
  return profile;
}

// ── agentAffinity(skillIds, agentName) ───────────────────────────────────────
// Aggregate an agent's intrinsic domain + equipped skills into a normalized
// trait profile {analysis:0..1, defense:0..1, ...} summing to ~1.
function agentAffinity(skillIds, agentName) {
  const bag = {};
  const up = String(agentName || '').toUpperCase();
  if (AGENT_TAGS[up]) _mergeInto(bag, AGENT_TAGS[up], 1); // intrinsic domain flavor
  const skills = Array.isArray(skillIds) ? skillIds : (skillIds ? [skillIds] : []);
  for (const s of skills) _mergeInto(bag, tagSkill(s), 1.5); // skills weigh a bit more
  return _normalize(bag);
}

// ── ROLE WEIGHTS (editable table) ─────────────────────────────────────────────
// ROLE_WEIGHTS[mode][role] = { tag: weight, ... }. Aptitude = dot(profile,weights)
// normalized. These are the balance knobs — semantic on purpose.
const ROLE_WEIGHTS = {
  gridiron: {
    QB: { analysis: 3, precision: 2, control: 2, support: 1 },          // reads field, decides, delivers
    RB: { speed: 2, power: 3, control: 1, aggression: 1 },              // runs the ball, breaks tackles
    WR: { speed: 3, precision: 2, control: 1 },                         // gets open, catches clean
    OL: { power: 3, defense: 2, endurance: 2 },                         // protects, holds the line
    DL: { aggression: 3, power: 2, speed: 1 },                          // pass rush / sacks
    LB: { defense: 3, power: 2, aggression: 1, analysis: 1 },           // tackling core
    DB: { defense: 2, speed: 2, analysis: 2, precision: 1 },            // pass coverage / picks
    // ── NEW defensive-back specialist roles ──────────────────────────────
    CB: { defense: 2, speed: 3, reaction: 2, precision: 1 },            // press/man coverage — fast, reactive
    FS: { analysis: 3, reaction: 2, defense: 2, speed: 1 },             // deep safety — reads + reacts
  },
  hoops: {
    playmaker:{ support: 3, control: 2, analysis: 2 },
    scorer:   { precision: 3, aggression: 1, power: 1 },
    defender: { defense: 3, endurance: 1, power: 1 },
  },
  soccer: {
    striker:  { precision: 2, speed: 2, aggression: 2, power: 1 },
    mid:      { control: 3, support: 2, analysis: 1, endurance: 1 },
    defender: { defense: 3, power: 1, endurance: 1 },
    keeper:   { defense: 2, precision: 2, control: 1, analysis: 1 },
  },
  dodgeball: {
    thrower:  { precision: 2, power: 2, aggression: 2 },
    dodger:   { speed: 3, control: 1, analysis: 1 },
  },
  shooting: {
    marksman: { precision: 3, analysis: 2, control: 1, endurance: 1 },
  },
};

// Default role pool per mode (order = priority for ties).
const ROLE_POOL = {
  gridiron: ['QB', 'RB', 'WR', 'OL', 'DL', 'LB', 'DB', 'CB', 'FS'], // CB and FS added
  hoops:    ['playmaker', 'scorer', 'defender'],
  soccer:   ['striker', 'mid', 'defender', 'keeper'],
  dodgeball:['thrower', 'dodger'],
  shooting: ['marksman'],
};

function rolePool(mode) { return (ROLE_POOL[mode] || []).slice(); }

// ── roleAptitude(profile, mode, role) → 0..1 ─────────────────────────────────
// Weighted dot product of the trait profile against the role's tag weights,
// normalized by the sum of weights so every role scores on a comparable 0..1.
function roleAptitude(profile, mode, role) {
  const w = (ROLE_WEIGHTS[mode] || {})[role];
  if (!w) return 0;
  let dot = 0, wsum = 0, wmax = 0;
  for (const [tag, weight] of Object.entries(w)) {
    dot += (profile[tag] || 0) * weight; wsum += weight; if (weight > wmax) wmax = weight;
  }
  if (wsum <= 0) return 0;
  // Normalize so a profile whose mass sits entirely on this role's top-weighted
  // trait scores ~1, while a broad role (more tags to satisfy) is harder to max.
  // Divide by wmax (not wsum) so specialized profiles reward focused roles and
  // multi-tag roles like OL don't tie with single-focus roles like LB/DB.
  return +Math.min(1, dot / wmax).toFixed(4);
}

// All role aptitudes for a mode, sorted desc.
function roleAptitudes(profile, mode) {
  return rolePool(mode)
    .map(role => ({ role, aptitude: roleAptitude(profile, mode, role) }))
    .sort((x, y) => y.aptitude - x.aptitude);
}

// ── bestRole(profile, mode, rolePool?) → role ────────────────────────────────
function bestRole(profile, mode, pool) {
  const roles = (Array.isArray(pool) && pool.length) ? pool : rolePool(mode);
  if (!roles.length) return null;
  let best = roles[0], bestScore = -1;
  for (const role of roles) {
    const s = roleAptitude(profile, mode, role);
    if (s > bestScore) { bestScore = s; best = role; } // first-wins tiebreak = pool order
  }
  return best;
}

// ── roleStatMods(profile, mode, role) → {stat: multiplier} ───────────────────
// Small, bounded stat multipliers fed into the sim so a well-suited agent in a
// role gets a real edge. Maps traits -> the engine's STAT_KEYS. Aptitude scales
// the bonus: a perfect-fit role gives ~+15% on its key stats, a poor fit ~0.
// Multipliers stay in [0.9, 1.18] so affinity nudges — never dominates — outcomes.
//
// reaction -> 'defense': in the live 7-stat sim (shooting,ballControl,speed,
// defense,vertical,stamina,iq), reaction most directly improves coverage/tackling
// so it channels into the 'defense' lane. If the sim gains a dedicated reaction
// stat later, update this mapping here.
function roleStatMods(profile, mode, role) {
  const apt = roleAptitude(profile, mode, role); // 0..1
  const w = (ROLE_WEIGHTS[mode] || {})[role] || {};
  // Which engine stats a role emphasizes (trait -> stat lane).
  const TRAIT_TO_STAT = {
    analysis:  'iq',
    defense:   'defense',
    aggression:'speed',
    speed:     'speed',
    precision: 'shooting',
    endurance: 'stamina',
    control:   'ballControl',
    power:     'vertical',
    support:   'iq',
    reaction:  'defense',  // ← NEW: reflex/closing maps to the defense stat lane in sim
  };
  const mods = {};
  let wsum = 0;
  for (const wt of Object.values(w)) wsum += wt;
  for (const [tag, weight] of Object.entries(w)) {
    const stat = TRAIT_TO_STAT[tag];
    if (!stat) continue;
    const share = wsum ? weight / wsum : 0;
    // bonus in [0, ~0.18], scaled by aptitude and this trait's share of the role
    const bonus = 0.18 * apt * share;
    mods[stat] = +(1 + (mods[stat] ? mods[stat] - 1 : 0) + bonus).toFixed(4);
  }
  // clamp
  for (const k of Object.keys(mods)) mods[k] = Math.max(0.9, Math.min(1.18, mods[k]));
  return { aptitude: apt, mods };
}

module.exports = {
  TAGS, SKILL_TAGS, AGENT_TAGS, KEYWORD_TAGS, ROLE_WEIGHTS, ROLE_POOL,
  tagSkill, agentAffinity, rolePool,
  roleAptitude, roleAptitudes, bestRole, roleStatMods,
};
