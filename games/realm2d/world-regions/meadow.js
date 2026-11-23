window.RegionGen = window.RegionGen || {};
window.RegionGen['meadow'] = function(api){
  var T = api.T;

  // ============================================================
  // GREEN MEADOW — a farm-village in a green river valley
  // Grid starts ALL GRASS. Order: water/roads -> buildings ->
  // props/details -> NPCs -> spawn.
  // ============================================================

  api.fill(T.GRASS);

  // ---- helper: soft jog line built from short roadLine segments ----
  function lane(pts, w){
    w = w || 1;
    for (var i=0;i<pts.length-1;i++){
      api.roadLine(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], w, T.PATH);
    }
  }

  // ------------------------------------------------------------
  // 1) THE SILVER STREAM (WATER, 2 wide) meandering NW -> SE
  // ------------------------------------------------------------
  var streamPts = [
    [6,3],[10,7],[16,12],[20,17],[24,22],[28,27],[32,32],[37,38],[42,44],[46,47],[49,50]
  ];
  for (var s=0;s<streamPts.length-1;s++){
    api.roadLine(streamPts[s][0], streamPts[s][1], streamPts[s+1][0], streamPts[s+1][1], 2, T.WATER);
  }

  // sand bank hugging the stream (only paint sand where it's still grass)
  function bankAround(){
    var offs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
    for (var c=0;c<52;c++){
      for (var r=0;r<52;r++){
        if (api.get(c,r) !== T.WATER) continue;
        for (var o=0;o<offs.length;o++){
          var nc=c+offs[o][0], nr=r+offs[o][1];
          if (nc<0||nr<0||nc>51||nr>51) continue;
          if (api.get(nc,nr) === T.GRASS){
            api.set(nc,nr, T.SAND);
          }
        }
      }
    }
  }
  bankAround();

  // ------------------------------------------------------------
  // 2) ARCHED STONE FOOTBRIDGE across the stream near center
  //    Lay DOCK strip so it's walkable (col 30-31, rows 27-29)
  // ------------------------------------------------------------
  for (var bc=30;bc<=31;bc++){
    for (var br=26;br<=30;br++){
      api.set(bc,br, T.DOCK);
    }
  }

  // ------------------------------------------------------------
  // 3) ORGANIC CURVED LANES (no long straight runs)
  //    WEST-bank main lane (N->S) and EAST village lane (N->S)
  //    plus connectors to the bridge.
  // ------------------------------------------------------------
  // West-bank snaking lane
  lane([[7,4],[8,9],[6,14],[9,19],[7,25],[10,31],[8,37],[11,43],[9,49]], 1);
  // West spur to farmland + windmill hill
  lane([[8,9],[13,7],[17,6],[14,11],[10,14]], 1);
  lane([[7,25],[13,24],[16,28],[12,31]], 1);

  // East village lane snaking N->S
  lane([[40,6],[38,11],[42,16],[39,21],[43,26],[40,32],[44,37],[41,43],[43,49]], 1);
  // East branches into cottage knot (SE)
  lane([[43,37],[46,40],[44,44],[47,46],[43,48],[40,45]], 1);

  // Bridge connectors: west lane -> bridge -> east village
  lane([[8,27],[16,27],[24,28],[30,28]], 1);   // west approach into bridge
  lane([[31,28],[37,27],[40,27],[43,26]], 1);   // east approach out of bridge

  // Market green ring/plaza lanes (center-east of bridge)
  lane([[31,33],[35,31],[39,33],[36,36],[31,35],[31,33]], 1);
  lane([[35,31],[40,32]], 1); // tie plaza into east lane

  // ------------------------------------------------------------
  // 4) WEST = FARMLAND  (fields, fences, barn, silos)
  // ------------------------------------------------------------
  function tillField(c0,r0,c1,r1){
    // crops
    for (var c=c0;c<=c1;c++){
      for (var r=r0;r<=r1;r++){
        if (api.get(c,r) !== T.GRASS) continue;
        api.prop('farm', c, r, {ready: api.chance(0.6)});
      }
    }
    // fence ring (outside the crop block)
    for (var fc=c0-1; fc<=c1+1; fc++){
      if (api.get(fc,r0-1)===T.GRASS) api.prop('fence', fc, r0-1);
      if (api.get(fc,r1+1)===T.GRASS) api.prop('fence', fc, r1+1);
    }
    for (var fr=r0-1; fr<=r1+1; fr++){
      if (api.get(c0-1,fr)===T.GRASS) api.prop('fence', c0-1, fr);
      if (api.get(c1+1,fr)===T.GRASS) api.prop('fence', c1+1, fr);
    }
    // livestock scattered inside
    var count = api.rint(2,4);
    for (var k=0;k<count;k++){
      var lc = api.rint(c0,c1), lr = api.rint(r0,r1);
      if (api.get(lc,lr)!==T.WATER && api.get(lc,lr)!==T.DOCK){
        api.prop(api.chance(0.5)?'sheep':'chicken', lc, lr);
      }
    }
  }

  tillField(2, 4, 6, 8);     // NW field near windmill
  tillField(2, 15, 6, 20);   // W mid field
  tillField(2, 33, 6, 38);   // SW field
  tillField(11, 40, 16, 45); // lower-mid field

  // BARN (red roof)
  api.building({col:3, row:11, w:3, d:3, floors:1, kind:'home', wall:'#a05038', roof:'#8a3b2a', name:'BARN'});

  // SILOS (tall narrow)
  api.building({col:7, row:11, w:1, d:1, floors:4, kind:'home', wall:'#b8b8b0', roof:'#8a8a82'});
  api.building({col:7, row:13, w:1, d:1, floors:4, kind:'home', wall:'#b8b8b0', roof:'#8a8a82'});
  api.building({col:3, row:36, w:1, d:1, floors:4, kind:'home', wall:'#b8b8b0', roof:'#8a8a82'});

  // WINDMILL on a low hill NW
  api.building({col:11, row:3, w:4, d:4, landmark:'windmill', kind:'home', wall:'#d8cba0', roof:'#7a5a3a', name:'MILL'});

  // ------------------------------------------------------------
  // 5) CENTER = MARKET GREEN (plaza: stalls, benches, well, great oak, chapel)
  // ------------------------------------------------------------
  // Great Oak (the region default tree = oak) + companions
  api.tree(34, 33);
  api.tree(33, 32);
  api.tree(35, 34);
  api.tree(37, 32);
  api.tree(32, 35);

  // WELL
  api.building({col:36, row:34, w:1, d:1, floors:1, kind:'home', wall:'#9a9a92', roof:'#6a6a62', name:'WELL'});

  // CHAPEL (steep, pale wall + green roof)
  api.building({col:37, row:29, w:2, d:3, floors:2, kind:'home', wall:'#e8dcc0', roof:'#5a7a3a', name:'CHAPEL'});

  // Market stalls (varied colors)
  api.prop('stall', 32, 32, {color:'#c0392b'});
  api.prop('stall', 33, 34, {color:'#27ae60'});
  api.prop('stall', 35, 31, {color:'#e67e22'});
  api.prop('stall', 38, 34, {color:'#8e44ad'});
  api.prop('stall', 31, 34, {color:'#2980b9'});
  api.prop('stall', 39, 31, {color:'#f1c40f'});

  // Benches around the green
  api.prop('bench', 34, 30);
  api.prop('bench', 36, 30);
  api.prop('bench', 31, 32);
  api.prop('bench', 38, 36);
  api.prop('bench', 33, 36);

  // Market shops fringing the green
  api.building({col:29, row:30, w:2, d:2, floors:1, kind:'shop', wall:'#c98a4a', roof:'#7a3b28', accent:'#e8c45c', name:'DINER'});
  api.building({col:40, row:29, w:2, d:2, floors:2, kind:'shop', wall:'#b06a3a', roof:'#6a3320', accent:'#f0b040', name:'STORE'});
  api.building({col:41, row:35, w:2, d:2, floors:2, kind:'shop', wall:'#d0a050', roof:'#8a5a2a', accent:'#e8c45c', name:'INN'});
  api.building({col:29, row:36, w:2, d:2, floors:1, kind:'shop', wall:'#c07850', roof:'#7a3b2a', accent:'#f0c060', name:'BAKERY'});
  api.building({col:33, row:38, w:3, d:3, floors:1, kind:'shop', wall:'#5a3a1a', roof:'#3a2210', accent:'#e8c45c', name:'PUB'});

  // ------------------------------------------------------------
  // 6) SE = TIGHT COTTAGE KNOT (cul-de-sac loop of curved lanes)
  // ------------------------------------------------------------
  // small cul-de-sac loop lanes
  lane([[44,44],[47,45],[48,48],[45,49],[42,48],[41,45],[44,44]], 1);

  api.building({col:43, row:42, w:2, d:2, floors:1, kind:'home', wall:'#f0e4c8', roof:'#8a5a3a', name:'HOME'});
  api.building({col:46, row:42, w:2, d:2, floors:2, kind:'home', wall:'#f4c8a0', roof:'#9a4030', name:'TAVERN'});
  api.building({col:48, row:45, w:2, d:2, floors:1, kind:'home', wall:'#f0e4c8', roof:'#8a5a3a'});
  api.building({col:46, row:47, w:2, d:2, floors:2, kind:'home', wall:'#f4c8a0', roof:'#8a5a3a'});
  api.building({col:43, row:47, w:2, d:2, floors:1, kind:'home', wall:'#f0e4c8', roof:'#9a4030'});
  api.building({col:40, row:44, w:2, d:2, floors:1, kind:'home', wall:'#f4c8a0', roof:'#8a5a3a'});
  api.building({col:40, row:47, w:2, d:2, floors:2, kind:'home', wall:'#f0e4c8', roof:'#9a4030', name:'HOME'});
  api.building({col:37, row:45, w:2, d:2, floors:1, kind:'home', wall:'#f4c8a0', roof:'#8a5a3a'});

  // A couple more homes up the east lane
  api.building({col:44, row:19, w:2, d:2, floors:1, kind:'home', wall:'#f0e4c8', roof:'#8a5a3a', name:'HOME'});
  api.building({col:40, row:14, w:2, d:2, floors:2, kind:'home', wall:'#f4c8a0', roof:'#9a4030'});
  api.building({col:45, row:23, w:2, d:2, floors:1, kind:'home', wall:'#f0e4c8', roof:'#8a5a3a'});

  // ------------------------------------------------------------
  // 7) RAIL STATION at E orchard edge
  // ------------------------------------------------------------
  api.building({col:46, row:10, w:3, d:3, landmark:'station', kind:'transit', name:'STATION'});
  // little lane linking station to east village lane
  lane([[46,13],[43,15],[42,16]], 1);

  // ------------------------------------------------------------
  // 8) PROPS / DETAILS — oak clumps, rocks, lamps
  // ------------------------------------------------------------
  function clumpTrees(cx,cy,n,spread){
    for (var i=0;i<n;i++){
      var tc = cx + api.rint(-spread,spread);
      var tr = cy + api.rint(-spread,spread);
      if (tc<0||tr<0||tc>51||tr>51) continue;
      if (api.get(tc,tr)===T.GRASS) api.tree(tc,tr);
    }
  }
  clumpTrees(4, 46, 6, 3);    // SW outskirts
  clumpTrees(48, 5, 7, 3);    // E orchard by station
  clumpTrees(46, 17, 5, 3);   // E orchard mid
  clumpTrees(3, 26, 5, 2);    // W edge
  clumpTrees(20, 45, 6, 3);   // S outskirts
  clumpTrees(18, 3, 5, 2);    // N edge near mill
  clumpTrees(50, 30, 5, 2);   // far E

  // scattered rocks
  var rockSpots = [[2,10],[5,29],[19,40],[48,38],[3,44],[50,20],[22,7],[45,30]];
  for (var rk=0; rk<rockSpots.length; rk++){
    var rc=rockSpots[rk][0], rr=rockSpots[rk][1];
    if (api.get(rc,rr)===T.GRASS) api.prop('rock', rc, rr);
  }

  // lamps at bridge ends
  api.prop('lamp', 30, 25);
  api.prop('lamp', 31, 25);
  api.prop('lamp', 30, 31);
  api.prop('lamp', 31, 31);

  // lamps along main lanes
  var lampSpots = [[7,10],[8,20],[9,32],[10,43],[39,12],[42,20],[41,33],[43,42],[34,29],[38,32]];
  for (var lp=0; lp<lampSpots.length; lp++){
    var lc=lampSpots[lp][0], lr=lampSpots[lp][1];
    if (api.get(lc,lr)!==T.WATER && api.get(lc,lr)!==T.LAVA) api.prop('lamp', lc, lr);
  }

  // a few crates by the store/inn
  api.prop('crate', 42, 33);
  api.prop('crate', 42, 34);
  api.prop('crate', 28, 30);

  // ============================================================
  // 8b) MORE FARM LIFE — extra tilled fields, scarecrows, grazing
  // ============================================================
  // helper: place a prop only on open grass (never water/dock/etc.)
  function onGrass(c,r){ return c>=0&&r>=0&&c<=51&&r<=51 && api.get(c,r)===T.GRASS; }
  function put(type,c,r,extra){ if(onGrass(c,r)) api.prop(type,c,r,extra); }

  // A dense tilled field just S of the barn (fenced grid)
  tillField(2, 24, 6, 28);
  // A field E of the SW field, tucked between lanes
  tillField(13, 33, 17, 37);
  // A small kitchen-garden patch behind the market shops
  tillField(27, 40, 30, 43);

  // Scarecrows (a lone crate standing watch in the crops)
  var scarecrows = [[4,6],[4,17],[4,26],[13,42],[15,35],[28,41]];
  for (var sk=0; sk<scarecrows.length; sk++){
    put('crate', scarecrows[sk][0], scarecrows[sk][1]);
  }

  // Extra grazing flocks on open pasture (not inside field fences)
  var grazeSheep = [[9,11],[10,16],[12,20],[8,29],[14,39],[6,42],[19,44],[16,20]];
  for (var gs=0; gs<grazeSheep.length; gs++){
    put('sheep', grazeSheep[gs][0], grazeSheep[gs][1]);
  }
  var grazeChick = [[3,9],[5,23],[7,34],[11,38],[15,43],[6,20],[9,7],[12,17]];
  for (var gc=0; gc<grazeChick.length; gc++){
    put('chicken', grazeChick[gc][0], grazeChick[gc][1]);
  }

  // ============================================================
  // 8c) THE ORCHARD — neat oak rows with walking lanes between
  //     (NE upland, E of the mill / N of the station spur)
  // ============================================================
  // rows at cols 20,22,24,26 (col 21,23,25 left open as lanes)
  var orchCols = [20,22,24,26];
  for (var oc=0; oc<orchCols.length; oc++){
    for (var orow=6; orow<=14; orow+=2){
      if (onGrass(orchCols[oc], orow)) api.tree(orchCols[oc], orow);
    }
  }
  // a bench + lamp at the orchard entrance
  put('bench', 21, 15);
  put('lamp', 25, 15);
  put('crate', 23, 5);  // harvest crate at the top lane

  // ============================================================
  // 8d) THE DUCK POND — small pool with ducks, benches, lamps
  //     (SW green, clear of fields & lanes)
  // ============================================================
  api.disc(21, 27, 2, T.WATER);
  bankAround(); // re-run bank so the new pond gets a sandy rim
  // ducks (chickens) dabbling at the water's edge
  put('chicken', 19, 27);
  put('chicken', 23, 27);
  put('chicken', 21, 24);
  put('chicken', 21, 30);
  // benches + lamps ringing the pond
  put('bench', 18, 27);
  put('bench', 24, 28);
  put('lamp', 20, 24);
  put('lamp', 22, 30);
  // a small willow-ish oak clump beside it
  clumpTrees(24, 24, 3, 1);

  // ============================================================
  // 8e) MARKET GREEN ENRICHMENT — more stalls, benches, crates, lamps
  // ============================================================
  api.prop('stall', 34, 35, {color:'#16a085'});
  api.prop('stall', 37, 35, {color:'#d35400'});
  api.prop('stall', 30, 32, {color:'#c0392b'});
  api.prop('stall', 40, 34, {color:'#7f8c8d'});
  put('bench', 35, 37);
  put('bench', 30, 35);
  put('bench', 39, 33);
  put('crate', 33, 31);
  put('crate', 39, 35);
  put('lamp', 32, 37);
  put('lamp', 37, 37);
  // flower dabs (light use of the little tree prop as shrubs) around the green
  put('tree', 31, 36);
  put('tree', 40, 36);

  // ============================================================
  // 8f) GARDEN FENCES & LANE LAMPS around cottages / winding lanes
  // ============================================================
  // low garden fences fronting the SE cottage knot
  var gardenFence = [[42,41],[45,41],[47,44],[49,47],[39,43],[36,44],[45,46],[42,46]];
  for (var gf=0; gf<gardenFence.length; gf++){
    put('fence', gardenFence[gf][0], gardenFence[gf][1]);
  }
  // fences by the up-lane homes
  put('fence', 43, 18); put('fence', 46, 22); put('fence', 39, 13);
  // extra lane lamps threading the winding routes
  var moreLamps = [[8,15],[10,27],[9,38],[42,25],[43,30],[45,44],[38,45],[41,48],[15,7],[27,28]];
  for (var ml=0; ml<moreLamps.length; ml++){
    var mc=moreLamps[ml][0], mr=moreLamps[ml][1];
    if (mc>=0&&mr>=0&&mc<=51&&mr<=51 && api.get(mc,mr)!==T.WATER && api.get(mc,mr)!==T.LAVA && api.get(mc,mr)!==T.DOCK){
      api.prop('lamp', mc, mr);
    }
  }

  // ============================================================
  // 8g) OUTSKIRT OAK CLUMPS + SCATTERED ROCKS (fill the edges)
  // ============================================================
  clumpTrees(2, 50, 4, 2);
  clumpTrees(50, 48, 5, 2);
  clumpTrees(50, 12, 4, 2);
  clumpTrees(28, 4, 5, 2);
  clumpTrees(15, 49, 4, 2);
  var moreRocks = [[3,20],[8,45],[24,42],[49,42],[50,7],[17,44],[44,8],[6,4]];
  for (var mrk=0; mrk<moreRocks.length; mrk++){
    put('rock', moreRocks[mrk][0], moreRocks[mrk][1]);
  }

  // ============================================================
  // 8h) A HANDFUL MORE COTTAGES / SHOPS to fill lane gaps
  //     (earth tones, low-rise 1-2 floors — kept few for perf)
  // ============================================================
  api.building({col:12, row:36, w:2, d:2, floors:1, kind:'home', wall:'#e8dcc0', roof:'#8a5a3a', name:'FARMHOUSE'});
  api.building({col:33, row:24, w:2, d:2, floors:1, kind:'shop', wall:'#c98a4a', roof:'#7a3b28', accent:'#e8c45c', name:'MILL SHOP'});
  api.building({col:35, row:40, w:2, d:2, floors:2, kind:'home', wall:'#f0e4c8', roof:'#9a4030', name:'HOME'});
  api.building({col:44, row:31, w:2, d:2, floors:1, kind:'shop', wall:'#d0a050', roof:'#8a5a2a', accent:'#f0b040', name:'GROCER'});
  api.building({col:6, row:31, w:2, d:2, floors:1, kind:'home', wall:'#f4c8a0', roof:'#8a5a3a', name:'COTTAGE'});

  // ------------------------------------------------------------
  // 9) NPCs — villagers + a few loose farmers
  // ------------------------------------------------------------
  api.villagers(18);
  // extra farmers near fields
  api.npc(4, 9);
  api.npc(5, 18);
  api.npc(4, 35);
  api.npc(13, 43);
  api.npc(35, 33);

  // ------------------------------------------------------------
  // 9z) FARM MACHINERY & DETAIL — tractors, hay bales, flowers, a well
  // ------------------------------------------------------------
  function freeGrass(c,r){ return api.get(c,r)===T.GRASS; }
  function putProp(type,c,r,extra){ if(api.inb(c,r)&&freeGrass(c,r)) api.prop(type,c,r,extra); }
  // tractors parked at field edges (west farmland)
  [[8,20],[13,26],[6,32],[16,36]].forEach(function(p){ putProp('tractor',p[0],p[1]); });
  // hay bales dotted through the fields
  [[7,18],[10,22],[5,28],[14,30],[9,34],[12,16],[17,32],[4,24]].forEach(function(p){ putProp('haybale',p[0],p[1]); });
  // flower patches around the village + lanes
  for(var fi=0;fi<14;fi++){ var fc=api.rint(20,44), fr=api.rint(24,44); putProp('flowers',fc,fr); }
  // a stone well on the market green
  putProp('well',32,30); putProp('well',10,44);
  // ------------------------------------------------------------
  // 10) SPAWN — on the footbridge over the Silver Stream (fishing dock)
  //     New players start right on the pier: fishBar lights up immediately,
  //     market green / farm fields / jobs are a step away.
  // ------------------------------------------------------------
  api.spawn(30, 30);
};
