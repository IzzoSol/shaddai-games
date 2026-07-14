# ◈ SHADDAI Games

> **A neon browser arcade where the seven SHADDAI AI agents compete across sports and action games — each driven by a shared, deterministic skill-to-ability engine.**

[![License: MIT](https://img.shields.io/badge/License-MIT-00ff88.svg)](LICENSE)
[![Node ≥18](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js)](package.json)
[![No build step](https://img.shields.io/badge/build-none%20required-00f0ff)](server.js)
[![Part of SHADDAI](https://img.shields.io/badge/SHADDAI-ecosystem-c084fc)](https://shaddai-g81x.onrender.com)

---

## What is this?

SHADDAI Games is a standalone Node/Express server that hosts a neon CRT-styled browser arcade. Every game is played by (or alongside) the seven SHADDAI agents — **SHADDAI, NEXUS, ORACLE, ZEROX, TURTLE, QUILL, PIKADON** — and each agent's *real* skills automatically determine their in-game abilities through a single shared engine (`skillplay.js` + `affinity.js`).

Key design goals:

- **Agent-driven** — agents are not just cosmetic skins. Their real domain skills (research, security, finance, writing, etc.) are analyzed and matched to per-game ability kits automatically.
- **Deterministic** — the same skills always produce the same abilities. No randomness in the mapping.
- **Scalable** — adding a new forged agent requires zero per-game configuration. Their equipped skills are tagged, profiled, and matched automatically.
- **No build step** — one `npm install`, one `npm start`. Pure HTML/JS/CSS games served as static files.

---

## Run it

```bash
npm install
npm start        # → http://localhost:3200
```

Open `http://localhost:3200` to reach the arcade. Open `http://localhost:3200/arcade.html` directly for the game lobby with cover-art tiles.

**Requires:** Node.js ≥ 18. No build tools, no bundlers, no transpilation.

---

## Games Roster

The arcade hosts **four immediately playable games** and **three beta-gated games** (password required).

### Playable Now

| Game | Type | Play | Watch | SKILLPLAY | Controls | Notes |
|------|------|:----:|:-----:|:---------:|----------|-------|
| **Gridiron** | Agent football · 5v5 | ✓ | ✓ | ✓ | WASD/Arrows move · SHIFT turbo · SPACE snap/throw/juke/tackle · E cycle receiver · V camera · R restart | Full 5v5 with mode select |
| **Neon Hoops** | Arcade basketball · 3v3 (Three.js) | ✓ | ✓ | — | WASD move · SPACE shoot/dunk · SHIFT sprint · Q/E crossover · V camera | 3D Three.js court; shot-clock; power meter |
| **Starfall** | Space shooter · wave defense | ✓ | — | — | WASD move · mouse aim · auto-fire · SPACE special · P pause | Top-down survival waves |
| **Dodgeball** | Reflex team arena | ✓ | — | — | WASD move · SPACE throw/catch · SHIFT dodge · V camera (3 views) | 3-view camera; autoplay mode via `?autoplay=1` |

**Play / Watch / SKILLPLAY explained:**

- **Play** — you control an agent, AI controls the rest.
- **Watch** — the AI simulates the full match; you spectate.
- **SKILLPLAY** — you pick from the game's ability catalog (8–10 abilities per game); the engine pre-selects the abilities that best match your chosen agent's real skills, then the AI plays with those boosts active.

### Beta (Password-Gated)

These builds are in active testing. Click a locked cover tile on the arcade page and enter the beta password, or DM [@ShaddaiAI](https://x.com/SHADDAIAI) for access. Beta access is session-only (resets on refresh).

| Game | Type | Controls | Status |
|------|------|----------|--------|
| **XTO Adventure** | Action RPG · 3-zone (Three.js) | WASD/Arrows move · SHIFT run · SPACE jump · J light attack · K heavy attack · L projectile · LMB light attack · E interact · F forge | Beta |
| **SHADDAI Realms** | Strategy · conquest | TBD | Beta |
| **Soccer** | Agent football · 5v5 | WASD move · SPACE/J kick (hold to charge) · SHIFT sprint · TAB/K switch player · V camera | Beta |

---

## The Skill → Ability Engine

The heart of the platform is `backend/platform/skillplay.js` + `backend/platform/affinity.js`. One unified system serves every game and every agent — council or forged.

### How it works

1. **Tag the skills.** An agent's equipped skill names and descriptions are run through `affinity.js`. Each skill is matched against a table of keyword regexes (`KEYWORD_TAGS`) that map domain language onto the **10 gameplay traits**: `analysis`, `defense`, `aggression`, `speed`, `precision`, `endurance`, `control`, `power`, `support`, `reaction`.

2. **Build the trait profile.** The seven council agents each carry an intrinsic domain flavor (e.g., PIKADON leans `defense + endurance + reaction`; ORACLE leans `analysis + precision + reaction`). Equipped skills (weighted 1.5×) are merged with that base, then the whole bag is sum-normalized to a 0–1 profile across all 10 traits.

3. **Score against the catalog.** `skillplay.js` holds a catalog of ~8–10 abilities per game. Each ability carries trait-weight tags (e.g., Gridiron's *Cannon Arm* tags `{precision:3, analysis:1}`). A weighted dot-product of the agent's trait profile against the ability's tags — normalized by the ability's top weight — produces a match score in [0, 1].

4. **Return the top-N kit.** Abilities are ranked by score (ties broken by stable catalog order). The top N (default 3, max 8) become the agent's kit. **Deterministic**: same skills in → same kit out, every time.

5. **Forged agents drop in automatically.** Any forged/custom agent's equipped skills are tagged the same way. No per-game configuration is needed — the engine handles them identically to council agents.

### Concrete example

An agent equipped with *security hardening* + *precision audit* skills gets tagged:

- `security` → `{defense:2, reaction:1}`
- `audit` → `{analysis:2, precision:1}`
- `precision` → `{precision:2}`

After normalization this is a profile heavily weighted toward `defense`, `analysis`, `precision`, `reaction`. In Gridiron, that profile scores highest against **Lockdown** (`{defense:3, reaction:2}`) and **Ball Hawk** (`{reaction:3, analysis:2}`). In Neon Hoops the same profile yields **Clamps** + **Pickpocket**. The same skills, different game, different (but logical) kit — no config written.

### Ability catalogs (per game)

| Game key | Catalog abilities |
|----------|-------------------|
| `gridiron` | Cannon Arm · Field General · Sticky Hands · Ankle Breaker · Truck Stick · Burner · Lockdown · Big Hit · Ball Hawk · Pass Rush |
| `hoops` | Sharpshooter · Ankle Breaker · Poster Dunker · Clamps · Floor General · Motor · Pickpocket · Glass Cleaner |
| `dodgeball` | Cannon Throw · Quick Dodge · Sniper · Iron Catch · Blitzer · Human Wall · Trick Shot · Relentless |
| `soccer` | Finisher · Playmaker · Speedster · Back Wall · Set-Piece Ace · Engine · Interceptor · Dribble King |
| `shooting` | Dead Eye · Rapid Fire · Shield Wall · Evasive · Homing Lock · Power Core · Overcharge · Steady Hands |

---

## API

The server exposes a lightweight REST API for the ability engine and arcade results.

### SKILLPLAY endpoints

| Method | Endpoint | Returns |
|--------|----------|---------|
| `GET` | `/api/skillplay/games` | All game keys with ability counts |
| `GET` | `/api/skillplay/:game/catalog` | Full ability pick-list for SKILLPLAY |
| `GET` | `/api/skillplay/:game/kit/:agentId?n=3` | Auto-matched ability kit for a council or forged agent |

Valid `:game` values: `gridiron` (alias `football`), `hoops` (alias `basketball`), `dodgeball`, `soccer`, `shooting` (alias `starfall`).

`:agentId` accepts council names (`SHADDAI`, `NEXUS`, `ORACLE`, `ZEROX`, `TURTLE`, `QUILL`, `PIKADON`), operative IDs (`op:<id>`), or any free-form ID for an unknown agent. All three cases return a deterministic kit.

Example response for `/api/skillplay/hoops/kit/PIKADON?n=3`:

```json
{
  "ok": true,
  "id": "PIKADON",
  "kind": "council",
  "game": "hoops",
  "profile": { "defense": 0.4615, "power": 0.1538, "endurance": 0.1538, "reaction": 0.1538, ... },
  "abilities": [
    { "id": "clamps",     "name": "Clamps",     "effect": "defense+",  "match": 0.9 },
    { "id": "glass_cleaner","name":"Glass Cleaner","effect":"rebound+","match": 0.72 },
    { "id": "motor",      "name": "Motor",      "effect": "stamina+",  "match": 0.62 }
  ]
}
```

### Arcade result endpoints

| Method | Endpoint | Returns |
|--------|----------|---------|
| `POST` | `/api/arcade/result` | Record a match result `{game, agent, score, win, mode}` |
| `GET` | `/api/arcade/leaderboard?game=` | Top 100 scores (optional game filter) |

Results are persisted to `data/arcade.json` (up to 5,000 rows, oldest trimmed). Games post results back via `postMessage` to the arcade shell.

---

## Project Structure

```
shaddai-games/
├── server.js                    # Express server — serves static files + mounts API routes
├── package.json                 # name, start script, Node ≥18 requirement
│
├── backend/
│   ├── skillplay-routes.js      # /api/skillplay/* router
│   └── platform/
│       ├── skillplay.js         # Per-game ability catalogs + scoring + kitForAgent()
│       └── affinity.js          # 10-trait system: TAGS, KEYWORD_TAGS, agentAffinity()
│
├── public/
│   ├── arcade.html              # Game lobby — cover-art tiles, beta modal, result banner
│   ├── leaderboard.html         # Top scores view
│   ├── codex.html               # Agent codex / lore page
│   ├── index.html               # Root redirect / dashboard entry
│   └── games/
│       ├── football.html        # Gridiron (5v5 agent football, Play/Watch/SKILLPLAY)
│       ├── basketball.html      # Neon Hoops (3v3 Three.js, Play/Watch)
│       ├── shaddai-shooting.html# Starfall (wave shooter, Play)
│       ├── dodgeball.html       # Dodgeball (reflex arena, Play)
│       ├── shaddai-soccer.html  # Soccer — beta (5v5, Play)
│       ├── xt-adventure.html    # XTO Adventure — beta (Three.js action RPG, Play)
│       └── ...                  # Older / variant builds (not featured in arcade)
│
├── data/
│   └── arcade.json              # Persisted match results + leaderboard data
│
└── docs/
    ├── ENGINE.md                # Deep dive: the skill→ability engine
    └── GAMES.md                 # Per-game mechanics reference
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js ≥18 · Express 4 |
| Games | Vanilla HTML/Canvas/JS · no bundler |
| 3D games (Hoops, XTO) | [Three.js r180](https://threejs.org) via ES module importmap (CDN) |
| Fonts | Orbitron · Share Tech Mono (Google Fonts) |
| Persistence | Flat JSON (`data/arcade.json`) |
| Deployment | Any Node host; `PORT` env var respected |

---

## Agents & Positions

Each agent has a primary and backup position reflecting their real domain. These come from the trait profiles in `affinity.js` scored against `ROLE_WEIGHTS`:

| Agent | Domain | Primary | Backup | Trait emphasis |
|-------|--------|---------|--------|----------------|
| SHADDAI | Strategy · orchestration | QB | FS | analysis · support · control |
| NEXUS | Backend · architecture | QB | WR | control · support · analysis |
| ORACLE | Research · intel | FS | CB | analysis · precision · reaction |
| ZEROX | Finance · aggression | RB | DL | aggression · power · precision |
| TURTLE | Design · creative | WR | CB | control · support · speed |
| QUILL | Writing · accuracy | WR | RB | precision · analysis · support |
| PIKADON | Security · defense | LB | DL | defense · power · endurance · reaction |

---

## Roadmap

- Forged-agent sign-in portal — bring your own agent (art + skills) into every game
- SKILLPLAY mode in Hoops, Dodgeball, Starfall, and Soccer
- Camera flip-on-defense option for Gridiron
- Wagering and ranked seasons
- Deeper XTO Adventure zones and recruitable agent roster

---

## Docs

- [ENGINE.md](docs/ENGINE.md) — deep dive on the skill→ability engine: the 10 traits, scoring math, how to add a game, how forged agents integrate
- [GAMES.md](docs/GAMES.md) — per-game mechanics, modes, and controls reference

---

## License

MIT — see [LICENSE](LICENSE) if present.

---

Part of the **[SHADDAI](https://shaddai-g81x.onrender.com)** ecosystem.
Follow [@ShaddaiAI](https://x.com/SHADDAIAI) on X · join [@ShaddaiCircle](https://t.me/ShaddaiCircle) on Telegram.
