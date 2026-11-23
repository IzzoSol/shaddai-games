/* ============================================================================
 * SHADDAI · realm-progress.js — ONE REALM AT A TIME (2026-11-22 redesign)
 * ----------------------------------------------------------------------------
 * RuneScape-style gated progression for the Classic 2D World: the player
 * starts in ONE home realm (Green Meadow). Every other realm is LOCKED —
 * visible on the region picker and the world map with its requirement —
 * until the realm before it is COMPLETED: its story chapter finished and
 * its Gate Rite performed (see story-2d.js). Realms then open one by one
 * in ORDER, each feeding the next.
 *
 * State persists in localStorage 'shaddai.realmProgress':
 *   { unlocked:{id:1}, completed:{id:1} }
 * Defensive: any storage failure degrades to "home realm only", never a crash.
 *
 * API: window.RealmProgress = { ORDER, HOME, isUnlocked, isCompleted,
 *        currentRealm, complete, reqText, gateCost, state, reset }
 * ==========================================================================*/
(function (root) {
  'use strict';
  var KEY = 'shaddai.realmProgress';
  var ORDER = ['meadow', 'forest', 'beach', 'suburb', 'city', 'desert', 'volcano', 'agentcity', 'darkforest'];
  var HOME = 'meadow';
  var NAMES = {
    meadow: 'Green Meadow', forest: 'Wildwood', beach: 'Sunny Harbor', suburb: 'The Suburbs',
    city: 'Downtown', desert: 'Dust Canyon', volcano: 'Emberfields', agentcity: 'SHADDAI City', darkforest: 'Dark Realm'
  };

  function load() {
    try {
      var j = JSON.parse(root.localStorage.getItem(KEY) || 'null');
      if (j && j.unlocked) return j;
    } catch (e) {}
    return { unlocked: { meadow: 1 }, completed: {} };
  }
  var S = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  function idx(id) { return ORDER.indexOf(id); }
  function isUnlocked(id) { return id === HOME || !!S.unlocked[id]; }
  function isCompleted(id) { return !!S.completed[id]; }
  // the first realm in ORDER that is unlocked but not yet completed = where the story lives now
  function currentRealm() {
    for (var i = 0; i < ORDER.length; i++) if (isUnlocked(ORDER[i]) && !isCompleted(ORDER[i])) return ORDER[i];
    return ORDER[ORDER.length - 1];
  }
  function reqText(id) {
    var i = idx(id);
    if (i <= 0 || isUnlocked(id)) return '';
    var prev = ORDER[i - 1];
    return 'Complete ' + (NAMES[prev] || prev) + ' — finish its story chapter and perform the Gate Rite.';
  }
  // Gate Rite cost in gold, by position in the chain (the rite is the realm's completion gate)
  function gateCost(id) { return 25 * (idx(id) + 1); }

  // Mark a realm completed → unlock the next one in ORDER. Returns the newly unlocked id or null.
  function complete(id) {
    if (!isUnlocked(id) || isCompleted(id)) return null;
    S.completed[id] = 1;
    var n = ORDER[idx(id) + 1];
    if (n && !S.unlocked[n]) { S.unlocked[n] = 1; save(); return n; }
    save(); return null;
  }

  root.RealmProgress = {
    ORDER: ORDER, HOME: HOME, NAMES: NAMES,
    isUnlocked: isUnlocked, isCompleted: isCompleted, currentRealm: currentRealm,
    complete: complete, reqText: reqText, gateCost: gateCost,
    state: function () { return JSON.parse(JSON.stringify(S)); },
    reset: function () { S = { unlocked: { meadow: 1 }, completed: {} }; save(); }
  };
})(window);
