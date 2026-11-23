window.RegionGen = window.RegionGen || {};
window.RegionGen['forest'] = function(api){
  var T = api.T;

  // ---- 0) Grid starts ALL GRASS ----
  api.fill(T.GRASS);

  // ---- helper: clamp to grid ----
  function inb(c,r){ return c>=0 && c<=51 && r>=0 && r<=51; }

  // ---- 1) THE TRAIL (build FIRST) ----
  // winding knots from SW trailhead to NE castle, direction changes each leg
  var knots = [
    [6,46],[12,40],[9,33],[17,30],[24,34],[28,26],[36,22],[40,14],[44,8]
  ];
  for(var i=0;i<knots.length-1;i++){
    var a = knots[i], b = knots[i+1];
    // occasionally width 2 near clearings
    var w = (i===0 || i===4) ? 2 : 1;
    api.roadLine(a[0],a[1],b[0],b[1],w,T.PATH);
  }

  // ---- 2) CLEARINGS at ~6 knots (leave GRASS, mark no-trees) ----
  // clearing centers with radius; track membership so trees skip them
  var clearings = [
    {c:10,r:42,rad:5},  // trailhead camp (SW)
    {c:17,r:30,rad:3},  // rope bridge west end
    {c:24,r:34,rad:6},  // giant ancient tree hub
    {c:28,r:26,rad:4},  // watchtower ridge
    {c:36,r:22,rad:3},  // mid rest
    {c:43,r:10,rad:7}   // castle grounds (NE)
  ];
  function inClearing(c,r){
    for(var k=0;k<clearings.length;k++){
      var cl = clearings[k];
      var dc=c-cl.c, dr=r-cl.r;
      if(dc*dc+dr*dr <= cl.rad*cl.rad) return true;
    }
    return false;
  }

  // distance-to-trail check (within ~2 tiles) using segment sampling
  var trailTiles = {};
  function markTrail(c0,r0,c1,r1){
    var steps = Math.max(Math.abs(c1-c0), Math.abs(r1-r0)) || 1;
    for(var s=0;s<=steps;s++){
      var c = Math.round(c0 + (c1-c0)*s/steps);
      var r = Math.round(r0 + (r1-r0)*s/steps);
      for(var dc=-2;dc<=2;dc++) for(var dr=-2;dr<=2;dr++){
        var cc=c+dc, rr=r+dr;
        if(inb(cc,rr)) trailTiles[cc+','+rr]=true;
      }
    }
  }
  for(var j=0;j<knots.length-1;j++){
    markTrail(knots[j][0],knots[j][1],knots[j+1][0],knots[j+1][1]);
  }
  function nearTrail(c,r){ return !!trailTiles[c+','+r]; }

  // ---- 3) BUILDINGS in clearings (only in trail clearings) ----

  // TRAILHEAD CAMP (SW ~10,42): log cabins + trapper shop + crates + campfire
  api.building({col:8,row:44,w:3,d:3,floors:1,kind:'home',wall:'#6b4a2c',roof:'#4a3018',name:'LOG CABIN'});
  api.building({col:12,row:44,w:3,d:3,floors:1,kind:'home',wall:'#6b4a2c',roof:'#4a3018',name:'LOG CABIN'});
  api.building({col:10,row:40,w:3,d:3,floors:1,kind:'shop',wall:'#6b4a2c',roof:'#4a3018',name:'TRAPPER'});
  api.prop('crate',7,42); api.prop('crate',13,41); api.prop('crate',9,45);
  api.prop('lamp',10,42); // campfire

  // GIANT ANCIENT TREE hub (mid clearing ~24,34): treehouses + ranger lodge
  api.building({col:22,row:32,w:2,d:2,floors:2,landmark:'treehouse',name:'TREEHOUSE'});
  api.building({col:26,row:33,w:2,d:2,floors:2,landmark:'treehouse',name:'TREEHOUSE'});
  api.building({col:24,row:36,w:2,d:2,floors:2,landmark:'treehouse',name:'TREEHOUSE'});
  api.building({col:20,row:36,w:3,d:3,floors:1,kind:'home',wall:'#6b4a2c',roof:'#4a3018',name:'RANGER LODGE'});
  // giant ancient tree as a big cluster of pines at the hub center
  api.prop('rock',24,34);
  for(var gt=0;gt<6;gt++){
    var ga = api.rand()*Math.PI*2, gr = 1+api.rand()*1.5;
    var gc = Math.round(24+Math.cos(ga)*gr), grr = Math.round(34+Math.sin(ga)*gr);
    if(inb(gc,grr)) api.prop('pine',gc,grr);
  }

  // WATCHTOWER on ridge clearing (~28,26)
  api.building({col:27,row:24,w:2,d:2,floors:3,landmark:'tower',name:'WATCHTOWER'});
  api.prop('rock',30,27);

  // ---- 4) ROPE-BRIDGE over a gorge (~17,29)-(19,31) ----
  // cut a 3-wide WATER gorge across the trail, then DOCK bridge over it
  api.rect(16,29,3,3,T.WATER); // (col,row,w,d) gorge block
  // lay DOCK tiles across where the trail crosses (the bridge planks)
  for(var gr2=29;gr2<=31;gr2++){ api.set(17,gr2,T.DOCK); api.set(18,gr2,T.DOCK); }
  api.prop('lamp',16,29); api.prop('lamp',19,31);

  // ---- 5) THE CASTLE (NE ~40-46, 6-12) — grand grey stone keep ----
  // central keep
  api.building({col:42,row:8,w:4,d:4,floors:6,landmark:'castle',wall:'#7d8380',roof:'#3a4a55',name:'KETHER KEEP'});
  // 4 corner towers around the keep
  api.building({col:40,row:6,w:2,d:2,floors:5,landmark:'tower',wall:'#7d8380',roof:'#3a4a55',name:'TOWER'});
  api.building({col:47,row:6,w:2,d:2,floors:5,landmark:'tower',wall:'#7d8380',roof:'#3a4a55',name:'TOWER'});
  api.building({col:40,row:13,w:2,d:2,floors:5,landmark:'tower',wall:'#7d8380',roof:'#3a4a55',name:'TOWER'});
  api.building({col:47,row:13,w:2,d:2,floors:5,landmark:'tower',wall:'#7d8380',roof:'#3a4a55',name:'TOWER'});
  // short WATER moat across the castle front (trail/south side), leave a gap for drawbridge
  for(var mc=40;mc<=48;mc++){ if(inb(mc,15)) api.set(mc,15,T.WATER); }
  // DOCK drawbridge on the trail side (aligns with trail approach ~44)
  api.set(44,15,T.DOCK); api.set(44,16,T.DOCK); api.set(43,15,T.DOCK);

  // ---- 6) DENSE PINES EVERYWHERE ELSE ----
  for(var r=0;r<=51;r++){
    for(var c=0;c<=51;c++){
      if(api.get(c,r)!==T.GRASS) continue;      // only plant on grass
      if(nearTrail(c,r)) continue;              // keep trail corridor clear
      if(inClearing(c,r)) continue;             // clearings stay open
      // deeper woods toward NE: raise density as (c up, r down)
      var depth = ((c/51) + (1 - r/51)) / 2;    // 0..1, higher in NE
      var p = 0.55 + depth*0.30;                // 0.55 .. 0.85
      if(api.chance(p)) api.tree(c,r);          // default tree = pine
    }
  }

  // ---- 7) LANTERNS along the trail every ~4 tiles (glow at night) ----
  for(var t=0;t<knots.length-1;t++){
    var A=knots[t], B=knots[t+1];
    var steps=Math.max(Math.abs(B[0]-A[0]),Math.abs(B[1]-A[1]))||1;
    for(var s=0;s<=steps;s++){
      if(s%4!==0) continue;
      var lc=Math.round(A[0]+(B[0]-A[0])*s/steps);
      var lr=Math.round(A[1]+(B[1]-A[1])*s/steps);
      // offset lantern beside the path so it doesn't block walking
      var oc=lc+1, orr=lr;
      if(inb(oc,orr) && api.get(oc,orr)===T.GRASS && !inClearing(oc,orr)){
        api.prop('lamp',oc,orr);
      }
    }
  }

  // a few scattered rock props near the trail
  api.prop('rock',13,38); api.prop('rock',9,30);
  api.prop('rock',33,20); api.prop('rock',38,16);

  // ================= WILDWOOD DETAIL PASS =================
  // safe placement helper: only drop props on open GRASS/PATH tiles inside the
  // grid, never on water/dock or the tree canopy. Keeps additions from breaking
  // walkability or landing on the stream.
  function openTile(c,r){
    if(!inb(c,r)) return false;
    var t = api.get(c,r);
    return t===T.GRASS || t===T.PATH;
  }
  function put(type,c,r){ if(openTile(c,r)) api.prop(type,c,r); }
  function scatter(type,cc,rr,rad,n){
    for(var i=0;i<n;i++){
      var a=api.rand()*Math.PI*2, d=api.rand()*rad;
      put(type, Math.round(cc+Math.cos(a)*d), Math.round(rr+Math.sin(a)*d));
    }
  }

  // ---- A) FOREST STREAM through the SE corner (away from the main trail) ----
  // a thin winding creek carved with small discs; banks lined with rock.
  var creek = [[50,50],[47,47],[45,44],[46,40],[43,37],[41,34]];
  for(var ci=0;ci<creek.length;ci++){
    var pt=creek[ci];
    api.disc(pt[0],pt[1],1,T.WATER);
    // rocks on the banks (openTile skips the water we just laid)
    put('rock',pt[0]+2,pt[1]); put('rock',pt[0]-2,pt[1]);
    put('rock',pt[0],pt[1]+2);
  }
  // the creek lives clear of the trail, but if it ever kisses the path near the
  // ranger hub, plank a DOCK bridge so travelers can still cross dry-footed.
  if(api.get(41,34)===T.WATER){ api.set(41,35,T.DOCK); api.set(41,33,T.DOCK); }

  // ---- B) TRAILHEAD CAMPSITE detail (SW ~10,42) ----
  put('bench',9,41); put('bench',11,43);   // log seats round the campfire
  put('fence',7,40); put('fence',8,40); put('fence',13,44); // camp perimeter
  put('crate',12,42); put('crate',8,43);   // more supplies
  put('chicken',7,41); put('chicken',13,40); // forest birds pecking about
  scatter('rock',10,45,3,4);                 // mushroom/rock cluster

  // ---- C) SECOND CAMPSITE at the mid rest clearing (~36,22) ----
  put('lamp',36,22);                         // campfire
  put('bench',35,21); put('bench',37,23);    // log seats
  put('crate',34,22); put('crate',38,21);    // supplies
  put('fence',35,24); put('fence',36,24);    // low windbreak
  put('chicken',34,20); put('chicken',38,23);
  scatter('rock',36,20,3,3);

  // ---- D) ANCIENT TREE HUB life (~24,34) ----
  put('bench',22,35); put('bench',27,34);    // rest benches under the canopy
  put('chicken',23,33); put('chicken',26,36); put('chicken',21,34);
  scatter('rock',24,37,3,4);                  // mossy stones + mushrooms
  put('crate',20,34); put('crate',28,35);

  // ---- E) WATCHTOWER RIDGE (~28,26) ----
  put('crate',29,25); put('fence',26,27); put('fence',27,27);
  put('chicken',30,26); scatter('rock',28,28,2,3);

  // ---- F) ROPE-BRIDGE ends dressed with rocks (gorge ~17,29) ----
  put('rock',15,29); put('rock',20,31); put('rock',16,32); put('rock',19,29);
  put('bench',15,28); // a rest spot before the crossing

  // ---- G) LANTERNS + REST SPOTS spaced along the WHOLE trail ----
  // walk each leg and drop a lamp on the LEFT verge (the earlier pass used the
  // right verge), so both sides glow and gaps get filled. Two benches too.
  for(var tl=0;tl<knots.length-1;tl++){
    var P=knots[tl], Q=knots[tl+1];
    var st=Math.max(Math.abs(Q[0]-P[0]),Math.abs(Q[1]-P[1]))||1;
    for(var ss=0;ss<=st;ss++){
      if(ss%5!==0) continue;
      var xc=Math.round(P[0]+(Q[0]-P[0])*ss/st);
      var xr=Math.round(P[1]+(Q[1]-P[1])*ss/st);
      put('lamp',xc-1,xr);       // left-verge lantern
    }
  }
  put('bench',13,39); put('bench',31,24); // two trailside rest logs

  // ---- H) MUSHROOM/ROCK clusters scattered along trail edges ----
  scatter('rock',12,40,2,3);
  scatter('rock',23,30,2,3);
  scatter('rock',34,19,2,3);
  scatter('rock',40,12,2,3);

  // ---- I) CASTLE APPROACH detail (drawbridge at ~44,15-16) ----
  put('lamp',43,17); put('lamp',45,17);   // torches flanking the drawbridge
  put('lamp',42,14); put('lamp',46,14);   // gatehouse torches
  put('crate',41,17); put('crate',47,17); // gate supplies
  put('fence',42,17); put('fence',46,17); // gate barricades
  put('crate',44,18); put('crate',45,18); // little market stall crates
  put('bench',41,18); put('bench',47,18); // waiting benches at the gate
  put('chicken',43,18); put('chicken',46,18);
  scatter('rock',43,12,3,3);

  // ---- Jz) PUB in the giant ancient tree clearing, near the ranger lodge ----
  api.building({col:24,row:30,w:3,d:3,floors:1,kind:'shop',wall:'#5a3a1a',roof:'#3a2210',accent:'#e8c45c',name:'PUB'});

  // ---- J) One extra landmark: a lone lookout tower in an open pocket ----
  // sits in a naturally clear NW pocket, off the trail, no trees displaced.
  api.building({col:5,row:8,w:2,d:2,floors:3,landmark:'tower',name:'FOREST LOOKOUT'});
  put('lamp',5,11); put('crate',7,9); put('rock',4,11);

  // ---- 8) NPCs ----
  api.villagers(6); // rangers / travelers

  // ---- 9) SPAWN (REQUIRED) at SW trailhead, ensure walkable ----
  api.set(6,46,T.PATH);
  api.spawn(6,46);
};
