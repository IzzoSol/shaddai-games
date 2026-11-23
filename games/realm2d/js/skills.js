/**
 * skills.js – defines three skill trees (Crafting, Combat, Knowledge)
 * each tier stores: requiredXP, totalXP, effects (TL gain, stat boost)
 * Effects are applied when a tier is unlocked; TL increments automatically.
 */
const SKILL_TREES = {
  Crafting: {
    name: 'Crafting',
    description: 'Upgrade crafting speed & item quality',
    tiers: [
      {id: 1, xp: 0, effect: {tlGain: 0, statBoost: {craftSpeed: 1.0}}},
      {id: 2, xp: 500, effect: {tlGain: 1, statBoost: {craftSpeed: 1.1}}},
      {id: 3, xp: 1200, effect: {tlGain: 1, statBoost: {craftQuality: 0.1}}},
      {id: 4, xp: 2100, effect: {tlGain: 1, statBoost: {craftSpeed: 1.2}}},
      {id: 5, xp: 3200, effect: {tlGain: 1, statBoost: {craftQuality: 0.2}}}
    ]
  },
  Combat: {
    name: 'Combat',
    description: 'Increase damage, defense, and attack speed',
    tiers: [
      {id: 1, xp: 0, effect: {tlGain: 0, statBoost: {damage: 1.0, defense: 1.0}}},
      {id: 2, xp: 600, effect: {tlGain: 1, statBoost: {damage: 1.05, defense: 1.05}}},
      {id: 3, xp: 1300, effect: {tlGain: 1, statBoost: {damage: 1.1, defense: 1.1}}},
      {id: 4, xp: 2000, effect: {tlGain: 1, statBoost: {damage: 1.15, defense: 1.15}}},
      {id: 5, xp: 2800, effect: {tlGain: 1, statBoost: {attackSpeed: 0.1}}}
    ]
  },
  Knowledge: {
    name: 'Knowledge',
    description: 'Research bonus, market insight, and token generation',
    tiers: [
      {id: 1, xp: 0, effect: {tlGain: 0, statBoost: {researchRate: 1.0}}},
      {id: 2, xp: 400, effect: {tlGain: 1, statBoost: {researchRate: 1.05}}},
      {id: 3, xp: 1000, effect: {tlGain: 1, statBoost: {tokenYield: 1.05}}},
      {id: 4, xp: 1700, effect: {tlGain: 1, statBoost: {researchRate: 1.1}}},
      {id: 5, xp: 2500, effect: {tlGain: 1, statBoost: {tokenYield: 1.1}}}
    ]
  }
};

/** Helper – total XP needed for a given tier in a tree */
function xpFor(treeId, tierId) {
  const tree = SKILL_TREES[treeId];
  return tree.tiers
    .find(t => t.id === tierId)
    ?.xp ?? 0;
}

/** Add XP to a tree, unlock tier, and increment Total Level (TL) */
async function addSkillXP(treeId, xpEarned) {
  const tree = SKILL_TREES[treeId];
  if (!tree) return;

  // Persist XP per tree (never re-rewarded on replay)
  const treeXP = JSON.parse(localStorage.getItem('treeXP') || '{}');
  treeXP[treeId] = (treeXP[treeId] || 0) + xpEarned;
  localStorage.setItem('treeXP', JSON.stringify(treeXP));

  // Derive unlocked tier from total XP (thresholds are cumulative)
  let unlockedTier = tree.tiers[0];
  for (const tier of tree.tiers) {
    if (treeXP[treeId] >= tier.xp) unlockedTier = tier;
  }

  // Only reward TL/stat boosts when tier actually changed
  const prevTierId = parseInt(localStorage.getItem(`skillTier_${treeId}`) || '1');
  if (unlockedTier.id > prevTierId) {
    let tl = parseInt(localStorage.getItem('totalLevel') || '0');
    // Apply TL gain (delta between old and new tier)
    for (let t = prevTierId + 1; t <= unlockedTier.id; t++) {
      const tier = tree.tiers.find(x => x.id === t);
      if (tier) tl += tier.effect.tlGain;
    }
    localStorage.setItem('totalLevel', tl.toString());
    localStorage.setItem(`skillTier_${treeId}`, unlockedTier.id.toString());

    // Merge stat boosts
    const boosts = JSON.parse(localStorage.getItem('skillBoosts') || '{}');
    boosts[treeId] = boosts[treeId] || {};
    Object.assign(boosts[treeId], unlockedTier.effect.statBoost);
    localStorage.setItem('skillBoosts', JSON.stringify(boosts));

    // Notify UI / tutorial that a new skill tier unlocked
    window.dispatchEvent(new CustomEvent('skillUnlocked', {
      detail: { tree, tier: unlockedTier }
    }));
  }
  return unlockedTier.id;
}

/* -----------------------------------------------------------
   Tutorial integration – each skill unlock can be a tutorial step
   ----------------------------------------------------------- */
const skillUnlockedHandler = (e) => {
  const {tree, tier} = e.detail;
  gameToast(`🛠️ New skill tier unlocked: ${tree} Tier ${tier.id}\nTL increased by ${tier.effect.tlGain}.`);
  // Example: mark tutorial step as done
  const steps = JSON.parse(localStorage.getItem('tutorialSteps') || '{}');
  steps[`skill_${tree.toLowerCase()}_t${tier.id}`] = true;
  localStorage.setItem('tutorialSteps', JSON.stringify(steps));
};

window.addEventListener('skillUnlocked', skillUnlockedHandler);