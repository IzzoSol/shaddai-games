/**
 * Building Blueprints – each entry is passed to the MCP procedural generator
 * to spawn a distinct interior/room layout.  All blueprints are versioned
 * so the client can auto‑update without a full redeploy.
 */
export const BUILDINGS = {
  // -----------------------------------------------------------------
  // 1️⃣  Forge – crafting station
  // -----------------------------------------------------------------
  forge: {
    id: 'forge',
    type: 'workshop',
    name: 'Forge',
    description: 'Craft tools, weapons, and upgrades',
    theme: 'industrial',
    seed: 101,
    dimensions: { cols: 12, rows: 9 },
    props: [
      { type: 'workbench',   x: 2,  y: 2,  rot: 0 },
      { type: 'anvil',       x: 4,  y: 2,  rot: 0 },
      { type: 'tool_rack',   x: 6,  y: 2,  rot: 0 },
      { type: 'forge_fire',  x: 3,  y: 5,  rot: 90 },
      { type: 'forge_lever', x: 5,  y: 5,  rot: 0 }
    ],
    // skill trigger – increases Crafting TL when used
    onUse: 'craftingXpGain(2)',
    // ambient visual assets (use fal.ai / huggingface assets via URLs)
    textures: {
      floor:   '/textures/floor-masonry.jpg',
      wall:    '/textures/brick.png',
      ceiling: '/textures/iron.png'
    }
  },

  // -----------------------------------------------------------------
  // 2️⃣  Arcade Hall – mini‑game arena
  // -----------------------------------------------------------------
  arcade: {
    id: 'arcade',
    type: 'game_hall',
    name: 'Arcade Hall',
    description: 'Competitive mini‑games (racing, rhythm, puzzles)',
    theme: 'neon',
    seed: 202,
    dimensions: { cols: 15, rows: 10 },
    props: [
      { type: 'arcade_machine', x: 3, y: 3, rot: 0 },
      { type: 'leaderboard',   x: 8,  y: 2,  rot: 0 },
      { type: 'neon_sign',      x: 10, y: 7, rot: 180 }
    ],
    onUse: 'reactionXpGain(1)',
    textures: {
      floor:   '/textures/floor-neon.png',
      wall:    '/textures/gradient.png',
      ceiling: '/textures/plasma.png'
    }
  },

  // -----------------------------------------------------------------
  // 3️⃣  Research Lab – skill‑point generator
  // -----------------------------------------------------------------
  lab: {
    id: 'lab',
    type: 'lab',
    name: 'Research Lab',
    description: 'Daily study grants bonus TL',
    theme: 'clean',
    seed: 303,
    dimensions: { cols: 10, rows: 8 },
    props: [
      { type: 'workbench',   x: 1, y: 1, rot: 0 },
      { type: 'holo_display',x: 5, y: 4, rot: 0 },
      { type: 'lab_chair',   x: 3, y: 6, rot: 90 },
      { type: 'data_pad',    x: 7, y: 2, rot: 0 }
    ],
    onUse: 'dailyTLBonus',
    textures: {
      floor:   '/textures/floor-clean.png',
      wall:    '/textures/white.png',
      ceiling: '/textures/soft.png'
    }
  },

  // -----------------------------------------------------------------
  // 4️⃣  Safe Hub – Sanctuary (no‑pvp)
  // -----------------------------------------------------------------
  sanctuary: {
    id: 'sanctuary',
    type: 'hub',
    name: 'Sanctuary',
    description: 'Tutorial & social hub',
    theme: 'garden',
    seed: 404,
    dimensions: { cols: 20, rows: 12 },
    props: [
      { type: 'bench',       x: 5, y: 5, rot: 0 },
      { type: 'vending',     x: 8, y: 3, rot: 0 },
      { type: 'trainer',     x: 12, y: 8, rot: 180 },
      { type: 'market_demo', x: 15, y: 10, rot: 0 }
    ],
    onUse: 'tutorialFlagSet',   // marks tutorial steps
    textures: {
      floor:   '/textures/floor-garden.png',
      wall:    '/textures/leaf.png',
      ceiling: '/textures/sky.png'
    }
  },

  // -----------------------------------------------------------------
  // 5️⃣  Danger Zone – Wasteland (PvP hotspot)
  // -----------------------------------------------------------------
  wasteland: {
    id: 'wasteland',
    type: 'danger_zone',
    name: 'Wasteland',
    description: 'High‑risk PvP area, boss raids',
    theme: 'ruins',
    seed: 505,
    dimensions: { cols: 18, rows: 11 },
    props: [
      { type: 'ruin',        x: 2, y: 2, rot: 0 },
      { type: 'spike_trap',  x: 6, y: 5, rot: 0 },
      { type: 'supply_crate',x: 10, y: 3, rot: 0 },
      { type: 'danger_sign', x: 14, y: 8, rot: 90 }
    ],
    onUse: 'combatXpBoost(2)', // faster combat TL gain
    textures: {
      floor:   '/textures/floor-ruins.png',
      wall:    '/textures/stone.png',
      ceiling: '/textures/dust.png'
    }
  }
};