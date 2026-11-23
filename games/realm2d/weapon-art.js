/* ══════════════════════════════════════════════════════════════════
   SHADDAI — weapon-art.js
   Code-drawn PIXEL weapon/tool sprites for the hotbar/backpack/store
   (replaces the flat emoji icons). Pure canvas, no assets. Cached as
   data-URLs so the hotbar can drop them into <img> without re-drawing.
     WeaponArt.dataURL(id, px=34) -> data URL (or '' if no art for id)
     WeaponArt.has(id) -> bool
     WeaponArt.iconHTML(id, px, fallbackEmoji) -> <img …> or emoji span
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var GRID = 16;                  // logical pixel grid the sprites are drawn on
  var cache = {};

  // p(ctx,scale,x,y,w,h,color) — fill a block of logical pixels.
  function P(c, s, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x * s, y * s, w * s, h * s); }

  // Each drawer paints on a GRID×GRID logical canvas (scaled by s).
  var ART = {
    sword: function (c, s) {                                   // steel blade, gold guard
      P(c, s, 7, 1, 2, 9, '#dfe7f0'); P(c, s, 8, 1, 1, 9, '#aeb9c8');   // blade + shade
      P(c, s, 7, 1, 2, 1, '#ffffff');                                    // tip glint
      P(c, s, 5, 10, 6, 1, '#e8c45c'); P(c, s, 5, 11, 6, 1, '#b8912e');  // crossguard
      P(c, s, 7, 11, 2, 3, '#7a5a2a');                                   // grip
      P(c, s, 6, 14, 4, 1, '#e8c45c');                                   // pommel
    },
    axe: function (c, s) {                                     // battle axe
      P(c, s, 8, 2, 1, 12, '#6a4a2a'); P(c, s, 9, 2, 1, 12, '#4a3018');  // haft
      P(c, s, 3, 2, 6, 5, '#c9d2dc'); P(c, s, 3, 2, 6, 1, '#eef3f8'); // head
      P(c, s, 2, 3, 2, 3, '#c9d2dc'); P(c, s, 3, 6, 5, 1, '#8f9aa8');    // blade curve + shade
      P(c, s, 8, 6, 3, 4, '#c9d2dc');                                     // back spike side
    },
    bow: function (c, s) {                                     // wooden bow + arrow
      P(c, s, 4, 2, 1, 12, '#8a5a2a'); P(c, s, 5, 1, 1, 2, '#8a5a2a'); P(c, s, 5, 13, 1, 2, '#8a5a2a');
      P(c, s, 3, 3, 1, 10, '#a06a34');                                    // limb highlight
      P(c, s, 6, 2, 1, 12, '#e8e0d0');                                    // string
      P(c, s, 6, 7, 9, 1, '#cfd6e0'); P(c, s, 13, 6, 2, 3, '#ff6a4a');    // arrow + head
      P(c, s, 6, 6, 1, 3, '#f0a83a');                                     // fletching
    },
    shield: function (c, s) {                                  // kite shield + emblem
      P(c, s, 4, 2, 8, 8, '#3a6ea5'); P(c, s, 4, 2, 8, 1, '#6fa0d8');
      P(c, s, 5, 10, 6, 2, '#3a6ea5'); P(c, s, 6, 12, 4, 2, '#2c527c');
      P(c, s, 4, 2, 1, 9, '#6fa0d8'); P(c, s, 11, 2, 1, 9, '#2c527c');
      P(c, s, 7, 4, 2, 6, '#e8c45c'); P(c, s, 6, 5, 4, 2, '#e8c45c');     // gold cross
    },
    staff: function (c, s) {                                   // neon staff + orb
      P(c, s, 7, 5, 2, 10, '#5a4030'); P(c, s, 8, 5, 1, 10, '#3a2818');   // pole
      P(c, s, 6, 1, 4, 4, '#00e5a0'); P(c, s, 7, 0, 2, 6, '#00ffb0');     // orb glow
      P(c, s, 5, 2, 1, 2, '#00ffb0'); P(c, s, 10, 2, 1, 2, '#00ffb0');    // spark arms
      P(c, s, 7, 2, 2, 1, '#eafff5');                                     // orb shine
    },
    pick: function (c, s) {                                    // pickaxe
      P(c, s, 8, 3, 1, 11, '#6a4a2a'); P(c, s, 9, 3, 1, 11, '#4a3018');   // handle
      P(c, s, 3, 3, 11, 1, '#9aa4b0'); P(c, s, 2, 4, 2, 1, '#9aa4b0'); P(c, s, 13, 4, 2, 1, '#9aa4b0'); // head
      P(c, s, 3, 2, 11, 1, '#c2ccd6');                                    // head highlight
    },
    rod: function (c, s) {                                     // fishing rod
      P(c, s, 3, 13, 10, 1, '#b06a34'); P(c, s, 12, 2, 1, 12, '#c98a4a'); // handle→tip
      P(c, s, 12, 2, 3, 1, '#c98a4a');                                    // tip bend
      P(c, s, 14, 2, 1, 7, '#cfd6e0');                                    // line
      P(c, s, 13, 9, 3, 2, '#e8c45c');                                    // hook/bob
    },
    potion: function (c, s) {                                  // health potion
      P(c, s, 6, 2, 4, 1, '#cfd6e0'); P(c, s, 7, 3, 2, 2, '#aeb9c8');     // cork+neck
      P(c, s, 5, 5, 6, 8, '#7a2030'); P(c, s, 5, 7, 6, 6, '#e0344a');     // glass + liquid
      P(c, s, 6, 8, 2, 4, '#ff8a9a');                                     // shine
      P(c, s, 5, 12, 6, 1, '#5a1020');
    },
    lantern: function (c, s) {                                 // lantern
      P(c, s, 7, 1, 2, 2, '#8a6a2a');                                     // ring
      P(c, s, 5, 3, 6, 9, '#3a2f1a'); P(c, s, 6, 4, 4, 7, '#ffcf5a');     // frame + glow
      P(c, s, 7, 5, 2, 4, '#fff2b0');                                     // flame core
      P(c, s, 5, 12, 6, 1, '#8a6a2a');
    },
    sofa: function (c, s) {                                    // cozy 2-seat sofa
      P(c, s, 2, 8, 12, 5, '#3a6ea5'); P(c, s, 2, 8, 12, 1, '#6fa0d8');    // seat cushion + highlight
      P(c, s, 2, 4, 12, 4, '#2c527c'); P(c, s, 2, 4, 12, 1, '#3a6ea5');    // backrest
      P(c, s, 1, 6, 2, 7, '#2c527c'); P(c, s, 13, 6, 2, 7, '#2c527c');     // armrests
      P(c, s, 3, 13, 2, 2, '#4a3018'); P(c, s, 11, 13, 2, 2, '#4a3018');   // legs
    },
    tv: function (c, s) {                                      // flatscreen on a stand
      P(c, s, 2, 2, 12, 8, '#15151c'); P(c, s, 3, 3, 10, 6, '#5fe0ff');    // frame + glowing screen
      P(c, s, 3, 3, 10, 1, '#aef0ff');                                     // screen glare
      P(c, s, 7, 10, 2, 2, '#3a3a42'); P(c, s, 5, 12, 6, 1, '#2a2a30');    // stand + base
    },
    bed: function (c, s) {                                     // cozy bed
      P(c, s, 1, 9, 14, 5, '#8a5a3a'); P(c, s, 1, 9, 14, 1, '#a06a44');    // frame + edge
      P(c, s, 2, 6, 12, 4, '#e8e0d0'); P(c, s, 2, 6, 12, 1, '#fffaf0');    // mattress + highlight
      P(c, s, 2, 4, 4, 3, '#f0a83a'); P(c, s, 2, 4, 4, 1, '#ffcf6a');      // pillow
      P(c, s, 1, 13, 2, 2, '#4a3018'); P(c, s, 13, 13, 2, 2, '#4a3018');   // legs
    },
    hplant: function (c, s) {                                  // potted plant
      P(c, s, 6, 10, 4, 4, '#a05a2a'); P(c, s, 6, 10, 4, 1, '#c07a3a');    // pot
      P(c, s, 7, 2, 2, 9, '#2a7a3a');                                      // stem
      P(c, s, 4, 2, 3, 4, '#3a9a4a'); P(c, s, 9, 3, 3, 4, '#3a9a4a'); P(c, s, 6, 0, 4, 3, '#4aba5a'); // leaves
    },
    hlamp: function (c, s) {                                   // floor lamp
      P(c, s, 5, 2, 6, 5, '#e8c45c'); P(c, s, 5, 2, 6, 1, '#ffe38a');      // shade + glow rim
      P(c, s, 7, 7, 2, 7, '#5a5a62');                                      // pole
      P(c, s, 4, 14, 8, 1, '#3a3a42');                                     // base
    },
    rug: function (c, s) {                                     // patterned floor rug
      P(c, s, 1, 5, 14, 6, '#7a2030'); P(c, s, 1, 5, 14, 1, '#9a3a48');    // rug body + top edge
      P(c, s, 3, 7, 10, 2, '#e8c45c');                                     // gold stripe
      P(c, s, 1, 5, 14, 1, '#e8c45c'); P(c, s, 1, 10, 14, 1, '#e8c45c');   // border trim
    },
    art: function (c, s) {                                     // framed painting
      P(c, s, 3, 2, 10, 12, '#6a4a2a');                                    // frame
      P(c, s, 4, 3, 8, 10, '#2f6fe8'); P(c, s, 5, 8, 3, 4, '#3a9a4a'); P(c, s, 9, 4, 2, 3, '#e8c45c'); // canvas scene
    },
    table: function (c, s) {                                   // wood side table
      P(c, s, 2, 6, 12, 2, '#8a6a4a'); P(c, s, 2, 6, 12, 1, '#a07a54');     // top + highlight
      P(c, s, 3, 8, 1, 6, '#6a4e34'); P(c, s, 12, 8, 1, 6, '#6a4e34');      // legs
    },
    shelf: function (c, s) {                                   // bookshelf with books
      P(c, s, 2, 1, 1, 14, '#6a7a8a'); P(c, s, 13, 1, 1, 14, '#6a7a8a');    // side posts
      P(c, s, 2, 5, 12, 1, '#586878'); P(c, s, 2, 10, 12, 1, '#586878');    // shelves
      P(c, s, 3, 2, 2, 3, '#e0344a'); P(c, s, 5, 2, 2, 3, '#e8c45c'); P(c, s, 7, 2, 2, 3, '#00e5a0'); // books row 1
      P(c, s, 3, 6, 2, 4, '#5fe0ff'); P(c, s, 5, 6, 2, 4, '#e0344a');       // books row 2
    },
    chest: function (c, s) {                                   // storage chest
      P(c, s, 2, 6, 12, 8, '#7a5636'); P(c, s, 2, 6, 12, 1, '#8a6440');     // body + lid highlight
      P(c, s, 2, 3, 12, 3, '#8a6440'); P(c, s, 2, 3, 12, 1, '#a07a4e');     // curved lid
      P(c, s, 6, 7, 4, 2, '#e8c45c');                                       // clasp
    },
    screen: function (c, s) {                                   // room divider / partition screen
      P(c, s, 2, 1, 4, 14, '#1a2438'); P(c, s, 6, 1, 4, 14, '#223050'); P(c, s, 10, 1, 4, 14, '#1a2438'); // 3 folding panels
      P(c, s, 3, 3, 2, 3, '#5fe0ff'); P(c, s, 7, 7, 2, 3, '#e8c45c'); P(c, s, 11, 4, 2, 3, '#5fe0ff'); // panel motifs
    },
    couch: function (c, s) {                                   // 2-seat couch (blue variant of sofa)
      P(c, s, 2, 8, 12, 5, '#3a5a8a'); P(c, s, 2, 8, 12, 1, '#5a7aac');     // seat + highlight
      P(c, s, 2, 4, 12, 4, '#2c4a72'); P(c, s, 1, 6, 2, 7, '#2c4a72'); P(c, s, 13, 6, 2, 7, '#2c4a72'); // back + arms
    },
    desk: function (c, s) {                                   // office desk with drawers
      P(c, s, 1, 4, 14, 2, '#6a6a72'); P(c, s, 1, 4, 14, 1, '#84848c');     // desktop + highlight
      P(c, s, 2, 6, 4, 8, '#54545c'); P(c, s, 3, 8, 2, 1, '#e8c45c'); P(c, s, 3, 11, 2, 1, '#e8c45c'); // drawer unit + handles
      P(c, s, 12, 6, 2, 8, '#54545c');                                     // far leg panel
    },
    hearth: function (c, s) {                                   // fireplace
      P(c, s, 2, 2, 12, 13, '#3a2622'); P(c, s, 4, 4, 8, 11, '#1a1210');    // stone surround + firebox
      P(c, s, 6, 8, 2, 4, '#ff8a3a'); P(c, s, 8, 7, 2, 5, '#ffcf5a'); P(c, s, 6, 8, 1, 1, '#fff2b0'); // flames
    },
    barrel: function (c, s) {                                   // wooden barrel
      P(c, s, 3, 2, 10, 12, '#7a5636'); P(c, s, 3, 6, 10, 1, '#4a3018'); P(c, s, 3, 10, 10, 1, '#4a3018'); // body + bands
      P(c, s, 4, 2, 8, 1, '#8a6440');                                       // top highlight
    },
    vault: function (c, s) {                                   // security vault door
      P(c, s, 2, 1, 12, 14, '#3a3f4a'); P(c, s, 3, 2, 10, 12, '#2a2f38');    // door + inset panel
      P(c, s, 8, 8, 2, 2, '#e8c45c');                                       // dial/lock
      P(c, s, 8, 4, 1, 3, '#e8c45c'); P(c, s, 8, 9, 1, 3, '#e8c45c'); P(c, s, 4, 8, 3, 1, '#e8c45c'); P(c, s, 9, 8, 3, 1, '#e8c45c'); // bolt marks
    },
    crate: function (c, s) {                                   // wooden crate
      P(c, s, 2, 3, 12, 11, '#8a6a4a'); P(c, s, 2, 3, 12, 1, '#a07a54');    // body + top
      P(c, s, 2, 3, 1, 11, '#6a4e34'); P(c, s, 13, 3, 1, 11, '#6a4e34');    // corner posts
      P(c, s, 2, 8, 12, 1, '#6a4e34');                                     // mid brace
    },
    counter: function (c, s) {                                   // bar counter
      P(c, s, 1, 5, 14, 2, '#8a6a4a'); P(c, s, 1, 5, 14, 1, '#a07a54');     // countertop + highlight
      P(c, s, 2, 7, 12, 7, '#5a4230');                                     // base
      P(c, s, 4, 2, 1, 4, '#5fe0ff'); P(c, s, 10, 2, 1, 4, '#5fe0ff');      // glasses on top
    },
    monitor: function (c, s) {                                   // desktop monitor
      P(c, s, 3, 2, 10, 7, '#15151c'); P(c, s, 4, 3, 8, 5, '#5fe0ff');       // frame + glowing screen
      P(c, s, 7, 9, 2, 2, '#3a3a42'); P(c, s, 5, 11, 6, 1, '#2a2a30');      // stand + base
    },
    stool: function (c, s) {                                   // simple bar stool
      P(c, s, 5, 3, 6, 2, '#6a4a2a');                                       // seat
      P(c, s, 6, 5, 1, 9, '#4a3018'); P(c, s, 9, 5, 1, 9, '#4a3018');       // legs
    },
    pillar: function (c, s) {                                   // stone column
      P(c, s, 5, 0, 6, 2, '#d9c9a0'); P(c, s, 6, 2, 4, 12, '#c9b98a');       // capital + shaft
      P(c, s, 5, 14, 6, 2, '#d9c9a0');                                      // base
    },
    banner: function (c, s) {                                   // hanging cloth banner
      P(c, s, 5, 0, 6, 1, '#4a3018');                                       // rod
      P(c, s, 5, 1, 6, 11, '#00b877'); P(c, s, 5, 1, 6, 1, '#00e5a0');      // cloth + top highlight
      P(c, s, 5, 12, 2, 3, '#00b877'); P(c, s, 9, 12, 2, 3, '#00b877');     // split fringe tails
    },
    crystal: function (c, s) {                                   // glowing crystal shard
      P(c, s, 6, 1, 4, 3, '#8affe6'); P(c, s, 5, 4, 6, 5, '#5fe0ff'); P(c, s, 6, 9, 4, 4, '#3ab8d8'); // faceted body
      P(c, s, 7, 2, 1, 1, '#ffffff');                                       // glint
    },
  };
  // shared aliases for tool ids the game uses
  ART.hide = null; // (materials keep emoji)
  // DECOR (game.html) names two furniture pieces differently than the earlier
  // office-furniture batch that coined hplant/hlamp -- same drawing, real id.
  ART.plant = ART.hplant;
  ART.lamp = ART.hlamp;

  // Real fal-generated icons — preferred over the code-drawn canvas art below
  // wherever an id has one. Generated 2026-09-14, isometric style, transparent
  // background (backend/scripts/remove-white-bg.cjs). Maps id -> asset path
  // since furniture and weapon/tool items live in separate folders.
  var REAL_ART = {
    sofa:'assets/furniture/sofa.png', tv:'assets/furniture/tv.png', bed:'assets/furniture/bed.png',
    table:'assets/furniture/table.png', shelf:'assets/furniture/shelf.png', plant:'assets/furniture/plant.png',
    rug:'assets/furniture/rug.png', lamp:'assets/furniture/lamp.png', chest:'assets/furniture/chest.png',
    screen:'assets/furniture/screen.png', couch:'assets/furniture/couch.png', desk:'assets/furniture/desk.png',
    hearth:'assets/furniture/hearth.png', barrel:'assets/furniture/barrel.png', vault:'assets/furniture/vault.png',
    crate:'assets/furniture/crate.png', counter:'assets/furniture/counter.png', monitor:'assets/furniture/monitor.png',
    stool:'assets/furniture/stool.png', pillar:'assets/furniture/pillar.png', banner:'assets/furniture/banner.png',
    crystal:'assets/furniture/crystal.png',
    art:'assets/furniture/art.png',
    sword:'assets/items/sword.png', axe:'assets/items/axe.png', bow:'assets/items/bow.png',
    shield:'assets/items/shield.png', staff:'assets/items/staff.png', pick:'assets/items/pick.png',
    rod:'assets/items/rod.png', potion:'assets/items/potion.png', lantern:'assets/items/lantern.png',
    // trade goods + catchables (world economy) — neon-punk isometric icons
    wood:'assets/items/goods/wood.png', hide:'assets/items/goods/hide.png',
    water:'assets/items/goods/water.png', ore:'assets/items/goods/ore.png',
    trinket:'assets/items/goods/trinket.png',
    minnow:'assets/items/fish/minnow.png', bass:'assets/items/fish/bass.png',
    salmon:'assets/items/fish/salmon.png', tuna:'assets/items/fish/tuna.png',
    levi:'assets/items/fish/levi.png',
    // store/game.html sells the house plant & floor lamp as hplant/hlamp —
    // alias to the furniture sprites so the shop shows the real fal art.
    hplant:'assets/furniture/plant.png', hlamp:'assets/furniture/lamp.png'
  };

  function render(id, px) {
    var drawer = ART[id]; if (!drawer) return '';
    var key = id + '@' + px;
    if (cache[key]) return cache[key];
    var cv = document.createElement('canvas'); cv.width = px; cv.height = px;
    var c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    drawer(c, px / GRID);
    var url = cv.toDataURL('image/png');
    cache[key] = url; return url;
  }

  window.WeaponArt = {
    has: function (id) { return !!REAL_ART[id] || !!ART[id]; },
    dataURL: function (id, px) { return REAL_ART[id] || render(id, px || 34); },
    iconHTML: function (id, px, fallbackEmoji) {
      px = px || 30;
      if (REAL_ART[id]) return '<img class="wico" src="' + REAL_ART[id] + '" alt="" style="width:' + px + 'px;height:' + px + 'px;object-fit:contain;vertical-align:middle" draggable="false">';
      var url = render(id, px * 2);   // 2× for crispness, CSS scales down
      if (url) return '<img class="wico" src="' + url + '" alt="" style="width:' + px + 'px;height:' + px + 'px;image-rendering:pixelated;vertical-align:middle" draggable="false">';
      return '<span>' + (fallbackEmoji || '📦') + '</span>';
    }
  };
})();
