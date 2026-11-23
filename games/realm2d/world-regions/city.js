window.RegionGen = window.RegionGen || {};
window.RegionGen['city'] = function(api){
  var T = api.T;

  // ---- 0) Base: all grass ----
  api.fill(T.GRASS);

  // ---- 1) ROADS FIRST ----
  // Strict grid: a street every 3 tiles both directions (col%3==0, row%3==0), width 1.
  for(var c=0;c<=51;c++){
    if(c%3===0){
      for(var r=0;r<=51;r++) api.set(c,r,T.PATH);
    }
  }
  for(var r2=0;r2<=51;r2++){
    if(r2%3===0){
      for(var c2=0;c2<=51;c2++) api.set(c2,r2,T.PATH);
    }
  }

  // Every 3rd street is a wide AVENUE (width 2) at 12,24,36,48 both directions.
  var aves = [12,24,36,48];
  for(var i=0;i<aves.length;i++){
    api.roadLine(aves[i],0,aves[i],51,2,T.PATH); // vertical avenue
    api.roadLine(0,aves[i],51,aves[i],2,T.PATH); // horizontal avenue
  }

  // ELEVATED TRAIN track: visible line of PATH along row 18 across the map.
  api.roadLine(0,18,51,18,1,T.PATH);

  // ---- 2) BUILDINGS ----
  // Skyline pyramid: tallest at heart, stepping down outward.
  var CX = 26, CY = 26;
  function ringOf(col,row){
    var d = Math.max(Math.abs(col-CX), Math.abs(row-CY));
    if(d <= 6) return 'core';   // center
    if(d <= 15) return 'mid';
    return 'outer';
  }
  function floorsFor(band){
    if(band==='core') return api.rint(8,10);
    if(band==='mid')  return api.rint(5,7);
    return api.rint(2,4);
  }

  // Central plaza to keep open (no skyscraper here).
  function inPlaza(col,row){
    return col>=23 && col<=29 && row>=23 && row<=29;
  }

  var glassCyan = ['#2a4a6a','#3a5a7a'];
  var officeWalls = ['#6a707a','#8a929a'];

  // Fill the 3x3-ish blocks with office skyscrapers. Blocks anchored on grid,
  // building placed roughly centered in each block, footprint kept inside streets.
  // Block cells run between streets; place a building at the block center.
  var placed = [];
  function overlaps(col,row,w,d){
    for(var p=0;p<placed.length;p++){
      var b=placed[p];
      if(col < b.col+b.w && col+w > b.col && row < b.row+b.d && row+d > b.row) return true;
    }
    return false;
  }

  // Iterate block anchors. Streets sit at col%3==0, so open block interiors are the
  // cells between them. Use block centers on a coarse 6-tile pitch for big towers.
  for(var bc=4; bc<=46; bc+=6){
    for(var br=4; br<=46; br+=6){
      if(inPlaza(bc,br)) continue;
      // reserve some special sites (handled below) around edges/corners
      var band = ringOf(bc,br);
      var w = (band==='core')?3:(band==='mid'?3:2);
      var d = (band==='core')?3:(band==='mid'?3:2);
      var col = bc - Math.floor(w/2);
      var row = br - Math.floor(d/2);
      if(col<1||row<1||col+w>50||row+d>50) continue;
      if(overlaps(col,row,w,d)) continue;
      // leave the elevated train row a little clearer
      if(row<=18 && row+d>18 && api.chance(0.35)) continue;
      var f = floorsFor(band);
      api.building({
        col:col,row:row,w:w,d:d,floors:f,kind:'office',
        wall: officeWalls[api.rint(0,officeWalls.length-1)],
        roof:'#4a525c',
        glass: glassCyan[api.rint(0,glassCyan.length-1)],
        accent:'#5ad0ff'
      });
      placed.push({col:col,row:row,w:w,d:d});
    }
  }

  // ---- Named / special landmark buildings ----
  function tryPlace(cfg){
    var col=cfg.col,row=cfg.row,w=cfg.w,d=cfg.d;
    if(col<1||row<1||col+w>50||row+d>50) return false;
    api.building(cfg);
    placed.push({col:col,row:row,w:w,d:d});
    return true;
  }

  // MALL (wide), BANK, HOTEL — stone + gold.
  tryPlace({col:4,row:40,w:6,d:4,floors:2,kind:'shop',wall:'#c0bcb0',roof:'#9a8f70',glass:'#d8e0e6',accent:'#d8b040',name:'MALL'});
  tryPlace({col:38,row:4,w:3,d:3,floors:4,kind:'shop',wall:'#c0bcb0',roof:'#9a8f70',glass:'#d8e0e6',accent:'#d8b040',name:'BANK'});
  tryPlace({col:4,row:4,w:3,d:4,floors:6,kind:'shop',wall:'#c0bcb0',roof:'#9a8f70',glass:'#d8e0e6',accent:'#d8b040',name:'HOTEL'});
  tryPlace({col:44,row:40,w:3,d:3,floors:7,kind:'shop',wall:'#c0bcb0',roof:'#9a8f70',glass:'#d8e0e6',accent:'#d8b040',name:'PLAZA'});

  // A named skyscraper landmark TOWER near heart edge + a generic OFFICE label.
  tryPlace({col:19,row:19,w:3,d:3,floors:10,kind:'office',landmark:'tower',wall:'#7a828c',roof:'#4a525c',glass:'#2a4a6a',accent:'#5ad0ff',name:'TOWER'});
  tryPlace({col:31,row:31,w:3,d:3,floors:9,kind:'office',wall:'#6a707a',roof:'#4a525c',glass:'#3a5a7a',accent:'#5ad0ff',name:'OFFICE'});

  // ELEVATED TRAIN STATION landmark ~ (40,36).
  tryPlace({col:40,row:36,w:3,d:3,floors:2,kind:'transit',landmark:'station',wall:'#8a929a',roof:'#5a6470',glass:'#3a5a7a',accent:'#5ad0ff',name:'CENTRAL STATION'});

  // PARKING GARAGES at 2 corners.
  tryPlace({col:44,row:5,w:4,d:4,floors:3,kind:'office',wall:'#6a6a6a',roof:'#565656',glass:'#4a4a4a',accent:'#888888',name:'PARKING'});
  tryPlace({col:5,row:33,w:4,d:4,floors:3,kind:'office',wall:'#6a6a6a',roof:'#565656',glass:'#4a4a4a',accent:'#888888',name:'PARKING'});

  // Green copper-dome CITY HALL.
  tryPlace({col:14,row:38,w:4,d:3,floors:3,kind:'office',wall:'#c0bcb0',roof:'#5a7a6a',glass:'#d8e0e6',accent:'#7aa890',name:'CITY HALL'});

  // PUB — a beer-hall near the plaza for tactical missions
  tryPlace({col:32,row:20,w:3,d:3,floors:1,kind:'shop',wall:'#5a3a1a',roof:'#3a2210',accent:'#e8c45c',name:'PUB'});

  // ---- 3) CENTRAL FOUNTAIN PLAZA ~ (26,26) ----
  api.rect(23,23,29,29,T.PATH);            // ~5x5+ open plaza
  api.disc(26,26,1.5,T.WATER);             // fountain
  // ring benches + trees in grates around the fountain
  var benchSpots = [[24,24],[28,24],[24,28],[28,28],[26,23],[26,29],[23,26],[29,26]];
  for(var b1=0;b1<benchSpots.length;b1++){
    var bs=benchSpots[b1];
    if(api.get(bs[0],bs[1])!==T.WATER) api.prop('bench',bs[0],bs[1]);
  }
  var plazaTrees=[[24,25],[28,27],[25,29],[29,24]];
  for(var pt=0;pt<plazaTrees.length;pt++){
    api.prop('tree',plazaTrees[pt][0],plazaTrees[pt][1]);
  }

  // ---- 4) PROPS: traffic, lamps, street trees, benches ----
  // Cars along avenues (on PATH tiles).
  var carColors=['#e8c020','#2a2a30','#b03030','#e8c020','#303840'];
  function placeCar(col,row,hover){
    if(col<0||col>51||row<0||row>51) return;
    if(api.get(col,row)!==T.PATH) return;
    var color=carColors[api.rint(0,carColors.length-1)];
    api.prop(hover?'hovercar':'car',col,row,{color:color});
  }
  // vertical avenues
  for(var av=0;av<aves.length;av++){
    var ac=aves[av];
    for(var rr=5; rr<=47; rr+=api.rint(4,7)){
      placeCar(ac, rr, false);
      if(api.chance(0.15)) placeCar(ac+1, rr+2, true);
    }
  }
  // horizontal avenues
  for(var av2=0;av2<aves.length;av2++){
    var arow=aves[av2];
    for(var cc=5; cc<=47; cc+=api.rint(4,7)){
      placeCar(cc, arow, false);
      if(api.chance(0.15)) placeCar(cc+2, arow+1, true);
    }
  }

  // Lamps at avenue intersections.
  for(var lx=0;lx<aves.length;lx++){
    for(var ly=0;ly<aves.length;ly++){
      var ix=aves[lx], iy=aves[ly];
      if(api.get(ix,iy)===T.PATH){
        // place lamp just off the intersection so it doesn't block the crossing
        var lc=ix+ ( (ix<48)?2: -2 );
        var lr=iy;
        if(api.get(lc,lr)===T.GRASS) api.prop('lamp',lc,lr);
        else if(api.get(ix,iy+2)===T.GRASS) api.prop('lamp',ix,iy+2);
      }
    }
  }

  // Sparse street trees in grates along some streets (on grass beside roads).
  for(var st=0; st<40; st++){
    var tc=api.rint(2,49), tr=api.rint(2,49);
    if(inPlaza(tc,tr)) continue;
    if(api.get(tc,tr)===T.GRASS){
      // only if adjacent to a PATH (street-side)
      if(api.get(tc-1,tr)===T.PATH||api.get(tc+1,tr)===T.PATH||api.get(tc,tr-1)===T.PATH||api.get(tc,tr+1)===T.PATH){
        if(api.chance(0.6)) api.prop('tree',tc,tr);
      }
    }
  }

  // Benches near the plaza approaches.
  var approachBenches=[[26,21],[26,31],[21,26],[31,26],[22,22],[30,30]];
  for(var ab=0;ab<approachBenches.length;ab++){
    var abp=approachBenches[ab];
    if(api.get(abp[0],abp[1])===T.GRASS) api.prop('bench',abp[0],abp[1]);
  }

  // ---- 4b) EXTRA TRAFFIC: fill the avenues with a living stream of cars ----
  // Denser, staggered traffic down every avenue lane (only lands on PATH tiles).
  var cabColors=['#e8c020','#3a3a3a','#c03028','#2f6fe8','#eef1f4','#e8c020'];
  function streamCar(col,row,hover){
    if(col<0||col>51||row<0||row>51) return false;
    if(api.get(col,row)!==T.PATH) return false;
    var color=cabColors[api.rint(0,cabColors.length-1)];
    api.prop(hover?'hovercar':'car',col,row,{color:color});
    return true;
  }
  // Vertical avenues: two lanes (ac and ac+1), offset phase per avenue for variety.
  for(var va=0;va<aves.length;va++){
    var vac=aves[va];
    var phase=(va*2)%5;
    for(var vr=3+phase; vr<=49; vr+=3){
      if(inPlaza(vac,vr)) continue;
      streamCar(vac, vr, false);
      if((vr+va)%2===0) streamCar(vac+1, vr+1, false);
    }
  }
  // Horizontal avenues: two lanes (arw and arw+1).
  for(var ha=0;ha<aves.length;ha++){
    var harw=aves[ha];
    var hphase=(ha*2)%5;
    for(var hc=3+hphase; hc<=49; hc+=3){
      if(inPlaza(hc,harw)) continue;
      streamCar(hc, harw, false);
      if((hc+ha)%2===0) streamCar(hc+1, harw+1, false);
    }
  }
  // A few gliding hovercars near the core for that downtown-future feel.
  var hoverSpots=[[24,20],[27,33],[20,27],[33,26],[24,33],[33,20]];
  for(var hv=0;hv<hoverSpots.length;hv++){
    streamCar(hoverSpots[hv][0],hoverSpots[hv][1],true);
  }

  // ---- 4c) STREET LAMPS lining the avenues at every cross-street ----
  // Walk each avenue and drop a lamp on the grass shoulder beside cross-streets.
  function shoulderLamp(col,row){
    // try the four orthogonal neighbours for a grass shoulder
    var cand=[[col+1,row],[col-1,row],[col,row+1],[col,row-1]];
    for(var k=0;k<cand.length;k++){
      var cc=cand[k][0],cr=cand[k][1];
      if(cc<1||cc>50||cr<1||cr>50) continue;
      if(api.get(cc,cr)===T.GRASS){ api.prop('lamp',cc,cr); return; }
    }
  }
  for(var la=0;la<aves.length;la++){
    var lav=aves[la];
    // vertical avenue meets every cross-street (row%3==0)
    for(var lvr=6; lvr<=48; lvr+=6){
      if(inPlaza(lav,lvr)) continue;
      shoulderLamp(lav,lvr);
    }
    // horizontal avenue meets every cross-street (col%3==0)
    for(var lhc=6; lhc<=48; lhc+=6){
      if(inPlaza(lhc,lav)) continue;
      shoulderLamp(lhc,lav);
    }
  }

  // ---- 4d) POCKET PARK: a green breather block up in the NW quarter ----
  // Block interior around (8..10, 20..22) sits between streets; no tower there.
  var pkC0=8, pkR0=20, pkC1=10, pkR1=22;
  // lay a soft path cross through the park so it stays walkable
  for(var pkr=pkR0; pkr<=pkR1; pkr++) if(api.get(9,pkr)!==T.WATER) api.set(9,pkr,T.PATH);
  for(var pkc=pkC0; pkc<=pkC1; pkc++) if(api.get(pkc,21)!==T.WATER) api.set(pkc,21,T.PATH);
  // tiny pond in one corner of the park
  api.disc(pkC0,pkR1,0.9,T.WATER);
  // trees ring the park + benches face the cross-path
  var parkTrees=[[pkC0,pkR0],[pkC1,pkR0],[pkC1,pkR1],[pkC0+1,pkR0],[pkC1,pkR0+1]];
  for(var ptr=0;ptr<parkTrees.length;ptr++){
    var ptc=parkTrees[ptr];
    if(api.get(ptc[0],ptc[1])===T.GRASS) api.prop('tree',ptc[0],ptc[1]);
  }
  var parkBenches=[[pkC0,21],[pkC1,21],[9,pkR0]];
  for(var pbn=0;pbn<parkBenches.length;pbn++){
    var pbc=parkBenches[pbn];
    if(api.get(pbc[0],pbc[1])===T.GRASS) api.prop('bench',pbc[0],pbc[1]);
  }

  // ---- 4e) PLAZA LIFE: food carts, crates & more seating around the fountain ----
  var plazaStalls=[[25,24],[27,24],[25,28]];
  var stallColors=['#c03028','#2f6fe8','#e8c020'];
  for(var ps=0;ps<plazaStalls.length;ps++){
    var psc=plazaStalls[ps];
    if(api.get(psc[0],psc[1])===T.PATH){
      api.prop('stall',psc[0],psc[1],{color:stallColors[ps%stallColors.length]});
    }
  }
  var plazaCrates=[[27,28],[24,27]];
  for(var pcr=0;pcr<plazaCrates.length;pcr++){
    var pcc=plazaCrates[pcr];
    if(api.get(pcc[0],pcc[1])===T.PATH) api.prop('crate',pcc[0],pcc[1]);
  }
  // extra plaza benches + trees in grates for a busier square
  var morePlaza=[[25,26],[27,26],[26,24],[26,28]];
  for(var mp=0;mp<morePlaza.length;mp++){
    var mpc=morePlaza[mp];
    if(api.get(mpc[0],mpc[1])===T.PATH){
      if(mp%2===0) api.prop('bench',mpc[0],mpc[1]);
      else api.prop('tree',mpc[0],mpc[1]);
    }
  }

  // ---- 4f) BUS-STOP feel: bench pairs on shoulders near avenue corners ----
  var busCorners=[[12,24],[24,12],[36,24],[24,36],[12,36],[36,36]];
  function shoulderBench(col,row){
    var cand=[[col+2,row],[col-2,row],[col,row+2],[col,row-2],[col+1,row+1],[col-1,row-1]];
    var dropped=0;
    for(var k=0;k<cand.length && dropped<2;k++){
      var cc=cand[k][0],cr=cand[k][1];
      if(cc<1||cc>50||cr<1||cr>50) continue;
      if(inPlaza(cc,cr)) continue;
      if(api.get(cc,cr)===T.GRASS){ api.prop('bench',cc,cr); dropped++; }
    }
  }
  for(var bcz=0;bcz<busCorners.length;bcz++){
    shoulderBench(busCorners[bcz][0],busCorners[bcz][1]);
  }

  // ---- 4g) A few more street trees in grates along the avenues ----
  for(var ast=0; ast<24; ast++){
    var atc=api.rint(2,49), atr=api.rint(2,49);
    if(inPlaza(atc,atr)) continue;
    if(api.get(atc,atr)===T.GRASS){
      // must border an avenue-width road for that boulevard look
      var nearRoad = api.get(atc-1,atr)===T.PATH||api.get(atc+1,atr)===T.PATH||
                     api.get(atc,atr-1)===T.PATH||api.get(atc,atr+1)===T.PATH;
      if(nearRoad && api.chance(0.55)) api.prop('tree',atc,atr);
    }
  }

  // ---- 5) NPCs ----
  api.villagers(22);

  // ---- 5z) STREET FOOD CARTS on sidewalks near the plaza ----
  [[24,30],[30,24],[22,26],[32,32],[28,20]].forEach(function(p){ if(api.get(p[0],p[1])===T.PATH) api.prop('foodcart',p[0],p[1]); });
  // ---- 6) SPAWN (fountain plaza, walkable) ----
  api.spawn(26,29);
};
