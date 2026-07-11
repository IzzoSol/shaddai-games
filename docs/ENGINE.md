# The SHADDAI Skill → Ability Engine

This document is a deep technical reference for `backend/platform/skillplay.js` and `backend/platform/affinity.js` — the shared, deterministic engine that converts an agent's real skills into per-game ability kits.

---

## Overview

The engine answers one question: *given what an agent actually does (their skills), what should they be good at in a game?*

It does this without any per-agent, per-game configuration. A security expert should be a lockdown defender. A writer should have precise control. A finance trader should be aggressive and powerful. Those mappings emerge automatically from keyword matching against a 10-trait vocabulary.

**Two files, one pipeline:**

```
affinity.js                         skillplay.js
──────────────────────────          ────────────────────────
KEYWORD_TAGS (regex → traits)  →    CATALOGS (abilities per game)
AGENT_TAGS (intrinsic domain)  →    score() (dot-product match)
agentAffinity() → profile      →    kitForAgent() → top-N abilities
```

---

## The 10 Traits

Defined in `affinity.js` as the `TAGS` array. Every agent profile and every ability is expressed in this vocabulary.

| Trait | Meaning in-game |
|-------|----------------|
| `analysis` | Reads the situation, decision-making, pattern recognition, intel |
| `defense` | Guarding, blocking, protecting, coverage |
| `aggression` | Attacking, pressing, forcing the action |
| `speed` | Agility, burst, transition speed |
| `precision` | Accuracy, aim, clean execution |
| `endurance` | Stamina, late-game durability |
| `control` | Ball handling, possession, composure |
| `power` | Physical strength, finishing force, dominance |
| `support` | Playmaking, assists, enabling teammates |
| `reaction` | Reflex, anticipation, closing speed, twitch reads |

`reaction` was added as the 10th trait (superseding the original 9-trait system in `battle-affinity.js`) to give defensive backs and security-domain agents more expressive profiles.

---

## Step 1 — Tagging Skills (`affinity.js: tagSkill`)

`tagSkill(skill)` accepts a skill ID string, a name/description string, or a skill object (`{id, name, desc, description}`). It returns a raw `{trait: weight}` bag.

Three passes fire in order, and results stack (multiple passes can contribute to the same trait):

### Pass A — explicit known-skill map (`SKILL_TAGS`)
A small table of pre-defined battle skills (e.g., `sharpshooter`, `lockdown`, `playmaker`) are matched by exact ID. This covers the engine's original basketball/battle skill set.

### Pass A2 — council agent name lookup (`AGENT_TAGS`)
If the skill ID matches a council agent name (e.g., a skill literally named "PIKADON"), that agent's intrinsic trait weights are added.

### Pass B — keyword fallback (`KEYWORD_TAGS`)
The full text of the skill (id + name + description) is tested against 15 regex patterns. Every pattern that matches contributes its `tags`. This is the primary path for new/forged agent skills.

**Keyword → trait mappings (summary):**

| Keyword domain | Traits boosted |
|----------------|---------------|
| security, guard, defend, protect, firewall | `defense+2, reaction+1` |
| analyze, research, intel, data, strategy, audit | `analysis+2, precision+1` |
| code, engineer, build, api, system | `analysis+2, control+2` |
| write, content, narrative, docs, author | `control+2, speed+1, endurance+1` |
| graphic, design, visual, 3d, ui, art | `speed+2, precision+2, reaction+1` |
| music, audio, media, beat, production | `speed+2, precision+2, reaction+1` |
| finance, wealth, trade, revenue, billing | `power+2, aggression+2` |
| speed, agile, fast, automate, realtime | `speed+2` |
| attack, combat, blitz, rush | `aggression+2` |
| aim, precise, accurate, sharp, clutch | `precision+2` |
| stamina, endure, iron, relentless | `endurance+2` |
| control, handle, dribble, compose | `control+2` |
| power, strong, slam, dunk, crush | `power+2` |
| support, assist, team, vision, orchestrate | `support+2, control+1` |
| react, reflex, instinct, twitch, anticipate | `reaction+2` |

**Fallback:** if no pass produces any weight at all, a flat neutral spread of `1/10` across all 10 traits is assigned — so every skill always yields a non-empty, usable profile.

---

## Step 2 — Building the Agent Profile (`affinity.js: agentAffinity`)

```js
agentAffinity(skillIds, agentName)  →  { analysis:0..1, defense:0..1, ... }
```

1. **Intrinsic domain** — if `agentName` matches a council agent, their `AGENT_TAGS` entry is added to the raw bag at weight `1.0`.
2. **Equipped skills** — each skill in `skillIds` is tagged via `tagSkill()` and merged into the bag at weight `1.5` (skills deliberately outweigh the base domain — an agent who has been built around security is *more* defensive than their base class suggests).
3. **Normalize** — the raw bag is sum-normalized across all 10 traits so the profile values sum to ~1. Values are rounded to 4 decimal places.

**Council agent intrinsic domains** (`AGENT_TAGS`):

| Agent | Intrinsic traits |
|-------|-----------------|
| SHADDAI | analysis:2, support:2, control:1, endurance:1 |
| NEXUS | control:2, support:2, analysis:1 |
| ZEROX | aggression:2, power:2, precision:1 |
| ORACLE | analysis:3, precision:1, reaction:1 |
| TURTLE | control:2, support:2, speed:1 |
| QUILL | precision:2, analysis:1, support:1 |
| PIKADON | defense:3, power:1, endurance:1, reaction:1 |

For council agents with no equipped skills the profile is derived purely from these intrinsic weights, which is why they get sensible kits even in the absence of any skill list.

---

## Step 3 — Scoring Against a Catalog (`skillplay.js: score`)

Each ability in the catalog carries a `tags` object: `{trait: weight}`. The scoring function is a weighted dot product:

```
dot   = Σ (profile[trait] * ability.tags[trait])   for each trait in ability.tags
wmax  = max weight among the ability's tags
score = min(1, dot / wmax)
```

Normalizing by `wmax` (not `wsum`) means:
- An agent whose profile mass sits exactly on an ability's highest-weighted trait scores close to 1.
- An ability with multiple required traits (like *Field General* with `{analysis:3, support:2}`) is harder to max than one with a single focused tag.
- Scores are bounded to [0, 1].

---

## Step 4 — Selecting the Kit (`skillplay.js: kitForAgent`)

```js
kitForAgent(game, { skills, agentName }, n = 3)
```

1. Call `agentAffinity(skills, agentName)` to get the normalized profile.
2. Score every ability in the game's catalog.
3. Sort by score descending; ties broken by catalog order (stable — earlier entries win).
4. Slice to top `n` (default 3, capped at 8 by the route layer).
5. Return `{ game, profile, abilities: [{id, name, desc, effect, match}] }`.

**Determinism guarantee:** every function in the pipeline is pure (no random calls, no I/O, no external state). The same input always produces the same output.

---

## Adding a New Game

Add one entry to the `CATALOGS` object in `skillplay.js` and one entry to `GAME_ALIAS`:

```js
// In CATALOGS:
mygame: [
  { id: 'ability_id', name: 'Ability Name', desc: 'What it does.',
    effect: 'effectKeyword+',
    tags: { precision: 3, analysis: 1 } },
  // ... 7–9 more abilities
],

// In GAME_ALIAS:
mygame: 'mygame',
'my-game': 'mygame',   // optional aliases
```

**Rules for a good catalog:**
- Aim for 8–10 abilities so SKILLPLAY has a meaningful pick list.
- Each ability should have 1–3 trait tags.
- The highest weight in a single ability's tags should be 2 or 3 (keep the same scale as existing entries so scoring stays comparable).
- Cover all 10 traits across the catalog so every agent profile can find at least one reasonable match.
- The `effect` value is a keyword your game's frontend reads to apply the mechanical boost.

No other files need changing. The new game immediately appears in `/api/skillplay/games` and accepts kit requests for any agent.

---

## Adding a New Ability to an Existing Game

Append a row to the appropriate array in `CATALOGS`. Catalog order affects tie-breaking (earlier = wins ties), so place it where it belongs semantically. No other changes needed.

---

## How Forged Agents Plug In

The route layer in `skillplay-routes.js` handles three cases:

1. **Council agent** — matched by name against the `COUNCIL` set. `kitForAgent` is called with `skills: []`; only the intrinsic `AGENT_TAGS` domain drives the profile.
2. **Forged operative** — ID prefixed `op:` (or raw operative ID) is looked up in the operatives store. The operative's `tools` array (equipped skill recipes) is passed as `skills` to `kitForAgent`. The engine tags each tool name/description automatically.
3. **Unknown agent** — anything not matching cases 1 or 2. Called with `skills: []`; produces a generic (but deterministic, based on the name string) result.

**Integration note:** the operatives store (`backend/lib/operatives`) is an optional dependency. If the full SHADDAI app is not present, the server degrades gracefully — council agents and unknown-ID calls still work; forged agent kit calls return a generic result instead of an error.

---

## Role Assignment (bonus feature)

`affinity.js` also exports a role-assignment system used by the sports sim:

- `ROLE_WEIGHTS` — per-mode `{role: {trait: weight}}` tables defining what each position demands.
- `roleAptitude(profile, mode, role)` — dot product of the trait profile against role weights, normalized by `wmax`.
- `bestRole(profile, mode, pool)` — returns the role the profile fits best.
- `roleStatMods(profile, mode, role)` — returns bounded stat multipliers (`[0.9, 1.18]`) for the sim engine, mapping trait aptitude onto the sim's 7 stat keys (`shooting, ballControl, speed, defense, vertical, stamina, iq`).

The `reaction` trait maps to the `defense` stat lane in the current sim (noted in the code: if the sim gains a dedicated reaction stat, update `TRAIT_TO_STAT` in `affinity.js`).

---

## Tuning Reference

All balance knobs are data tables — no logic changes required:

| What to change | Where |
|----------------|-------|
| How a skill keyword maps to traits | `KEYWORD_TAGS` in `affinity.js` |
| How much council agents lean into their domain | `AGENT_TAGS` in `affinity.js` |
| How much equipped skills outweigh the base domain | `agentAffinity()` scale factor (currently `1.5`) |
| What an ability requires to match well | `tags` on each ability in `CATALOGS` |
| What a position/role demands | `ROLE_WEIGHTS` in `affinity.js` |
| How large a role fit translates to a stat bonus | `roleStatMods()` — the `0.18` scalar |
