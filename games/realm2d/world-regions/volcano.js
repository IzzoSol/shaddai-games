window.RegionGen = window.RegionGen || {};
window.RegionGen['volcano'] = function(api){
  var T = api.T;
  var CC = 26, CR = 26;

  // ---- GROUND: start all grass (terrain tints dark), shape with LAVA + PATH ----
  api.fill(T.GRASS);

  // Inner molten core (the vent pool) — impassable
  api.disc(CC, CR, 3, T.LAVA);

  // LAVA FISSURES radiating out from near center — impassable rivers
  var fissureEnds = [
    [26, 4], [44, 14], [48, 38], [26, 48], [8, 40], [6, 14]
  ];
  for (var f = 0; f < fissureEnds.length; f++){
    api.roadLine(CC, CR, fissureEnds[f][0], fissureEnds[f][1], 2, T.LAVA);
  }

  // ---- RIM RING PATH: innermost walkable loop circling the vent ----
  api.ring(CC, CR, 6, 2, T.PATH);

  // ---- SIX RADIAL CRUST PATHS between the fissures (offset angles) ----
  // Fissure angles roughly every 60deg starting near -90deg; offset paths by +30deg
  var pathAngles = [
    -60, 0, 60, 120, 180, 240
  ];
  var RIM = 6, OUTER = 16;
  var bridgeSpots = [];
  for (var p = 0; p < pathAngles.length; p++){
    var a = pathAngles[p] * Math.PI / 180;
    var c0 = Math.round(CC + Math.cos(a) * RIM);
    var r0 = Math.round(CR + Math.sin(a) * RIM);
    var c1 = Math.round(CC + Math.cos(a) * OUTER);
    var r1 = Math.round(CR + Math.sin(a) * OUTER);
    api.roadLine(c0, r0, c1, r1, 2, T.PATH);
    // remember a mid point as a potential bridge chokepoint
    bridgeSpots.push([Math.round(CC + Math.cos(a) * 11), Math.round(CR + Math.sin(a) * 11)]);
  }

  // ---- OUTER ASH RING: safe-ish residential loop ----
  api.ring(CC, CR, 16, 2, T.PATH);

  // ---- LAVA BRIDGES (DOCK tiles) where crust paths cross fissures ----
  // Lay short DOCK spans across the fissures so crossings stay walkable.
  function bridge(cc, rr){
    for (var dr = -1; dr <= 1; dr++){
      for (var dc = -1; dc <= 1; dc++){
        var c = cc + dc, r = rr + dr;
        if (c < 0 || c > 51 || r < 0 || r > 51) continue;
        if (api.get(c, r) === T.LAVA) api.set(c, r, T.DOCK);
      }
    }
  }
  // Place a few bridges at chokepoints along the fissures
  bridge(26, 10);   // north fissure crossing
  bridge(40, 16);   // north-east fissure crossing
  bridge(41, 34);   // east fissure crossing
  bridge(26, 40);   // south fissure crossing

  // ---- THE GREAT VOLCANO: massive erupting landmark dominating the region ----
  api.prop('volcano', 24, 24, { w: 8, d: 8, scale: 2.7 });

  // =========================================================
  // BUILDINGS
  // =========================================================
  function ringPoint(rad, deg){
    var a = deg * Math.PI / 180;
    return [Math.round(CC + Math.cos(a) * rad), Math.round(CR + Math.sin(a) * rad)];
  }

  // ---- FORGEWORKS (inner, r ~8-11): dark forges & smelters hugging the vent ----
  var forgeDefs = [
    { deg: -50, name: 'GREAT SMELTER' },
    { deg: 10,  name: 'FORGE' },
    { deg: 70,  name: 'FORGE' },
    { deg: 130, name: 'GREAT SMELTER' },
    { deg: 190, name: 'FORGE' },
    { deg: 250, name: 'FORGE' }
  ];
  for (var fd = 0; fd < forgeDefs.length; fd++){
    var fp = ringPoint(9, forgeDefs[fd].deg);
    api.building({
      col: fp[0] - 1, row: fp[1] - 1, w: 3, d: 3, floors: 2,
      kind: 'shop', landmark: 'forge',
      wall: '#20191c', roof: '#181418', glass: '#ff8a3c', accent: '#ff5a1f',
      name: forgeDefs[fd].name
    });
  }

  // ---- OBSIDIAN SPIRES (tall) ----
  var spireDegs = [ -25, 45, 105, 215 ];
  for (var s = 0; s < spireDegs.length; s++){
    var sp = ringPoint(12, spireDegs[s]);
    api.building({
      col: sp[0], row: sp[1], w: 2, d: 2, floors: (5 + api.rint(0, 2)),
      kind: 'office',
      wall: '#20191c', roof: '#181418', glass: '#5fe0ff', accent: '#5fe0ff',
      name: 'OBSIDIAN SPIRE'
    });
  }

  // ---- BINAH NEEDLE: signature spire w/ air pad ----
  var bn = ringPoint(12, 155);
  api.building({
    col: bn[0], row: bn[1], w: 2, d: 2, floors: 7,
    kind: 'transit', landmark: 'tower',
    wall: '#20191c', roof: '#181418', glass: '#5fe0ff', accent: '#5fe0ff',
    name: 'BINAH NEEDLE'
  });

  // ---- EMBER HUTS (outer ash ring, r ~18-20): low dark huts ----
  var hutDefs = [
    { deg: -80, name: 'EMBER HUT' },
    { deg: -20, name: 'EMBER HUT' },
    { deg: 30,  name: 'THE KEEPER' },
    { deg: 95,  name: 'EMBER HUT' },
    { deg: 160, name: 'EMBER HUT' },
    { deg: 215, name: 'EMBER HUT' },
    { deg: 285, name: 'EMBER HUT' }
  ];
  for (var h = 0; h < hutDefs.length; h++){
    var hp = ringPoint(19, hutDefs[h].deg);
    api.building({
      col: hp[0] - 1, row: hp[1] - 1, w: 2, d: 2, floors: 1,
      kind: 'home',
      wall: '#4a453f', roof: '#2a2622', glass: '#ff8a3c', accent: '#ff5a1f',
      name: hutDefs[h].name
    });
  }

  // =========================================================
  // PROPS
  // =========================================================
  // Many lavarocks scattered on the obsidian/ash mid-ground (only on walkable land)
  var placed = 0, tries = 0;
  while (placed < 90 && tries < 600){
    tries++;
    var pc = api.rint(2, 49), pr = api.rint(2, 49);
    var t = api.get(pc, pr);
    if (t !== T.GRASS && t !== T.PATH) continue;
    var dist = Math.sqrt((pc - CC) * (pc - CC) + (pr - CR) * (pr - CR));
    if (dist < 6 || dist > 24) continue;
    // don't crowd the paths too much
    if (t === T.PATH && api.chance(0.7)) continue;
    api.prop('lavarock', pc, pr);
    placed++;
  }

  // A few rocks & crates near the forges
  for (var fd2 = 0; fd2 < forgeDefs.length; fd2 += 2){
    var frp = ringPoint(10, forgeDefs[fd2].deg + 8);
    if (api.get(frp[0], frp[1]) === T.GRASS){
      api.prop(api.chance(0.5) ? 'rock' : 'crate', frp[0], frp[1]);
    }
  }
  var cratePts = [ ringPoint(8, 30), ringPoint(8, 210), ringPoint(10, 90) ];
  for (var cp = 0; cp < cratePts.length; cp++){
    var cpt = cratePts[cp];
    if (api.get(cpt[0], cpt[1]) === T.GRASS) api.prop('crate', cpt[0], cpt[1]);
  }

  // Ember-glow lamps along the outer ash ring
  for (var la = 0; la < 360; la += 45){
    var lp = ringPoint(16, la + 22);
    if (api.get(lp[0], lp[1]) === T.PATH || api.get(lp[0], lp[1]) === T.GRASS){
      // set just off the path onto adjacent land if possible
      var lc = lp[0], lr = lp[1];
      if (api.get(lc, lr) === T.PATH){
        var offc = Math.round(CC + Math.cos((la + 22) * Math.PI / 180) * 18);
        var offr = Math.round(CR + Math.sin((la + 22) * Math.PI / 180) * 18);
        if (offc >= 0 && offc <= 51 && offr >= 0 && offr <= 51 && api.get(offc, offr) === T.GRASS){
          lc = offc; lr = offr;
        }
      }
      api.prop('lamp', lc, lr);
    }
  }

  // =========================================================
  // EMBERFIELDS EXTRA DETAIL (added — never on LAVA tiles)
  // =========================================================
  // Safe placement helper: only on walkable GRASS/PATH/DOCK, never LAVA.
  function safeProp(type, c, r){
    if (c < 1 || c > 50 || r < 1 || r > 50) return false;
    var tt = api.get(c, r);
    if (tt === T.LAVA) return false;
    if (tt !== T.GRASS && tt !== T.PATH && tt !== T.DOCK) return false;
    api.prop(type, c, r);
    return true;
  }

  // ---- OBSIDIAN FORMATIONS: jagged spire clusters across the ash mid-ground ----
  var forms = 0, ftries = 0;
  while (forms < 34 && ftries < 300){
    ftries++;
    var oc = api.rint(2, 49), or_ = api.rint(2, 49);
    var od = Math.sqrt((oc - CC) * (oc - CC) + (or_ - CR) * (or_ - CR));
    if (od < 7 || od > 23) continue;
    if (api.get(oc, or_) !== T.GRASS) continue; // keep paths clear
    var kind = api.chance(0.6) ? 'lavarock' : 'rock';
    if (safeProp(kind, oc, or_)){
      forms++;
      // occasional twin/triplet cluster for a jagged look
      if (api.chance(0.4)) safeProp('rock', oc + (api.chance(0.5) ? 1 : -1), or_);
      if (api.chance(0.25)) safeProp('lavarock', oc, or_ + (api.chance(0.5) ? 1 : -1));
    }
  }

  // ---- SECONDARY LAVA POOLS (outer field, away from spawn & main paths) ----
  // Small pools in the ash; safe because we only carve GRASS and re-check spawn.
  var poolSpots = [ ringPoint(20, 45), ringPoint(21, 235) ];
  for (var ps = 0; ps < poolSpots.length; ps++){
    var pt = poolSpots[ps];
    // only carve if the local area is plain grass (don't sever a path)
    var clean = true;
    for (var qr = -2; qr <= 2 && clean; qr++){
      for (var qc = -2; qc <= 2; qc++){
        var gt = api.get(pt[0] + qc, pt[1] + qr);
        if (gt === T.PATH || gt === T.DOCK){ clean = false; break; }
      }
    }
    if (!clean) continue;
    api.disc(pt[0], pt[1], 2, T.LAVA);
    // ember lamps ringing the new pool (on the grass rim, never on lava)
    safeProp('lamp', pt[0] + 3, pt[1]);
    safeProp('lamp', pt[0] - 3, pt[1]);
    safeProp('lamp', pt[0], pt[1] + 3);
  }

  // ---- MORE FORGE-DISTRICT LIFE: crates, lamps & fences by the forges ----
  for (var fl = 0; fl < forgeDefs.length; fl++){
    var base = forgeDefs[fl].deg;
    var cA = ringPoint(11, base + 6);
    var cB = ringPoint(11, base - 6);
    var lA = ringPoint(10, base);
    safeProp('crate', cA[0], cA[1]);
    safeProp('crate', cB[0], cB[1]);
    safeProp('lamp', lA[0], lA[1]);
    if (api.chance(0.5)){
      var fenceP = ringPoint(12, base + 3);
      safeProp('fence', fenceP[0], fenceP[1]);
    }
  }
  // Stacked ore supply piles at a couple of smelters
  var oreDegs = [ -50, 130 ];
  for (var od2 = 0; od2 < oreDegs.length; od2++){
    var ob = ringPoint(11, oreDegs[od2]);
    for (var ok = 0; ok < 3; ok++){
      safeProp('crate', ob[0] + ok - 1, ob[1] + (ok === 1 ? 1 : 0));
    }
  }

  // ---- FENCE BARRIERS along the inner rim near lava edges (safety rails) ----
  for (var fb = 0; fb < 360; fb += 40){
    var fbp = ringPoint(7, fb + 15);
    if (api.get(fbp[0], fbp[1]) === T.GRASS) safeProp('fence', fbp[0], fbp[1]);
  }

  // ---- LAVA BRIDGE DETAIL: ember lamps at each bridge end ----
  var bridgeCenters = [ [26, 10], [40, 16], [41, 34], [26, 40] ];
  for (var bc = 0; bc < bridgeCenters.length; bc++){
    var bcx = bridgeCenters[bc][0], bcy = bridgeCenters[bc][1];
    // try lamps just outside the DOCK span (on adjacent crust)
    safeProp('lamp', bcx + 2, bcy);
    safeProp('lamp', bcx - 2, bcy);
    safeProp('lamp', bcx, bcy + 2);
    safeProp('lamp', bcx, bcy - 2);
  }

  // ---- EMBER HUT HAMLET DETAIL: crates, lamps & fences around outer huts ----
  for (var hh = 0; hh < hutDefs.length; hh++){
    var hb = hutDefs[hh].deg;
    var hCrate = ringPoint(20, hb + 5);
    var hLamp  = ringPoint(18, hb - 5);
    var hFence = ringPoint(21, hb);
    safeProp('crate', hCrate[0], hCrate[1]);
    safeProp('lamp', hLamp[0], hLamp[1]);
    if (api.chance(0.5)) safeProp('fence', hFence[0], hFence[1]);
  }

  // ---- A FEW MORE OBSIDIAN SPIRES + one extra forge ----
  var extraSpireDegs = [ 15, 175, 300 ];
  for (var es = 0; es < extraSpireDegs.length; es++){
    var esp = ringPoint(13, extraSpireDegs[es]);
    // only build if footprint isn't on lava
    if (api.get(esp[0], esp[1]) !== T.LAVA && api.get(esp[0] + 1, esp[1] + 1) !== T.LAVA){
      api.building({
        col: esp[0], row: esp[1], w: 2, d: 2, floors: (5 + api.rint(0, 2)),
        kind: 'office',
        wall: '#20191c', roof: '#181418', glass: '#5fe0ff', accent: '#5fe0ff',
        name: 'OBSIDIAN SPIRE'
      });
    }
  }
  var xf = ringPoint(10, 320);
  if (api.get(xf[0] - 1, xf[1] - 1) !== T.LAVA && api.get(xf[0] + 1, xf[1] + 1) !== T.LAVA){
    api.building({
      col: xf[0] - 1, row: xf[1] - 1, w: 3, d: 3, floors: 2,
      kind: 'shop', landmark: 'forge',
      wall: '#20191c', roof: '#181418', glass: '#ff8a3c', accent: '#ff5a1f',
      name: 'ASH FORGE'
    });
  }

  // ---- EXTRA EMBER LIGHTS along the outer ash ring (denser glow) ----
  for (var el = 0; el < 360; el += 30){
    var elp = ringPoint(17, el + 12);
    safeProp('lamp', elp[0], elp[1]);
  }

  // =========================================================
  // NPCs
  // =========================================================
  api.villagers(6);

  // Ensure spawn tile on the outer ash ring is walkable
  if (api.get(26, 42) !== T.PATH && api.get(26, 42) !== T.GRASS){
    api.set(26, 42, T.PATH);
  }
  api.spawn(26, 42);
};
