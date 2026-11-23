window.RegionGen = window.RegionGen || {};
window.RegionGen['beach'] = function(api){
  var T = api.T;

  // ---- 1. SEA on the SW diagonal half ----------------------------------
  // Grid starts all grass. For each tile, decide sea / beach / land by the
  // anti-diagonal (col+row). Big values = far SW corner = deep water.
  var SEA_LINE  = 52;   // (col+row) > this => WATER
  var SAND_LO   = 48;   // (col+row) in [SAND_LO..SEA_LINE] => SAND beach band
  for (var r = 0; r <= 51; r++){
    for (var c = 0; c <= 51; c++){
      var d = c + r;
      if (d > SEA_LINE)      api.set(c, r, T.WATER);
      else if (d >= SAND_LO) api.set(c, r, T.SAND);
      // else keep GRASS
    }
  }

  // Helper: is a coordinate on land (grass/sand) & in-bounds?
  function onLand(c, r){
    if (c < 0 || c > 51 || r < 0 || r > 51) return false;
    var t = api.get(c, r);
    return t === T.GRASS || t === T.SAND;
  }

  // ---- 2. ROADS FIRST --------------------------------------------------
  // 2a. BOARDWALK spine: a width-2 DOCK line running PARALLEL to the coast,
  //     ~4-5 tiles inland of the sand/water edge. The coast is the line
  //     col+row = SEA_LINE. A parallel line inland sits at col+row ~ 42.
  //     Parameterize points along that anti-diagonal.
  // Points where col+row = 42, sweeping from NW-ish to SE-ish.
  var bw = [];
  for (var s = 6; s <= 40; s++){
    var bc = s;        // col
    var br = 42 - s;   // row so that bc+br = 42
    if (bc >= 0 && bc <= 51 && br >= 0 && br <= 51){
      bw.push([bc, br]);
    }
  }
  // draw the boardwalk spine (width 2, DOCK)
  for (var i = 0; i < bw.length - 1; i++){
    api.roadLine(bw[i][0], bw[i][1], bw[i+1][0], bw[i+1][1], 2, T.DOCK);
  }

  // 2b. THREE PIERS jutting SW into the water, perpendicular to the coast.
  // Perpendicular to anti-diagonal (col+row=const) is the direction where
  // col and row BOTH increase (moving toward the sea, larger col+row).
  var pierRoots = [];
  var pierAnchors = [10, 22, 34]; // approx 's' positions along boardwalk
  for (var pa = 0; pa < pierAnchors.length; pa++){
    var s0 = pierAnchors[pa];
    var rc = s0;         // root col on boardwalk (col+row=42)
    var rr = 42 - s0;    // root row
    pierRoots.push([rc, rr]);
    // extend SW into water: increase both col & row => col+row grows
    var len = 9;
    var ec = rc + len;
    var er = rr + len;
    if (ec > 51) ec = 51;
    if (er > 51) er = 51;
    api.roadLine(rc, rr, ec, er, 2, T.DOCK);
  }

  // 2c. INLAND UPLAND street grid (NE land). Keep away from the coast band.
  //     Horizontal-ish and vertical-ish streets on the NE grass.
  // Vertical streets
  api.roadLine(14, 2, 14, 30, 1, T.PATH);
  api.roadLine(24, 2, 24, 26, 1, T.PATH);
  api.roadLine(34, 2, 34, 18, 1, T.PATH);
  api.roadLine(44, 2, 44, 14, 1, T.PATH);
  // Horizontal streets
  api.roadLine(6, 6, 48, 6, 1, T.PATH);
  api.roadLine(4, 14, 44, 14, 1, T.PATH);
  api.roadLine(2, 22, 34, 22, 1, T.PATH);
  api.roadLine(4, 30, 24, 30, 1, T.PATH);

  // ---- 3. BUILDINGS ----------------------------------------------------
  // 3a. LIGHTHOUSE on a rocky point at the south tip near the water.
  //     Put it on a small grass/sand spit; south tip ~ high col+row corner
  //     but still on land. Use around (36,10)? No — south tip means large
  //     col+row but land. A spit at col+row ~ 44 near boardwalk SE end.
  api.building({col:39, row:5, w:3, d:3, floors:4, landmark:'lighthouse',
    wall:'#f4f4f4', roof:'#c0281f', accent:'#c0281f', name:'LIGHTHOUSE'});

  // 3b. DOCKSIDE at the pier roots: warehouses + fish market + cannery +
  //     cranes. Placed on land just NE of each pier root.
  // Crane structures (tall thin) right at pier roots (on boardwalk-adjacent land)
  api.building({col:8,  row:31, w:1, d:1, floors:4, kind:'shop',
    wall:'#e8b020', roof:'#6a7078', name:'CRANE'});
  api.building({col:20, row:19, w:1, d:1, floors:4, kind:'shop',
    wall:'#e8b020', roof:'#6a7078', name:'CRANE'});
  api.building({col:32, row:7,  w:1, d:1, floors:4, kind:'shop',
    wall:'#e8b020', roof:'#6a7078', name:'CRANE'});

  // Warehouses / fish market / cannery (grey steel, flat roofs)
  api.building({col:5,  row:26, w:4, d:3, floors:1, kind:'shop',
    wall:'#a0a8b0', roof:'#6a7078', name:'WAREHOUSE'});
  api.building({col:12, row:33, w:3, d:3, floors:1, kind:'shop',
    wall:'#a0a8b0', roof:'#6a7078', name:'FISH MARKET'});
  api.building({col:26, row:23, w:3, d:3, floors:2, kind:'shop',
    wall:'#9a6a5a', roof:'#6a7078', name:'CANNERY'});
  api.building({col:18, row:26, w:3, d:2, floors:1, kind:'shop',
    wall:'#a0a8b0', roof:'#6a7078', name:'WAREHOUSE'});

  // 3c. BOARDWALK SHOP strip (bright fronts) near the boardwalk + PIER tower.
  api.building({col:16, row:33, w:2, d:2, floors:1, kind:'shop',
    wall:'#ff8f4a', roof:'#c05040', name:'CAFE'});
  api.building({col:22, row:31, w:2, d:2, floors:1, kind:'shop',
    wall:'#ffd23f', roof:'#c05040', name:'BAR'});
  api.building({col:28, row:27, w:2, d:2, floors:1, kind:'shop',
    wall:'#4ec9d0', roof:'#4a90a0', name:'MARKET'});
  api.building({col:30, row:19, w:2, d:2, floors:1, kind:'shop',
    wall:'#ff6f91', roof:'#c05040', name:'SHOP'});
  // PIER tower (ferris-wheel feel) right on the boardwalk
  api.building({col:24, row:15, w:3, d:3, floors:5, landmark:'tower',
    kind:'shop', wall:'#ffd23f', roof:'#ff6f91', accent:'#4ec9d0', name:'PIER'});

  // 3d. INLAND UPLAND pastel COTTAGES (porches face the sea = SW).
  var cottage = [
    {col:10, row:9,  wall:'#f4c8a0', roof:'#c05040', name:'COTTAGE'},
    {col:18, row:9,  wall:'#a8d8e0', roof:'#4a90a0', name:'COTTAGE'},
    {col:26, row:9,  wall:'#f0d878', roof:'#c05040', name:'INN'},
    {col:36, row:9,  wall:'#f4c8a0', roof:'#4a90a0', name:'COTTAGE'},
    {col:10, row:17, wall:'#a8d8e0', roof:'#c05040', name:'COTTAGE'},
    {col:18, row:17, wall:'#f0d878', roof:'#4a90a0', name:'COTTAGE'},
    {col:28, row:17, wall:'#f4c8a0', roof:'#c05040', name:'COTTAGE'},
    {col:8,  row:25, wall:'#a8d8e0', roof:'#4a90a0', name:'COTTAGE'},
    {col:16, row:11, wall:'#f0d878', roof:'#c05040', name:'COTTAGE'},
    {col:38, row:16, wall:'#f4c8a0', roof:'#4a90a0', name:'COTTAGE'}
  ];
  for (var k = 0; k < cottage.length; k++){
    var cg = cottage[k];
    api.building({col:cg.col, row:cg.row, w:2, d:2,
      floors: api.rint(1,2), kind:'home',
      wall:cg.wall, roof:cg.roof, name:cg.name});
  }

  // 3dz. PUB on the boardwalk near the pier — tactical missions
  api.building({col:20,row:28,w:3,d:3,floors:1,kind:'shop',wall:'#5a3a1a',roof:'#3a2210',accent:'#e8c45c',name:'PUB'});

  // 3e. AIRPORT transit landmark in the inland-high NE corner.
  api.building({col:46, row:6, w:4, d:3, landmark:'airport', kind:'transit',
    wall:'#cfd6dc', roof:'#4a90a0', accent:'#ffd23f', name:'AIR PAD'});

  // ---- 4. PROPS --------------------------------------------------------
  // 4a. Small boats / goods (crates) + fish-market stalls at the pier roots.
  for (var pr = 0; pr < pierRoots.length; pr++){
    var pc = pierRoots[pr][0], prow = pierRoots[pr][1];
    // crates hugging the root on the DOCK
    if (api.get(pc+1, prow+1) === T.DOCK) api.prop('crate', pc+1, prow+1);
    if (api.get(pc+2, prow+2) === T.DOCK) api.prop('crate', pc+2, prow+2);
    // a fish-market stall on land beside the root
    if (onLand(pc-1, prow-1)) api.prop('stall', pc-1, prow-1, {color:'#4ec9d0'});
    if (onLand(pc-1, prow))   api.prop('stall', pc-1, prow,   {color:'#ff8f4a'});
  }

  // 4b. PALM trees lining the boardwalk (one tile inland of each spine pt).
  for (var b = 0; b < bw.length; b += 3){
    var lc = bw[b][0] - 1, lr = bw[b][1] - 1; // NE (inland) of spine
    if (onLand(lc, lr)) api.tree(lc, lr);
  }
  // Palms dotting the upland
  for (var pnum = 0; pnum < 20; pnum++){
    var tc = api.rint(4, 47), tr = api.rint(3, 24);
    if (onLand(tc, tr) && api.get(tc, tr) === T.GRASS && api.chance(0.6)){
      api.prop('palm', tc, tr);
    }
  }

  // 4c. Rocks near the lighthouse point.
  for (var rk = 0; rk < 8; rk++){
    var rkc = api.rint(37, 43), rkr = api.rint(3, 9);
    if (onLand(rkc, rkr)) api.prop('rock', rkc, rkr);
  }

  // 4d. Lamps + benches along the boardwalk (inland side of spine).
  for (var lb = 1; lb < bw.length; lb += 4){
    var pcx = bw[lb][0] - 1, pcy = bw[lb][1];
    if (onLand(pcx, pcy)){
      if (lb % 8 === 1) api.prop('lamp', pcx, pcy);
      else              api.prop('bench', pcx, pcy);
    }
  }

  // 4e. Gulls (chickens) on the sand.
  for (var g = 0; g < 10; g++){
    var gc = api.rint(2, 45), gr = api.rint(2, 45);
    if (api.get(gc, gr) === T.SAND && api.chance(0.7)){
      api.prop('chicken', gc, gr);
    }
  }

  // ---- 4f. MORE PALMS lining boardwalk + upland clusters --------------
  // Denser palm run one tile inland of the spine (string-light avenue feel).
  for (var bp = 1; bp < bw.length; bp += 2){
    var bpc = bw[bp][0] - 1, bpr = bw[bp][1] - 1;
    if (onLand(bpc, bpr) && api.get(bpc, bpr) === T.GRASS && api.chance(0.5)){
      api.prop('palm', bpc, bpr);
    }
  }
  // A few palm clusters on the upland (2-3 palms huddled).
  var palmClusters = [[12,20],[30,12],[42,10],[20,24]];
  for (var pcI = 0; pcI < palmClusters.length; pcI++){
    var pcc = palmClusters[pcI][0], pcr = palmClusters[pcI][1];
    var palmOff = [[0,0],[1,0],[0,1]];
    for (var po = 0; po < palmOff.length; po++){
      var ppc = pcc + palmOff[po][0], ppr = pcr + palmOff[po][1];
      if (onLand(ppc, ppr) && api.get(ppc, ppr) === T.GRASS) api.prop('palm', ppc, ppr);
    }
  }

  // ---- 4g. MORE lamps + benches along boardwalk (string-light run) ----
  for (var sl = 0; sl < bw.length; sl += 2){
    var slc = bw[sl][0] - 1, slr = bw[sl][1];
    if (onLand(slc, slr) && api.get(slc, slr) !== T.DOCK){
      if (sl % 4 === 0) api.prop('lamp', slc, slr);
      else if (sl % 4 === 2) api.prop('bench', slc, slr);
    }
  }

  // ---- 4h. BEACH SCENE on the sand -------------------------------------
  // onSand helper (safe: never places on water/dock/land structures).
  function onSand(c, r){
    if (c < 0 || c > 51 || r < 0 || r > 51) return false;
    return api.get(c, r) === T.SAND;
  }
  // Bright beach umbrellas (stalls) scattered across the sand band.
  var umbrellaCols = ['#ff6f91','#ffd23f','#4ec9d0','#ff8f4a','#7ed957','#c084fc'];
  var umbSpots = [[16,34],[20,30],[24,26],[28,22],[12,38],[32,18],[36,14],[26,30]];
  for (var uS = 0; uS < umbSpots.length; uS++){
    var uc = umbSpots[uS][0], ur = umbSpots[uS][1];
    if (onSand(uc, ur)){
      api.prop('stall', uc, ur, {color: umbrellaCols[uS % umbrellaCols.length]});
      // a deck chair (bench) + a cooler (crate) beside a few umbrellas
      if (uS % 2 === 0 && onSand(uc+1, ur)) api.prop('bench', uc+1, ur);
      if (uS % 3 === 0 && onSand(uc, ur+1)) api.prop('crate', uc, ur+1);
    }
  }
  // Sandcastles / coolers (crates) scattered on the sand.
  for (var scI = 0; scI < 10; scI++){
    var scc = api.rint(6, 40), scr = api.rint(14, 40);
    if (onSand(scc, scr) && api.chance(0.6)) api.prop('crate', scc, scr);
  }
  // Deck chairs (benches) dotting the shoreline.
  for (var dcI = 0; dcI < 8; dcI++){
    var dcc = api.rint(6, 40), dcr = api.rint(16, 42);
    if (onSand(dcc, dcr) && api.chance(0.55)) api.prop('bench', dcc, dcr);
  }
  // Shells / driftwood rocks scattered on the sand.
  for (var shI = 0; shI < 14; shI++){
    var shc = api.rint(4, 44), shr = api.rint(14, 44);
    if (onSand(shc, shr) && api.chance(0.5)) api.prop('rock', shc, shr);
  }
  // Extra gulls (chickens) dotting the sand.
  for (var gg = 0; gg < 12; gg++){
    var ggc = api.rint(4, 44), ggr = api.rint(14, 44);
    if (onSand(ggc, ggr) && api.chance(0.6)) api.prop('chicken', ggc, ggr);
  }

  // ---- 4i. TIDE POOLS in the sand near the shore -----------------------
  // Small water discs ringed by rocks. Placed inside the SAND band so they
  // read as pools, not the open sea. (col+row in [SAND_LO..SEA_LINE].)
  var tidePools = [[24,25],[30,20],[18,29]];
  for (var tp = 0; tp < tidePools.length; tp++){
    var tpc = tidePools[tp][0], tpr = tidePools[tp][1];
    if (onSand(tpc, tpr)){
      api.disc(tpc, tpr, 1, T.WATER);
      // ring the pool with a few rocks on the sand
      var rockRing = [[-1,-1],[0,-2],[2,0],[-2,0],[1,2]];
      for (var rr2 = 0; rr2 < rockRing.length; rr2++){
        var rpc = tpc + rockRing[rr2][0], rpr = tpr + rockRing[rr2][1];
        if (onSand(rpc, rpr) && api.chance(0.7)) api.prop('rock', rpc, rpr);
      }
    }
  }

  // ---- 4j. MARINA / MARKET ROW near the docks --------------------------
  // Extra stall shops + crates clustered on land by the warehouse district.
  var marina = [
    [10,29,'#ff8f4a'],[11,29,'#4ec9d0'],[9,28,'#ffd23f'],
    [14,31,'#ff6f91'],[15,31,'#7ed957'],[13,30,'#c084fc']
  ];
  for (var mI = 0; mI < marina.length; mI++){
    var mc = marina[mI][0], mr = marina[mI][1];
    if (onLand(mc, mr)) api.prop('stall', mc, mr, {color: marina[mI][2]});
  }
  var marinaCrates = [[10,30],[11,30],[14,30],[9,29],[15,32],[12,29]];
  for (var mcI = 0; mcI < marinaCrates.length; mcI++){
    var mcc = marinaCrates[mcI][0], mcr = marinaCrates[mcI][1];
    if (onLand(mcc, mcr)) api.prop('crate', mcc, mcr);
  }

  // ---- 4k. MORE goods (crates) along the pier decks --------------------
  // Rows of crates hugging the DOCK piers (dock-only, so never on water).
  for (var pr2 = 0; pr2 < pierRoots.length; pr2++){
    var ppc0 = pierRoots[pr2][0], ppr0 = pierRoots[pr2][1];
    for (var step = 3; step <= 8; step++){
      var dcx = ppc0 + step, dcy = ppr0 + step;
      if (api.get(dcx, dcy) === T.DOCK && step % 2 === 1) api.prop('crate', dcx, dcy);
      // a stacked crate on the side lane of the width-2 pier
      if (api.get(dcx, dcy+1) === T.DOCK && step % 3 === 0) api.prop('crate', dcx, dcy+1);
    }
  }
  // Fish-market stalls at the pier roots (a couple more, on land).
  var pierMarket = [[7,30,'#4ec9d0'],[19,18,'#ff8f4a'],[31,6,'#ffd23f']];
  for (var pmI = 0; pmI < pierMarket.length; pmI++){
    var pmc = pierMarket[pmI][0], pmr = pierMarket[pmI][1];
    if (onLand(pmc, pmr)) api.prop('stall', pmc, pmr, {color: pierMarket[pmI][2]});
  }

  // ---- 4l. A FEW MORE pastel cottages filling upland gaps --------------
  var extraCottage = [
    {col:32, row:13, wall:'#f4c8a0', roof:'#c05040', name:'COTTAGE'},
    {col:42, row:16, wall:'#a8d8e0', roof:'#4a90a0', name:'COTTAGE'},
    {col:20, row:5,  wall:'#f0d878', roof:'#c05040', name:'COTTAGE'},
    {col:6,  row:18, wall:'#f4c8a0', roof:'#4a90a0', name:'COTTAGE'}
  ];
  for (var ec2 = 0; ec2 < extraCottage.length; ec2++){
    var xc = extraCottage[ec2];
    api.building({col:xc.col, row:xc.row, w:2, d:2,
      floors: api.rint(1,2), kind:'home',
      wall:xc.wall, roof:xc.roof, name:xc.name});
  }

  // ---- 4m. A couple CARS on the inland streets -------------------------
  var cars = [[14,10,'#c0281f'],[24,14,'#3060c0']];
  for (var carI = 0; carI < cars.length; carI++){
    var carc = cars[carI][0], carr = cars[carI][1];
    if (onLand(carc, carr)) api.prop('car', carc, carr, {color: cars[carI][2]});
  }

  // ---- 5. NPCs ---------------------------------------------------------
  api.villagers(16);

  // ---- 6. SPAWN (walkable) --------------------------------------------
  // Prefer the boardwalk area; (30,28) region is DOCK/land. Ensure not water.
  var sc = 30, sr = 28;
  if (api.get(sc, sr) === T.WATER){
    // fall back to a known land tile in the upland
    sc = 24; sr = 20;
  }
  // sailboats moored on the water near the piers
  var placedBoats = 0;
  for (var boc = 4; boc < 46 && placedBoats < 7; boc += 6){
    for (var bor = 40; bor < 52; bor++){
      if (api.get(boc, bor) === T.WATER){ api.prop('boat', boc, bor); placedBoats++; break; }
    }
  }
  api.spawn(sc, sr);
};
