window.RegionGen = window.RegionGen || {};
window.RegionGen['desert'] = function(api){
  var T = api.T;

  // ---- BASE: whole ground warm sand ----
  api.fill(T.SAND);
  // subtle low-frequency variation: a few faint patches (still sand tiles, purely cosmetic-safe)
  for (var i=0;i<30;i++){
    var pc = api.rint(2,49), pr = api.rint(2,49);
    api.disc(pc, pr, api.rint(1,2), T.SAND);
  }

  var CX = 26, CY = 26;

  // ---- OASIS POOL (south of mesa foot) ----
  api.disc(26, 32, 3, T.WATER);

  // ---- RING ROAD around the center ----
  api.ring(26, 28, 10, 2, T.PATH);

  // ---- SPOKE ROADS from ring center outward to edges ----
  var spokes = [[26,6],[42,16],[46,36],[26,50],[10,40],[8,16]];
  for (var s=0;s<spokes.length;s++){
    api.roadLine(26, 28, spokes[s][0], spokes[s][1], 2, T.PATH);
  }

  // ---- CENTRAL MESA (stepped pyramid landmark) ----
  // Shrunk to 4×4 (was 6×6) so players can walk around it without getting pinched.
  api.building({col:24,row:24,w:4,d:4,floors:5,landmark:'pyramid',wall:'#b9a07a',roof:'#a88a5c',name:"DA'AT MESA"});
  // Clear 2-tile walkable ring around the mesa so players never get trapped.
  for(var mc=21;mc<=30;mc++){ api.set(mc,22,T.PATH); api.set(mc,29,T.PATH); }
  for(var mr=22;mr<=29;mr++){ api.set(21,mr,T.PATH); api.set(30,mr,T.PATH); }

  // ---- MESA-TOP AIR PAD (moved slightly to stay above smaller mesa) ----
  api.building({col:25,row:21,w:2,d:2,floors:1,landmark:'airport',kind:'transit',wall:'#c9b389',roof:'#7fb3c8',name:'AIR PAD'});

  // ---- WELL by the oasis ----
  api.building({col:24,row:34,w:1,d:1,floors:1,kind:'home',wall:'#cbb489',roof:'#6f4a26',name:'WELL'});

  // ---- ADOBE PUEBLO buildings fanning out along ring + spokes ----
  var adobeNames = ['ADOBE','PUEBLO','HOME','MARKET','FORGE','INN','TRADING POST','ADOBE','PUEBLO','HOME'];
  var wallOchre = ['#c98a4b','#dcae6e'];
  var pueblo = [
    {col:15,row:14,w:3,d:3,floors:3,name:'PUEBLO'},
    {col:34,row:13,w:3,d:2,floors:2,name:'ADOBE'},
    {col:38,row:22,w:2,d:3,floors:3,name:'MARKET'},
    {col:39,row:33,w:3,d:2,floors:2,name:'INN'},
    {col:33,row:40,w:3,d:3,floors:3,name:'PUEBLO'},
    {col:16,row:39,w:3,d:2,floors:2,name:'HOME'},
    {col:11,row:31,w:2,d:3,floors:3,name:'TRADING POST'},
    {col:12,row:20,w:3,d:2,floors:2,name:'ADOBE'},
    {col:20,row:11,w:2,d:2,floors:1,name:'HOME'},
    {col:31,row:10,w:2,d:2,floors:2,name:'ADOBE'},
    {col:41,row:28,w:2,d:2,floors:1,name:'HOME'},
    {col:20,row:41,w:2,d:2,floors:2,name:'ADOBE'},
    {col:8,row:26,w:2,d:2,floors:3,name:'PUEBLO'},
    {col:27,row:41,w:2,d:2,floors:2,name:'HOME'}
  ];
  for (var b=0;b<pueblo.length;b++){
    var p = pueblo[b];
    api.building({
      col:p.col,row:p.row,w:p.w,d:p.d,floors:p.floors,
      kind:'home',
      wall: wallOchre[b%2],
      roof:'#8a5a2c',
      name:p.name
    });
  }

  // ---- PUB near the oasis/ring road ----
  api.building({col:28,row:38,w:3,d:3,floors:1,kind:'shop',wall:'#5a3a1a',roof:'#3a2210',accent:'#e8c45c',name:'PUB'});

  // ---- GRAND FORGE landmark ----
  api.building({col:29,row:17,w:3,d:2,floors:2,landmark:'forge',kind:'shop',wall:'#b07038',roof:'#5a3a1c',accent:'#ff8a3c',name:'GRAND FORGE'});

  // ---- WATCHTOWERS on the frontier ----
  api.building({col:6,row:8,w:2,d:2,floors:3,landmark:'tower',wall:'#c9b389',roof:'#7a5230',name:'WATCHTOWER'});
  api.building({col:44,row:44,w:2,d:2,floors:3,landmark:'tower',wall:'#c9b389',roof:'#7a5230',name:'WATCHTOWER'});

  // ---- PALMS ringing the oasis (trees stand in for palms) ----
  var palmRing = [[23,31],[22,33],[24,29],[26,29],[29,31],[30,33],[28,35],[24,35],[22,30],[30,29]];
  for (var pr2=0;pr2<palmRing.length;pr2++){
    api.prop('tree', palmRing[pr2][0], palmRing[pr2][1]);
  }
  // bench near the pool
  api.prop('bench', 25, 35);
  api.prop('bench', 28, 34);

  // ---- OASIS DETAIL: extra palms + lamps + crates + lily-pad feel ----
  // second, looser ring of palms further out from the pool
  var palmRing2 = [[21,31],[20,32],[23,28],[27,28],[31,32],[31,30],[29,36],[22,37],[26,27],[19,34]];
  for (var pr3=0;pr3<palmRing2.length;pr3++){
    var pc2 = palmRing2[pr3][0], prr2 = palmRing2[pr3][1];
    if (api.get(pc2,prr2) !== T.WATER) api.prop('tree', pc2, prr2);
  }
  // soft glow lamps at the water's edge (kept off the water tiles)
  var oasisLamps = [[22,32],[30,32],[26,28],[24,36]];
  for (var ol=0;ol<oasisLamps.length;ol++){
    if (api.get(oasisLamps[ol][0],oasisLamps[ol][1]) !== T.WATER)
      api.prop('lamp', oasisLamps[ol][0], oasisLamps[ol][1]);
  }
  // supply crates + one more bench at the water's edge (a place to rest)
  api.prop('crate', 23, 34);
  api.prop('crate', 29, 33);
  api.prop('bench', 26, 30);
  // tiny "lily-pad" green accents right on the pool edge (rocks read as pads/stones)
  var pads = [[25,31],[27,32],[26,33]];
  for (var pd=0;pd<pads.length;pd++){
    if (api.get(pads[pd][0],pads[pd][1]) !== T.WATER) api.prop('rock', pads[pd][0], pads[pd][1]);
  }

  // ---- BAZAAR: striped stalls + crates near the oasis/ring ----
  var stallColors = ['#d94f4f','#4f7fd9','#d9b04f','#4fd98a','#b04fd9','#d9784f'];
  var stalls = [[20,30],[21,28],[31,28],[32,30],[22,36],[30,36]];
  for (var st=0;st<stalls.length;st++){
    api.prop('stall', stalls[st][0], stalls[st][1], {color: stallColors[st%stallColors.length]});
  }
  var bcrates = [[19,29],[33,29],[20,37],[31,37],[23,37]];
  for (var cc=0;cc<bcrates.length;cc++){
    api.prop('crate', bcrates[cc][0], bcrates[cc][1]);
  }

  // ---- BAZAAR EXPANSION: livelier market along the ring road ----
  // extra striped stalls in varied colors, hugging the ring
  var stalls2 = [[24,18],[28,18],[36,24],[36,32],[28,38],[24,38],[16,32],[16,24]];
  for (var st2=0;st2<stalls2.length;st2++){
    var sc = stalls2[st2][0], sr = stalls2[st2][1];
    if (api.get(sc,sr) !== T.WATER)
      api.prop('stall', sc, sr, {color: stallColors[(st2+2)%stallColors.length]});
  }
  // crates clustered by the new stalls (goods piled up for market day)
  var mcrates = [[24,17],[28,39],[37,24],[15,32],[16,23],[35,32]];
  for (var mc=0;mc<mcrates.length;mc++){
    if (api.get(mcrates[mc][0],mcrates[mc][1]) !== T.WATER)
      api.prop('crate', mcrates[mc][0], mcrates[mc][1]);
  }
  // extra lamps spaced around the ring for evening trade
  var ringLamps = [[22,19],[30,19],[37,26],[37,30],[22,37],[30,37],[15,26],[15,30]];
  for (var rl=0;rl<ringLamps.length;rl++){
    if (api.get(ringLamps[rl][0],ringLamps[rl][1]) !== T.WATER)
      api.prop('lamp', ringLamps[rl][0], ringLamps[rl][1]);
  }

  // ---- LAMPS along the ring road ----
  var lamps = [[16,28],[26,18],[36,28],[26,38],[19,20],[33,20],[33,36],[19,36]];
  for (var lp=0;lp<lamps.length;lp++){
    api.prop('lamp', lamps[lp][0], lamps[lp][1]);
  }

  // ---- A FEW MORE ADOBE HOMES filling gaps (only a handful) ----
  var extraAdobe = [
    {col:36,row:38,w:2,d:2,floors:1,name:'HOME'},
    {col:14,row:35,w:2,d:2,floors:2,name:'ADOBE'},
    {col:37,row:17,w:2,d:2,floors:1,name:'HOME'},
    {col:10,row:22,w:2,d:2,floors:2,name:'PUEBLO'}
  ];
  for (var ea=0;ea<extraAdobe.length;ea++){
    var xa = extraAdobe[ea];
    api.building({
      col:xa.col,row:xa.row,w:xa.w,d:xa.d,floors:xa.floors,
      kind:'home',
      wall: wallOchre[ea%2],
      roof:'#8a5a2c',
      name:xa.name
    });
  }

  // ---- GARDEN FENCES around a couple of adobe yards ----
  // fence line beside the HOME at (36,38)
  var fences = [[34,38],[34,39],[34,40],[35,41],[36,41],
                [12,35],[12,36],[12,37],[13,38],[14,38],
                [39,17],[39,18],[39,19]];
  for (var fn=0;fn<fences.length;fn++){
    var fc = fences[fn][0], fr = fences[fn][1];
    if (api.get(fc,fr) === T.SAND) api.prop('fence', fc, fr);
  }
  // a lamp + bench inside each little yard
  api.prop('lamp', 35, 40); api.prop('bench', 35, 39);
  api.prop('lamp', 13, 37);

  // ---- RESTING CARAVAN: crates + benches strung along the NE spoke ----
  // spoke runs from center (26,28) toward (42,16); park the caravan mid-way
  var caravan = [[34,22],[35,21],[36,20],[37,19],[38,18]];
  for (var cv=0;cv<caravan.length;cv++){
    var cvc = caravan[cv][0], cvr = caravan[cv][1];
    if (api.get(cvc,cvr) !== T.WATER) api.prop('crate', cvc, cvr);
  }
  api.prop('bench', 35, 22);
  api.prop('bench', 37, 20);
  api.prop('lamp', 36, 21);
  api.npc(35, 21); // a caravaneer keeping watch

  // ---- ROCK FORMATIONS: boulder clusters at the canyon walls / frontier ----
  var rockClusters = [[6,45],[45,6],[7,7],[46,46],[6,26],[46,26]];
  for (var rcl=0;rcl<rockClusters.length;rcl++){
    var base = rockClusters[rcl];
    var cluster = [[0,0],[1,0],[0,1],[1,1],[2,0],[-1,1]];
    for (var q=0;q<cluster.length;q++){
      var qc = base[0]+cluster[q][0], qr = base[1]+cluster[q][1];
      if (qc>=0 && qc<52 && qr>=0 && qr<52 && api.get(qc,qr)===T.SAND && api.chance(0.7)){
        api.prop('rock', qc, qr);
      }
    }
  }

  // ---- CACTUS FRONTIER: outer ring (dist from center > 16), rising density ----
  for (var r=0;r<52;r++){
    for (var c=0;c<52;c++){
      var dx = c - CX, dy = r - CY;
      var dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > 16){
        // density rises with distance
        var pchance = Math.min(0.14, (dist - 16) * 0.02);
        if (api.get(c,r) === T.SAND && api.chance(pchance)){
          var roll = api.rand();
          if (roll < 0.6) api.prop('cactus', c, r);
          else if (roll < 0.9) api.prop('rock', c, r);
          else api.prop('crate', c, r); // sun-bleached detail
        }
      }
    }
  }

  // a few extra rocks scattered mid-frontier for texture
  for (var rk=0;rk<10;rk++){
    var rc = api.rint(2,49), rr = api.rint(2,49);
    var ddx = rc-CX, ddy = rr-CY;
    if (Math.sqrt(ddx*ddx+ddy*ddy) > 14 && api.get(rc,rr)===T.SAND){
      api.prop('rock', rc, rr);
    }
  }

  // ---- NPCs ----
  api.villagers(16);
  api.npc(25, 33);
  api.npc(28, 33);
  api.npc(27, 36);

  // ---- wells + hay-free desert detail near the oasis ----
  [[22,34],[30,34],[26,38]].forEach(function(p){ if(api.get(p[0],p[1])===T.SAND) api.prop('well',p[0],p[1]); });
  // ---- SPAWN near the oasis / great well (on sand, not water/building) ----
  api.spawn(26, 36);
};
