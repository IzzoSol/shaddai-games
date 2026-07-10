# ◈ SHADDAI Games

A neon arcade of **agent-driven** sports & action games. Every game is played by the seven SHADDAI agents (SHADDAI, NEXUS, ORACLE, ZEROX, TURTLE, QUILL, PIKADON), and each agent's **real skills** are automatically analyzed and matched to in-game **abilities** by a shared, deterministic engine — so future *forged* agents drop in without any per-game configuration.

## ▶ Run it

```bash
npm install
npm start           # http://localhost:3200
```

Open `http://localhost:3200` → the arcade. Pick a game and play.

## 🎮 Games

| Game | Type | Controls |
|------|------|----------|
| **Gridiron** | Agent football 5v5 | WASD/Arrows move · SHIFT turbo · SPACE snap/throw/juke/tackle · E cycle receiver · **V** camera · R restart |
| **Neon Hoops** | Arcade basketball 3v3 | WASD move · SPACE shoot/dunk · SHIFT sprint · Q/E crossover · **V** camera |
| **Starfall** | Space wave-shooter | WASD move · MOUSE aim · auto-fire · SPACE special · P pause |
| **Dodgeball** | Reflex team arena | WASD move · SPACE throw/catch · SHIFT dodge · **V** camera |
| **Soccer** | Agent football 5v5 | WASD move · SPACE/J kick (hold to charge) · SHIFT sprint · **V** camera |

Each game has **three modes**: **Play** (hands-on), **Watch** (AI simulates), and **SKILLPLAY** (pick abilities, then the AI plays with your boosts). Locked **beta** games (XTO Adventure, SHADDAI Realms) unlock with a password.

## 🧠 The skill → ability engine

The heart of the platform is `backend/platform/skillplay.js` + `affinity.js`:

1. An agent's real skills (names/descriptions) are tagged into a **10-trait profile** — analysis, defense, aggression, speed, precision, endurance, control, power, support, reaction.
2. That profile is scored against each game's **ability catalog** (~8–10 abilities per game).
3. The top abilities become the agent's **kit** — **deterministic**: the same skills always yield the same abilities. Never random.

Because forged agents' skills are tagged the same way, they get sensible abilities automatically — no config. Example: an agent with *security* + *precision* skills auto-matches to **Clamps** (lockdown defense) + **Sharpshooter**.

### API

| Endpoint | Returns |
|----------|---------|
| `GET /api/skillplay/:game/catalog` | the game's full ability pick-list |
| `GET /api/skillplay/:game/kit/:agentId?n=3` | an agent's auto-matched abilities (council or forged) |
| `POST /api/arcade/result` | record a match result |
| `GET /api/arcade/leaderboard?game=` | top scores |

Games: `gridiron`, `hoops`, `dodgeball`, `soccer`, `shooting`.

## 🧬 Agents & positions

Each agent has a **main / backup** position that reflects their real domain:

- **SHADDAI** QB / FS · **NEXUS** QB / WR · **ORACLE** FS / CB · **ZEROX** RB / DL · **TURTLE** WR / CB · **QUILL** WR / RB · **PIKADON** LB / DL

## 🛣️ Roadmap

- Forged-agent sign-in portal (bring your own agent + art into the games)
- Camera flip-on-defense option, deeper SKILLPLAY per game
- Wagering & ranked seasons

---
Part of the **SHADDAI** ecosystem · MIT
