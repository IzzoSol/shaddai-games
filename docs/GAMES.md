# SHADDAI Games — Per-Game Reference

Each game is a standalone HTML file served statically. They communicate match results back to the arcade shell via `window.postMessage({ type: 'arcadeResult', result: { game, agent, score, win, summary } })`. The arcade shell can also close a game by calling `window.parent.closeGame()` or the game can emit `{ type: 'exitGame' }`.

---

## Gridiron

**File:** `public/games/football.html`
**Engine:** 2D Canvas
**Game key:** `gridiron` (alias: `football`)

### What it is

A 5v5 American football game where you control one agent on a team of SHADDAI agents versus an opposing AI team. Matches run as full offensive/defensive series with snap, route-running, passing, rushing, tackling, and interceptions.

### Modes

| Mode | Description |
|------|-------------|
| **Play** | You control the player character. On offense you snap, choose a receiver, and throw or scramble. On defense you control a linebacker/DB and tackle. |
| **Watch** | The AI simulates both teams in full. You spectate with real-time commentary indicators. |
| **SKILLPLAY** | You pick up to 3 abilities from the Gridiron catalog (or let the engine auto-select based on your chosen agent's real skills), then the AI plays the match with those ability boosts active on your team. |

### Controls

| Key | Action |
|-----|--------|
| WASD / Arrow keys | Move player |
| SHIFT | Turbo / sprint |
| SPACE | Context-sensitive: snap ball (at line) · throw to selected receiver (passing) · juke/stiff-arm (ball carrier) · attempt tackle (defense) |
| E | Cycle to next receiver (during pass progression) |
| V | Cycle camera view |
| R | Restart match |
| ESC / BACK | Return to arcade or previous menu step |

### Notable mechanics

- **Mode select** happens after agent/team selection and before kickoff. The mode screen (managed by `G_MODESEL`) overlays the select screen.
- **SKILLPLAY ability pre-selection:** when the mode is confirmed as `skill`, the engine calls `/api/skillplay/gridiron/kit/<agentId>?n=3` and pre-badges the agent's natural abilities in the picker UI.
- **Effect keywords** the game reads: `throwAccuracy+`, `decision+`, `catching+`, `evasion+`, `runPower+`, `speed+`, `coverage+`, `tackle+`, `interception+`, `passRush+`.
- The sim applies ability boosts only to the human-controlled team (play and skill modes).
- Camera has multiple views; `V` cycles through them. A HUD badge shows the active mode (`SIMULATING` or `SKILLPLAY`).

---

## Neon Hoops

**File:** `public/games/basketball.html`
**Engine:** Three.js r180 (3D, ES module importmap)
**Game key:** `hoops` (aliases: `basketball`, `neon-hoops`)

### What it is

A 3v3 arcade basketball game on a Three.js 3D court. Features a shot clock, power meter with a "green release window" for bonus accuracy, and a crossover/handle system. The neon CRT aesthetic is carried into 3D with glow effects and a dark court.

### Modes

| Mode | Description |
|------|-------------|
| **Play** | You control one player. Pick your character from a character-card grid before tipoff. |
| **Watch (AUTO)** | Toggle AUTO demo at any time with T. Agents self-play the full match. The AUTO badge appears top-left. |

SKILLPLAY is not yet implemented for Hoops (it is on the roadmap).

### Controls

| Key | Action |
|-----|--------|
| WASD | Move player |
| SPACE | Shoot (tap = quick release; hold = power meter) |
| SHIFT | Sprint |
| Q / E | Crossover (left/right) |
| V | Cycle camera mode |
| T | Toggle AUTO demo (agents self-play) |

### Notable mechanics

- **Power meter** — holding SPACE charges a vertical bar. A green release window appears; releasing in the window gives a shooting bonus. A shot-type label indicates `jumper`, `dunk`, etc.
- **Shot clock** — standard 24-second shot clock. The display turns red and pulses when under ~5 seconds.
- **Character select** — a grid of agent cards with a checkmark on the selected card. Each agent's color scheme is applied to their team.
- **Possession indicator** — shows which team has the ball and who is in control.
- **Three.js scene** — the court, players, and ball are rendered in 3D; the HUD is an HTML overlay on top of the canvas.

---

## Starfall

**File:** `public/games/shaddai-shooting.html`
**Engine:** 2D Canvas
**Game key:** `shooting` (aliases: `starfall`, `shaddai-shooting`)

### What it is

A top-down space wave-defense shooter. You control a ship that auto-fires and must survive escalating waves of enemies. A SPACE-triggered special ability charges over time. The visual style uses a dark navy palette with cyan/gold neon accents and glassy UI panels.

### Modes

**Play** only — no Watch or SKILLPLAY mode.

### Controls

| Key | Action |
|-----|--------|
| WASD | Move ship |
| Mouse | Aim (ship/fire direction) |
| Auto | Ship fires automatically toward aim direction |
| SPACE | Trigger special ability (when charged) |
| P / Escape | Pause / unpause |

### Notable mechanics

- **Auto-fire** — the ship fires continuously; the player focuses on positioning and dodging.
- **Special cooldown** — the special ability has a visible charge bar. Effect keywords the game can read: `accuracy+`, `fireRate+`, `shield+`, `dodge+`, `homing+`, `damage+`, `specialCd+`, `spread+` (these correspond to the Shooting ability catalog for future SKILLPLAY integration).
- **Wave progression** — enemy waves escalate in count and speed.
- **Pause screen** — `P` or `Escape` pauses/unpauses mid-game.

---

## Dodgeball

**File:** `public/games/dodgeball.html`
**Engine:** 2D Canvas
**Game key:** `dodgeball`

### What it is

A team dodgeball arena with reflex-based gameplay. Two teams face off in a court divided by a center line. You control one thrower/dodger and try to eliminate all opposing players while your teammates do the same.

### Modes

**Play** is the primary mode. An `?autoplay=1` URL parameter enables a bot/demo mode where both teams are AI-controlled (useful for testing or spectating).

### Controls

| Key | Action |
|-----|--------|
| WASD | Move player |
| SPACE | Context-sensitive: throw held ball · catch an incoming ball |
| SHIFT | Dodge (reactive sidestep) |
| V | Cycle camera view (3 modes: BROADCAST · OPPONENT-FACING · FP-CHASE) |

### Notable mechanics

- **Catch mechanic** — pressing SPACE when an incoming ball is close catches it, which eliminates the original thrower (standard dodgeball rule).
- **3-mode camera** — `V` cycles: `BROADCAST` (fixed overhead), `OPPONENT-FACING` (mirrored to view from the enemy side), and `FP-CHASE` (first-person chase cam that follows the active player). The FP-CHASE camera uses a chase-cam algorithm that follows the active player's position and facing.
- **Round structure** — the game resets player positions each round until one team is fully eliminated.
- **Autoplay mode** — `?autoplay=1` activates bot AI for both teams, enabling demo/spectate.

---

## Soccer (Beta)

**File:** `public/games/shaddai-soccer.html`
**Engine:** 2D Canvas
**Status:** Beta — password-gated in the arcade

### What it is

A 5v5 2D soccer (football) game. You control one field player; AI handles teammates and the opposition. Features a hold-to-charge kick mechanic and automatic player switching.

### Modes

**Play** only (as of beta).

### Controls

| Key | Action |
|-----|--------|
| WASD | Move player |
| SPACE / J | Kick — tap for a pass/shot; hold to charge for a power strike |
| SHIFT | Sprint |
| TAB / K | Manually switch to a different teammate |
| V | Cycle camera view |
| P / Escape | Pause / unpause |

### Notable mechanics

- **Charge kick** — holding SPACE/J builds shot power (visible charge indicator). The longer the hold, the harder the shot, up to a cap. Releasing determines power and direction.
- **Auto player switch** — when the ball changes possession or moves far from the active player, the game automatically selects the nearest teammate, so the player is always controlling the most relevant character.
- **Cinematic start screen** — a styled HF-image background behind a scrim with lineup info before kickoff.
- **Pause screen** — `P` or `Escape` pauses. A dedicated pause overlay screen shows with a resume button.

---

## XTO Adventure (Beta)

**File:** `public/games/xt-adventure.html`
**Engine:** Three.js r180 (3D, ES module importmap)
**Status:** Beta — password-gated in the arcade

### What it is

A 3-zone action RPG. You play as a CLONE — one of thousands grown from a stolen fragment of the SHADDAI Core by the dragon-warlord ADRAGONA. Your goal: rally the free clones of ORACLE, NEXUS, ZEROX, TURTLE, and others; cross the wilderness; shatter PIKADON's gate-clone; descend into the vats; and unmake ADRAGONA.

Every one of the 7 council agents is a playable clone. Forged/custom agents are designed to slot in here too — add a `{NAME: {...}}` entry to the `AGENT` roster and they become a selectable clone.

### Modes

**Play** only. Single-player action RPG.

### Controls

| Key / Input | Action |
|-------------|--------|
| WASD / Arrow keys | Move character |
| SHIFT | Run |
| SPACE | Jump |
| J | Light attack (SLASH — learned from QUILL) |
| K | Heavy attack (KICK — unlocks at level 4) |
| L | Projectile (BOLT — unlocks at level 6) |
| LMB (left mouse) | Light attack (desktop convenience alias) |
| E / Enter | Interact with nearby NPC · advance dialogue |
| F | Open the Forge (ability/upgrade panel) |
| Escape | Close Forge or advance dialogue |

### Notable mechanics

- **Three.js 3D world** — the game world is split into three zones (wilderness, gatehouse, vats). GLB models are loaded for each agent and for the villain ADRAGONA. Two rigged body types (sword-wielder and heavy) are shared across all clone characters.
- **Progressive combat unlocks** — light attack is available from the start. Heavy attack unlocks at level 4. Projectile unlocks at level 6. Attempting a locked move shows a hint.
- **Squad/recruit system** — free clones found in the world can be recruited to your squad. A squad tray on the right shows active allies.
- **Forge panel** (`F`) — an in-game upgrade panel for abilities/progression. Opens over the game world.
- **Dialogue system** — NPCs have branching or sequential dialogue. `E`/`Enter` advances. The `dlgActive` flag blocks combat input during dialogue.
- **Lore** — the game has a full story prologue explaining the Core, the data-shard theft, and why familiar faces appear on both sides. QUILL appears as a mentor who teaches the player to fight.
- **Asset loading** — GLB models are fetched from `/assets/agents/<NAME>.glb`. Load progress is tracked per-asset and displayed on a loading screen before the title screen appears.
- **Debug hook** — `window.__XTO` exposes the scene, renderer, entities, progress, THREE, and models objects for debugging.
