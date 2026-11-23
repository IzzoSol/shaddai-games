window.RegionGen = window.RegionGen || {};
window.RegionGen['suburb'] = function(api){
  var T = api.T;

  // ---- which region did the player arrive from? ----
  var from = (window.SUBURB_FROM || 'meadow');

  // ---- per-region themes ----
  // Each theme: base tile, path tile, wall palette, roof palette, floors range,
  // tree prop type, house-name list, and signature props to scatter.
  var THEMES = {
    meadow: {
      base: T.GRASS, path: T.PATH,
      walls: ['#e8dcc0','#f0e4c8','#e8e0d0','#dcd0b8','#f4ead2','#e0d8c0','#eee2cc','#d8ccb0','#f0e8d4','#e4dabf'],
      roofs: ['#c0392b','#7a3a2a','#4a6a2a','#8a5a3a','#a0432e','#5a7a3a','#6a3a2a','#4a6a2a','#9a4a2a','#5a7a3a'],
      floors: [1,2],
      tree: 'tree',
      names: ['MAPLE HOUSE','OAK COTTAGE','ROSE VILLA','WILLOW HOUSE','ELM COTTAGE','MAPLE COTTAGE','OAK VILLA','ROSE HOUSE','WILLOW LODGE','ELM HOUSE'],
      yardProps: ['fence','flowers','haybale'],
      parkProp: 'well', lampProp: 'lamp'
    },
    beach: {
      base: T.GRASS, path: T.SAND,
      walls: ['#7fd4d4','#f6a89a','#f0e2b8','#8fd8e0','#f4b0a0','#e8e0c0','#7fd0c8','#f6c0a8','#a8e0e0','#f0d8b0'],
      roofs: ['#2f9a9a','#e0603a','#d0a840','#3a9aa0','#e06a4a','#c8b050','#2f8a9a','#e07050','#3aa0a0','#d0a040'],
      floors: [1,2],
      tree: 'palm',
      names: ['SHELL HOUSE','CORAL COTTAGE','TIDE VILLA','MARINA HOUSE','SHELL VILLA','CORAL HOUSE','TIDE COTTAGE','MARINA LODGE','SHELL LODGE','CORAL VILLA'],
      yardProps: ['palm','flowers','crate'],
      parkProp: 'palm', lampProp: 'lamp'
    },
    city: {
      base: T.PATH, path: T.PATH,
      walls: ['#8a9099','#7a828c','#9096a0','#6f7680','#82889a','#767c88','#8890a0','#70768a','#9498a4','#787e90'],
      roofs: ['#3a3f4a','#2f3440','#454a58','#33aacc','#8a3ad0','#3a4050','#2f3a4a','#33bbdd','#7a3ac0','#3a4048'],
      floors: [2,3],
      tree: 'tree',
      names: ['UNIT 1A','LOFT 12','TOWER B','NEXUS FLATS','UNIT 3C','LOFT 7','TOWER C','NEXUS LOFTS','UNIT 9B','LOFT 22'],
      yardProps: ['lamp','bench'],
      parkProp: 'bench', lampProp: 'lamp'
    },
    agentcity: {
      base: T.PATH, path: T.PATH,
      walls: ['#8a9099','#7a828c','#9096a0','#6f7680','#82889a','#767c88','#8890a0','#70768a','#9498a4','#787e90'],
      roofs: ['#3a3f4a','#2f3440','#454a58','#33aacc','#8a3ad0','#3a4050','#2f3a4a','#33bbdd','#7a3ac0','#3a4048'],
      floors: [2,3],
      tree: 'tree',
      names: ['NEXUS FLATS','LOFT 12','TOWER B','UNIT 1A','NEXUS LOFTS','LOFT 7','TOWER C','UNIT 3C','NEXUS BLOCK','LOFT 22'],
      yardProps: ['lamp','bench'],
      parkProp: 'bench', lampProp: 'lamp'
    },
    forest: {
      base: T.GRASS, path: T.GRASS,
      walls: ['#6a4a2a','#5a3f22','#725030','#4f3a1f','#6a4626','#5a3e24','#70502e','#4a3520','#664428','#5c3f24'],
      roofs: ['#2f5a2a','#274a22','#356230','#22421d','#2f5228','#274a24','#30582c','#1f4020','#2f5228','#26481f'],
      floors: [1,2],
      tree: 'pine',
      names: ['CEDAR LODGE','PINE LODGE','TIMBER CABIN','FERN LODGE','CEDAR CABIN','PINE CABIN','TIMBER LODGE','FERN CABIN','CEDAR HOUSE','PINE HOUSE'],
      yardProps: ['pine','fence','crate'],
      parkProp: 'well', lampProp: 'lamp'
    },
    desert: {
      base: T.SAND, path: T.SAND,
      walls: ['#d0a060','#c8955a','#d8ab6a','#c08a50','#d4a262','#cc9856','#d8a866','#c48c52','#dcac6c','#c8945a'],
      roofs: ['#b08040','#a8783a','#b88848','#a07038','#b48244','#ac7c3e','#b8884a','#a47438','#bc8c4e','#a87a3c'],
      floors: [1,2],
      tree: 'cactus',
      names: ['ADOBE HOUSE','MESA COTTAGE','DUNE VILLA','OASIS HOUSE','ADOBE VILLA','MESA HOUSE','DUNE COTTAGE','OASIS LODGE','ADOBE LODGE','MESA VILLA'],
      yardProps: ['cactus','well','crate'],
      parkProp: 'well', lampProp: 'lamp'
    },
    volcano: {
      base: T.PATH, path: T.PATH,
      walls: ['#2a2830','#242229','#302e38','#1f1d24','#2c2a33','#26242c','#322f3a','#1d1b22','#2e2b35','#252329'],
      roofs: ['#3a3038','#2f2830','#443a44','#33bbcc','#e0603a','#3a3038','#2f2830','#33aacc','#e07050','#443a44'],
      floors: [1,2],
      tree: 'lavarock',
      names: ['EMBER HOME','ASH HOUSE','CINDER LODGE','OBSIDIAN HOME','EMBER HOUSE','ASH LODGE','CINDER HOME','OBSIDIAN HOUSE','EMBER LODGE','ASH HOME'],
      yardProps: ['lavarock','rock','lamp'],
      parkProp: 'lavarock', lampProp: 'lamp'
    }
  };

  var TH = THEMES[from] || THEMES.meadow;

  // ---- base ground ----
  api.fill(TH.base);

  // ---- street grid (blocks ~8 tiles) ----
  for (var c = 6; c <= 46; c += 8) api.roadLine(c, 4, c, 48, 2, TH.path);
  for (var r = 6; r <= 46; r += 8) api.roadLine(4, r, 48, r, 2, TH.path);

  // helper: is this tile walkable ground we can decorate on?
  function decorable(cc, rr){
    var g = api.get(cc, rr);
    return g === T.GRASS || g === T.SAND || g === T.PATH;
  }
  function themeTree(cc, rr){
    if (!decorable(cc, rr)) return;
    if (TH.tree === 'tree') api.tree(cc, rr);
    else api.prop(TH.tree, cc, rr);
  }

  // ---- 20 houses across the blocks (skip the central park block) ----
  var floMin = TH.floors[0], floSpan = (TH.floors[1] - TH.floors[0]);
  var hi = 0;
  for (var bc = 0; bc < 5 && hi < 20; bc++){
    for (var br = 0; br < 5 && hi < 20; br++){
      if (bc === 2 && br === 2) continue;               // central park block
      var col = 8 + bc*8 + 1, row = 8 + br*8 + 1;
      var forSale = (hi === 3 || hi === 9 || hi === 15); // a few available
      var floors = floMin + (floSpan > 0 ? ((bc+br) % (floSpan+1)) : 0);
      api.building({ col:col, row:row, w:3, d:3, floors: floors,
        kind:'home', wall: TH.walls[hi % TH.walls.length], roof: TH.roofs[hi % TH.roofs.length],
        glass: (from === 'city' || from === 'agentcity' || from === 'volcano') ? '#33bbdd' : undefined,
        accent: (from === 'volcano') ? '#e0603a' : undefined,
        name: forSale ? 'FOR SALE' : TH.names[hi % TH.names.length], suburb: true, houseId: hi });

      // front yard: signature theme props on valid ground around the lot
      var yp = TH.yardProps;
      if (decorable(col-1, row+3)) api.prop(yp[0], col-1, row+3);
      if (decorable(col+3, row+3)) api.prop(yp[0], col+3, row+3);
      if (decorable(col+1, row+3) && yp[1]) api.prop(yp[1], col+1, row+3);
      if (decorable(col-1, row-1)) api.prop(TH.lampProp, col-1, row-1);
      if (decorable(col+2, row-1) && yp[2]) api.prop(yp[2], col+2, row-1);
      hi++;
    }
  }

  // ---- central park (themed trees/props) ----
  var pc = 26, pr = 26;
  for (var t2 = 0; t2 < 10; t2++){
    var a = t2/10*6.283;
    themeTree(Math.round(pc + 5*Math.cos(a)), Math.round(pr + 5*Math.sin(a)));
  }
  if (decorable(pc, pr)) api.prop(TH.parkProp, pc, pr);
  if (decorable(pc-3, pr)) api.prop('bench', pc-3, pr);
  if (decorable(pc+3, pr)) api.prop('bench', pc+3, pr);
  if (decorable(pc, pr+4)) api.prop(TH.yardProps[1] || 'flowers', pc, pr+4);
  if (decorable(pc, pr-4)) api.prop(TH.yardProps[1] || 'flowers', pc, pr-4);
  if (decorable(pc-4, pr-4)) api.prop(TH.lampProp, pc-4, pr-4);
  if (decorable(pc+4, pr+4)) api.prop(TH.lampProp, pc+4, pr+4);

  // ---- gateway back to the world (transit) + residents ----
  api.building({ col:23, row:2, w:3, d:2, landmark:'station', kind:'transit', name:'GATEWAY' });
  api.villagers(16);
  api.spawn(24, 6);
};
