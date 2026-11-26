/* ============================================================
   agent-dna-live.js — SHADDAI Agent-vs-Agent live layer (shared)
   Loaded by football / dodgeball / soccer. ONE job: the agents in
   these games stop being fixed perfect stat blocks.

   - DNA comes from the Colosseum server (/api/colosseum/state)
     when it is running — the SAME DNA as the Colosseum: real
     skills -> stats (cap 94), a real weakness, provider personality
     (Muse careful / Grok chaotic), error rates.
   - Offline it generates the same kind of DNA locally (seeded).
   - Per match, each agent rolls FORM (hot/cold night). Games call
     AgentDNA.factor(name, trait) to nudge their native stats:
     the factor is bounded 0.85..1.18 — it swings games, never rigs them.
   - AgentDNA.showVersus() = the VS cutscene. AgentDNA.say() = the
     presenter ticker (VEX / MIRA / KANE from the Colosseum desk).
   ============================================================ */
;(function () {
  'use strict';
  function hseed(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  function RNG(seed){var a=hseed(String(seed))||1;return function(){a=(a+0x6D2B79F5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
  var TRAITS=['analysis','defense','aggression','speed','precision','endurance','control','power','support','reaction'];
  var PROVIDERS={
    council:{risk:.45,consistency:.75,errorBase:.09,label:'Council'},
    Muse:{risk:.28,consistency:.86,errorBase:.07,label:'Muse'},
    grok:{risk:.88,consistency:.48,errorBase:.16,label:'Grok'},
    chatgpt:{risk:.5,consistency:.72,errorBase:.10,label:'ChatGPT'},
    custom:{risk:.55,consistency:.6,errorBase:.12,label:'Custom'}
  };
  // Council flavour so local DNA isn't flat: their domains, in trait weights
  var COUNCIL_FLAVOR={
    SHADDAI:{analysis:3,support:2,control:2}, NEXUS:{control:3,support:2,analysis:2},
    ZEROX:{aggression:3,power:2,precision:2}, ORACLE:{analysis:3,reaction:2,precision:1},
    TURTLE:{control:2,support:2,speed:2}, QUILL:{precision:3,analysis:1,support:1},
    PIKADON:{defense:3,reaction:2,power:1}
  };
  function localDNA(name){
    var r=RNG('dna::'+name); var flavor=COUNCIL_FLAVOR[name]||{}; var stats={};
    TRAITS.forEach(function(t){ stats[t]=Math.round(Math.max(38,Math.min(88, 46 + (flavor[t]||0)*9 + r()*22 ))); });
    var low=Object.entries(stats).sort(function(a,b){return a[1]-b[1]})[0][0]; stats[low]=Math.max(34,stats[low]-7);
    var high=Object.entries(stats).sort(function(a,b){return b[1]-a[1]})[0][0];
    return { provider:'council', providerLabel:'Council', archetypeName:'Council Original', stats:stats,
      overall:Math.round(Object.values(stats).reduce(function(a,b){return a+b},0)/10), bestStat:high, worstStat:low,
      tendencies:PROVIDERS.council, errorBase:PROVIDERS.council.errorBase, flaw:'Real weakness: '+low+'.' };
  }
  var DNAS={}, FORMS={}, ready=false, callbacks=[];
  /* ---------- bot registry (additive: forged/imported bots) ----------
     DNAS stays the name->dna cache it has always been. The registry adds
     what pickers need: an enumerable list of EVERY bot the Colosseum
     knows (council first, then user-forged/imported), and id-based
     lookup, so a forged bot resolves through get/factor/formFor exactly
     like a council name does. */
  var BOT_LIST=[], BOT_BY_ID={}, BOT_BY_NAME={};
  var COUNCIL_NAMES=['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'];
  function resolveDNA(key){
    if(key==null) return null;
    var k=String(key).toUpperCase();
    if(DNAS[k]) return DNAS[k];
    var e=BOT_BY_ID[key]||BOT_BY_ID[k]||BOT_BY_NAME[k];
    return e?e.dna:null;
  }
  function whenReady(cb){ if(ready){ cb(); } else callbacks.push(cb); }
  function formFor(name, seed){
    var key=name+'|'+(seed||'daily'); if(FORMS[key]!=null) return FORMS[key];
    var dna=resolveDNA(name)||localDNA(name.toUpperCase());
    var r=RNG('form::'+key); var swing=Math.round((r()-0.5)*2*(1.05-(dna.tendencies?dna.tendencies.consistency:0.6))*22);
    FORMS[key]=Math.max(-14,Math.min(14,swing)); return FORMS[key];
  }
  function factor(name, trait, seed){
    var dna=resolveDNA(name)||localDNA((name||'').toUpperCase());
    var stat=(dna.stats&&dna.stats[trait])||dna.overall||60;
    var f=0.92 + (stat-58)/260 + formFor(name, seed)/160;
    return Math.max(0.85, Math.min(1.18, f));
  }
  function mistakeRoll(name){ var dna=resolveDNA(name); var e=dna?dna.errorBase:0.1; return Math.random() < e; }
  function get(name){ return resolveDNA(name)||localDNA((name||'').toUpperCase()); }

  /* Normalise any bot (state bot {id,name,provider,dna}, a bots() entry,
     or a bare dna with a name) into the picker-facing shape. The entry's
     .dna is the exact object get() returns — a complete server dna is
     kept as-is, gaps are only filled, never overwritten. */
  function normalizeBot(b){
    var dna=b.dna||b;
    var name=b.name||dna.name||'BOT';
    var provider=String(b.provider||dna.provider||'custom').toLowerCase();
    var prov=PROVIDERS[provider]||PROVIDERS.custom;
    var complete=dna.stats&&dna.tendencies&&dna.errorBase!=null;
    var nd=complete?dna:Object.assign({}, dna);
    if(!complete){
      var ld=localDNA(String(name).toUpperCase());
      nd.provider=provider; nd.providerLabel=nd.providerLabel||prov.label;
      nd.archetypeName=nd.archetypeName||(provider==='council'?'Council Original':prov.label+' Bot');
      nd.tendencies=nd.tendencies||prov; nd.errorBase=nd.errorBase!=null?nd.errorBase:prov.errorBase;
      nd.stats=nd.stats||ld.stats; nd.flaw=nd.flaw||ld.flaw;
      if(nd.overall==null) nd.overall=ld.overall;
      if(!nd.bestStat||!nd.worstStat){
        var ent=Object.entries(nd.stats);
        nd.bestStat=nd.bestStat||ent.sort(function(a,c){return c[1]-a[1]})[0][0];
        nd.worstStat=nd.worstStat||ent.sort(function(a,c){return a[1]-c[1]})[0][0];
      }
    }
    return { id:b.id||('bot_'+String(name).toUpperCase()), name:name, provider:provider,
      providerLabel:nd.providerLabel, archetype:nd.archetypeName, archetypeName:nd.archetypeName, archetypeId:nd.archetype||null,
      tendencies:nd.tendencies, stats:nd.stats, overall:nd.overall, bestStat:nd.bestStat, worstStat:nd.worstStat,
      errorBase:nd.errorBase, flaw:nd.flaw, skills:b.skills||[], wins:b.wins||0, losses:b.losses||0, dna:nd };
  }
  /* Register a bot so get/factor/formFor/mistakeRoll resolve it by name
     OR id, and bots() lists it. Returns the normalised entry. */
  function registerBot(bot){
    if(!bot||!(bot.name||bot.dna)) return null;
    var entry=normalizeBot(bot);
    DNAS[entry.name.toUpperCase()]=entry.dna;
    BOT_BY_ID[entry.id]=entry; BOT_BY_ID[entry.id.toUpperCase()]=entry;
    BOT_BY_NAME[entry.name.toUpperCase()]=entry;
    var i=BOT_LIST.findIndex(function(x){ return x.id===entry.id; });
    if(i>=0) BOT_LIST[i]=entry; else BOT_LIST.push(entry);
    return entry;
  }
  function offlineBots(){
    return COUNCIL_NAMES.map(function(n){ return normalizeBot({ id:'council_'+n, name:n, provider:'council', dna:localDNA(n) }); });
  }
  /* bots() -> Promise of ALL bots: council first, then forged/imported.
     Resolves after the state load settles; offline (or no bots in state)
     it resolves to the 7 council entries from the local fallback, so
     pickers always have something to show. */
  function bots(){
    return new Promise(function(resolve){
      whenReady(function(){ resolve(BOT_LIST.length?BOT_LIST.slice():offlineBots()); });
    });
  }

  /* ---------- presenter ticker ---------- */
  /* Desktop: bottom-left card (unchanged). Touch / narrow screens: a compact
     2-line strip pinned top-left under the game HUD (the right-hand 86px column
     stays clear for CAM / PAUSE style buttons) that fades out a
     few seconds after each line, so it never sits on the joystick or the
     THROW / JUMP / action buttons at the bottom of the screen. */
  var TICKER_DESKTOP='position:fixed;left:10px;bottom:10px;z-index:80;max-width:min(430px,92vw);background:rgba(0,0,0,.82);border:1px solid rgba(192,132,252,.45);border-left:4px solid #c084fc;padding:8px 12px;font-family:"Share Tech Mono",monospace;font-size:12px;color:#d7e8dc;max-height:118px;overflow:hidden;pointer-events:none;';
  var TICKER_COMPACT='position:fixed;left:10px;top:calc(env(safe-area-inset-top,0px) + '+(window.DNA_TICKER_TOP||128)+'px);bottom:auto;z-index:80;width:min(300px,calc(100vw - 96px));max-width:none;background:rgba(0,0,0,.72);border:1px solid rgba(192,132,252,.35);border-left:3px solid #c084fc;border-radius:6px;padding:4px 8px;font-family:"Share Tech Mono",monospace;font-size:10.5px;line-height:1.3;color:#d7e8dc;max-height:30px;overflow:hidden;pointer-events:none;transition:opacity .5s ease;';
  var tickerHideT=null;
  function tickerCompact(){
    try{ return (window.matchMedia&&matchMedia('(pointer:coarse)').matches) || (window.innerWidth||1024)<=760; }catch(e){ return false; }
  }
  function styleTicker(d){
    var c=tickerCompact(); d.style.cssText=c?TICKER_COMPACT:TICKER_DESKTOP; d.setAttribute('data-compact',c?'1':'0');
    if(c){ while(d.children.length>2) d.removeChild(d.firstChild); }
  }
  function ensureTicker(){
    if(document.getElementById('dnaTicker')) return document.getElementById('dnaTicker');
    var d=document.createElement('div'); d.id='dnaTicker';
    styleTicker(d);
    window.addEventListener('resize',function(){ styleTicker(d); });
    document.body.appendChild(d); return d;
  }
  var WHO={vex:['VEX','#00f0ff'],mira:['MIRA','#c084fc'],kane:['KANE','#f5c542']};
  function say(who, text){
    var t=ensureTicker(); var p=document.createElement('div');
    var w=WHO[who]||WHO.vex; p.innerHTML='<b style="color:'+w[1]+'">'+w[0]+':</b> '+text;
    t.appendChild(p);
    var compact=t.getAttribute('data-compact')==='1';
    while(t.children.length>(compact?1:4)) t.removeChild(t.firstChild);
    if(compact){
      t.style.opacity='1';
      if(tickerHideT) clearTimeout(tickerHideT);
      tickerHideT=setTimeout(function(){ t.style.opacity='0'; }, 5200);
    }
  }
  function deskIntro(gameLabel, youName, oppName, seed){
    var y=get(youName), o=get(oppName);
    say('vex', gameLabel+' — '+youName+' vs '+oppName+'. Agent versus agent, live DNA, no fixed stats tonight.');
    say('mira', youName+': best '+y.bestStat+' '+y.stats[y.bestStat]+', weak '+y.worstStat+' '+y.stats[y.worstStat]+' · form '+(formFor(youName,seed)>=0?'+':'')+formFor(youName,seed)+'. '+oppName+': form '+(formFor(oppName,seed)>=0?'+':'')+formFor(oppName,seed)+'.');
    say('kane', y.errorBase>o.errorBase ? youName+' is the chaos risk tonight — more mistakes, more highlights.' : oppName+' is the chaos risk tonight — more mistakes, more highlights.');
  }

  /* ---------- VS cutscene ---------- */
  function showVersus(opts){
    var done=opts.onDone||function(){}; var finished=false;
    var y=get(opts.youName), o=get(opts.oppName);
    var cs=document.createElement('div');
    cs.style.cssText='position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Orbitron,sans-serif;padding:16px;cursor:pointer;';
    function card(n,d,c){ return '<div style="min-width:230px;max-width:300px;background:#050505;border:2px solid '+c+';padding:14px;color:#d7e8dc;font-family:\'Share Tech Mono\',monospace">'
      +'<img src="../public/assets/agents/'+n+'-portrait.png" onerror="this.style.display=\'none\'" style="width:84px;height:84px;object-fit:cover"/>'
      +'<div style="font-family:Orbitron,sans-serif;font-size:19px;color:#fff;margin:6px 0">'+n+'</div>'
      +'<div style="font-size:11px;color:'+c+'">'+(d.providerLabel||'')+' · '+(d.archetypeName||'')+' · OVR '+d.overall+'</div>'
      +'<div style="font-size:12px;margin-top:6px">▲ '+d.bestStat+' '+d.stats[d.bestStat]+' &nbsp; ▼ <span style="color:#ff5a7a">'+d.worstStat+' '+d.stats[d.worstStat]+'</span></div>'
      +'<div style="font-size:12px">FORM '+(formFor(n,opts.seed)>=0?'+':'')+formFor(n,opts.seed)+' · ERR '+(Math.round((d.errorBase||0.1)*100))+'%</div></div>'; }
    cs.innerHTML='<div style="font-size:12px;letter-spacing:3px;color:#6f8577">'+(opts.title||'AGENT VS AGENT')+'</div>'
      +'<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:center;margin:14px 0">'+card(opts.youName,y,opts.youColor||'#00f0ff')
      +'<div style="font-size:40px;color:#f5c542;font-weight:900">VS</div>'+card(opts.oppName,o,opts.oppColor||'#ff5a7a')+'</div>'
      +'<div style="color:#00f0ff;font-family:\'Share Tech Mono\',monospace;font-size:13px;max-width:560px">🎙️ VEX: "Paper stats are gone. Form, flaws and nerve decide this one."</div>'
      +'<div style="color:#6f8577;font-size:11px;margin-top:10px">click to play</div>';
    document.body.appendChild(cs);
    function finish(){ if(finished) return; finished=true; if(cs.parentNode) cs.parentNode.removeChild(cs); deskIntro(opts.title||'MATCH', opts.youName, opts.oppName, opts.seed); done(); }
    cs.addEventListener('click', finish); setTimeout(finish, 3400);
  }

  function report(game, agent, score, win){
    try{ fetch('/api/arcade/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game:game,agent:agent,score:score,win:!!win,mode:'agent-vs-agent'})}).catch(function(){}); }catch(e){}
  }

  /* ---------- PHOTO FINISH (shared by football / dodgeball / soccer) ----------
     When a finish lands inside the game's photo-finish band, the finish
     moment is captured, celebrated and kept:
       1. the canvas is captured at the finish moment (JPEG data URL),
       2. a PHOTO FINISH overlay shows the captured frame + final score +
          margin (fixed, pointer-events:none, auto-dismiss — the game's
          own game-over flow is NEVER blocked or gated behind it),
       3. the capture uploads FAIL-OPEN to POST /api/colosseum/photofinish
          (the games play identically with the endpoint down).
     Bands are per game, chosen by the caller: soccer ≤1 goal, football
     ≤3 points. Dodgeball's band is not a pure margin (decided in the final
     round, or by an HP squeaker), so a caller that has already applied its
     own rule passes force:true with the HP differential as the margin.
     A dead-level draw shows the moment but uploads nothing — there is no
     winner to credit, so it stays a moment, not a record.
     opts: { canvas, game, band, force, margin, winnerName, loserName,
             winnerId, loserId, scoreWinner, scoreLoser, scoreText, mode,
             matchRef } — returns true when the moment fired. */
  function idFor(name){
    if(name==null) return null;
    var up=String(name).toUpperCase();
    var e=BOT_BY_NAME[up];
    if(e&&e.id) return e.id;
    if(COUNCIL_NAMES.indexOf(up)>=0) return 'council_'+up;
    return null;
  }
  var PF_STYLE_DONE=false;
  function pfStyle(){
    if(PF_STYLE_DONE) return; PF_STYLE_DONE=true;
    var st=document.createElement('style');
    st.textContent='@keyframes pfIn{0%{transform:translate(-50%,0) scale(1.6) rotate(-5deg);opacity:0}100%{transform:translate(-50%,0) scale(1) rotate(-3deg);opacity:1}}'
      +'@keyframes pfCardIn{0%{transform:translateY(-14px);opacity:0}100%{transform:translateY(0);opacity:1}}'
      +'#pfOverlay{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:96;width:min(560px,94vw);pointer-events:none;background:rgba(3,8,13,.92);border:1px solid rgba(0,240,255,.55);border-radius:12px;padding:10px 12px;text-align:center;font-family:"Share Tech Mono",monospace;color:#d7e8dc;box-shadow:0 0 34px rgba(0,240,255,.22);animation:pfCardIn .45s ease both}'
      +'#pfOverlay img{width:100%;max-height:150px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,.18);display:block}'
      +'#pfOverlay .pfstamp{display:inline-block;font-family:Orbitron,sans-serif;font-weight:900;letter-spacing:2px;color:#ffd60a;border:3px solid #ffd60a;border-radius:8px;padding:4px 12px;margin-top:8px;text-shadow:0 0 14px rgba(255,214,10,.5);animation:pfIn .55s cubic-bezier(.2,.9,.3,1.3) both}'
      +'#pfOverlay .pfscore{font-family:Orbitron,sans-serif;font-size:21px;color:#fff;margin-top:7px}'
      +'#pfOverlay .pfsub{font-size:12px;color:#00f0ff;letter-spacing:1px;margin-top:3px}'
      +'@media (prefers-reduced-motion:reduce){#pfOverlay,#pfOverlay .pfstamp{animation:none}}';
    document.head.appendChild(st);
  }
  function photoFinish(opts){
    opts=opts||{};
    var margin=opts.margin;
    if(typeof margin!=='number'||!isFinite(margin)||margin<0) return false;
    if(!opts.force && typeof opts.band==='number' && margin>opts.band) return false;
    var dataUrl=null;
    try{ if(opts.canvas&&opts.canvas.toDataURL) dataUrl=opts.canvas.toDataURL('image/jpeg',0.85); }catch(e){}
    // the overlay — the captured frame under a stamp treatment
    try{
      pfStyle();
      var old=document.getElementById('pfOverlay'); if(old&&old.parentNode) old.parentNode.removeChild(old);
      var ov=document.createElement('div'); ov.id='pfOverlay'; ov.setAttribute('aria-live','polite');
      var head=opts.winnerName?('<b style="color:#ffd60a">'+String(opts.winnerName).replace(/</g,'')+'</b> TAKES IT'):'DEAD LEVEL — NO WINNER TO CREDIT';
      ov.innerHTML=(dataUrl?'<img src="'+dataUrl+'" alt="The finish frame"/>':'')
        +'<span class="pfstamp">📸 PHOTO FINISH</span>'
        +'<div class="pfscore">'+head+(opts.scoreText?' · '+String(opts.scoreText).replace(/</g,''):'')+'</div>'
        +'<div class="pfsub">MARGIN: '+margin+' — TOO CLOSE TO CALL WITH THE NAKED EYE</div>';
      document.body.appendChild(ov);
      setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); },4600);
    }catch(e){}
    try{ say('vex','PHOTO FINISH — '+(opts.winnerName?(opts.winnerName+' takes it '+(opts.scoreText||'')+', margin '+margin+'.'):'dead level at the death, margin '+margin+'.')+' Somebody frame that last frame.'); }catch(e){}
    // the upload — fail-open, and only when there is a winner to credit
    if(dataUrl&&opts.winnerName&&opts.loserName&&opts.game){
      try{
        fetch('/api/colosseum/photofinish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          matchRef:opts.matchRef||(opts.game+'-'+Date.now()),
          game:opts.game, winner:opts.winnerName, loser:opts.loserName,
          winnerId:opts.winnerId||idFor(opts.winnerName), loserId:opts.loserId||idFor(opts.loserName),
          margin:margin,
          finalScore:(typeof opts.scoreWinner==='number'&&typeof opts.scoreLoser==='number')?{winner:opts.scoreWinner,loser:opts.scoreLoser}:null,
          imageDataUrl:dataUrl
        })}).catch(function(){});
      }catch(e){}
    }
    return true;
  }

  window.AgentDNA={ get:get, factor:factor, formFor:formFor, mistakeRoll:mistakeRoll, showVersus:showVersus, say:say, deskIntro:deskIntro, report:report,
    bots:bots, registerBot:registerBot, photoFinish:photoFinish, idFor:idFor,
    ready:function(cb){ if(cb) whenReady(cb); } };

  // Load real DNA from the Colosseum server; local DNA stands in offline.
  // registerBot stores DNAS[name]=dna exactly as before, and additionally
  // fills the enumerable registry (council first — the state order).
  try{
    fetch('/api/colosseum/state').then(function(r){ return r.ok?r.json():null }).then(function(d){
      if(d&&d.bots){ d.bots.forEach(function(b){ registerBot(b); }); }
    }).catch(function(){}).finally(function(){ ready=true; callbacks.forEach(function(cb){ try{cb()}catch(e){} }); callbacks=[]; });
  }catch(e){ ready=true; }
})();
