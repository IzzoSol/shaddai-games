/* ═══════════════════════════════════════════════════════════════════════════
   XTO_Story — the opening story module.  "SHE STARTS IN BED."
   ───────────────────────────────────────────────────────────────────────────
   Author: QUILL (Writing & Communication)

   Contract:  window.XTO_Story = { build(ctx){ ... return {update(dt,t)} } }
   ctx = { THREE, scene, camera, renderer, loader, canvas, hud, keys, input,
           player:{object3D,position}, time, state, helpers, flags:{paused},
           lights, chosen, city:{spawn}, terrain }

   Story is the LAST module (player + city already exist).

   WHAT IT DOES
   ────────────
   1. BEDROOM INTRO (DOM cinematic, chosen for reliability):
      A full-screen dark-neon panel over the canvas showing a cozy futuristic
      bedroom (HF-generated /assets/xto/bedroom.jpg if present, else a
      procedurally-drawn neon bedroom canvas so it always looks intentional),
      the hero portrait, and QUILL-written wake-up narration that types + fades
      in over several beats, then a "▶ Rise" button.  Neon-glow + swivel accents.

   2. NARRATION: a short, mythic 5-beat opening (below).  It's hand-written
      here as a rich placeholder; a later pass can swap `NARRATION` for an
      LLM-generated, per-character script (see note at the narration block).

   3. TRANSITION: build() sets ctx.flags.paused = true so the 3D world does not
      run under the overlay.  On "Rise" the bedroom fades out, the hero is
      placed at ctx.city.spawn, and ctx.flags.paused = false hands control to
      the player.  The first quest objective is shown in the HUD.

   4. QUEST HUD LINE: a neon .panel objective line ("Step outside · find
      SHADDAI") mounted in ctx.hud, with a tiny API (advanceQuest / setQuest)
      so later modules can push the story forward.

   Perf: the intro is pure DOM; the 3D loop is paused while it is up, so there
   is no cost.  update(dt,t) only animates the quest line's neon pulse.

   Self-bootstrap: the shell's MODULE list does NOT include XTO_Story, and this
   file may not edit the shell, so the module waits for window.XTO (+ player +
   city) to exist, then calls its own build().  It also exports build() so a
   future shell that DOES list it works with no double-run (guarded by a flag).
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── The town name + villain + council flavor live here so a future LLM pass
  //    can regenerate NARRATION per chosen character without touching logic. ──
  const TOWN = 'Aurelia';           // the agentic town she wakes in
  const CASTLE = 'the Obsidian Spire';
  const VILLAIN = 'the Hollow King';

  // Per-character portrait + a one-word epithet (chosen is UPPERCASE).
  const HEROES = {
    TURTLE: { portrait: '/assets/xto/portrait-turtle.jpg', name: 'TURTLE', epithet: 'the Emerald Enforcer' },
    ORACLE: { portrait: '/assets/xto/portrait-oracle.jpg', name: 'ORACLE', epithet: 'the Sightbringer' },
    XEROX:  { portrait: '/assets/xto/portrait-xerox.jpg',  name: 'XEROX',  epithet: 'the Blue Blade' },
    ZEROX:  { portrait: '/assets/xto/portrait-xerox.jpg',  name: 'ZEROX',  epithet: 'the Blue Blade' }
  };

  // ── QUILL-WRITTEN OPENING NARRATION ───────────────────────────────────────
  // 5 beats, mythic and punchy: wake → the calling → the council → the castle
  // & villain → her first step.  Kept short on purpose.
  // NOTE: later this can be LLM-generated per character (feed HERO.name +
  // epithet + TOWN/CASTLE/VILLAIN into a prompt and replace this array).
  function narration(hero) {
    return [
      { t: 'You wake.',
        s: `Dawn leaks cyan through the shutters of your room, high above the agentic town of ${TOWN}.` },
      { t: 'Something is stirring.',
        s: `A hum runs under the floor — not the city’s heartbeat, but a warning. The grid is dreaming, and the dream has teeth.` },
      { t: 'The Council knows.',
        s: `Downstairs, SHADDAI and the others are already awake. They have been waiting. For you.` },
      { t: 'A shadow over ' + TOWN + '.',
        s: `${CASTLE} burns black on the horizon, and within it ${VILLAIN} rebuilds what the world buried. Its light is going out, one street at a time.` },
      { t: `Rise, ${hero.name}.`,
        s: `They call you ${hero.epithet}. Today that name has to mean something. Pull on your boots. Step into the street.` }
    ];
  }

  // ── STYLES (scoped, injected once) ────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('xto-story-css')) return;
    const el = document.createElement('style');
    el.id = 'xto-story-css';
    el.textContent = `
      #xto-intro{position:fixed;inset:0;z-index:150;display:flex;align-items:center;justify-content:center;
        background:radial-gradient(ellipse at 50% 30%,#0b1226,#04060d 72%);opacity:0;transition:opacity .6s ease;
        font-family:'Segoe UI',system-ui,sans-serif;color:#dbe8ff;overflow:hidden}
      #xto-intro.show{opacity:1}
      #xto-intro.hide{opacity:0;pointer-events:none}
      /* swirl accents */
      #xto-intro .swirl{position:absolute;border-radius:50%;pointer-events:none;mix-blend-mode:screen;filter:blur(2px);
        border:2px solid transparent}
      #xto-intro .swirl.a{width:520px;height:520px;left:-120px;top:-140px;
        border-top-color:#27e0ff;border-right-color:#8a6cff;animation:xtoSpin 22s linear infinite;opacity:.5}
      #xto-intro .swirl.b{width:380px;height:380px;right:-90px;bottom:-110px;
        border-bottom-color:#1fd6c4;border-left-color:#27e0ff;animation:xtoSpin 30s linear infinite reverse;opacity:.45}
      @keyframes xtoSpin{to{transform:rotate(360deg)}}
      #xto-intro .stage{position:relative;width:min(920px,92vw);max-height:92vh;
        border:1px solid rgba(39,224,255,.28);border-radius:18px;overflow:hidden;
        background:linear-gradient(180deg,rgba(10,18,38,.72),rgba(4,6,13,.9));
        box-shadow:0 0 60px rgba(39,224,255,.18),inset 0 0 40px rgba(138,108,255,.08);backdrop-filter:blur(2px)}
      #xto-intro .art{position:relative;width:100%;aspect-ratio:1024/560;background:#060a16;overflow:hidden}
      #xto-intro .art canvas,#xto-intro .art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
      #xto-intro .art::after{content:'';position:absolute;inset:0;
        background:linear-gradient(180deg,rgba(4,6,13,0) 40%,rgba(4,6,13,.85) 100%)}
      #xto-intro .who{position:absolute;left:18px;bottom:14px;z-index:2;display:flex;align-items:center;gap:12px}
      #xto-intro .who img{width:56px;height:56px;border-radius:12px;object-fit:cover;
        border:1.5px solid rgba(39,224,255,.7);box-shadow:0 0 18px rgba(39,224,255,.5)}
      #xto-intro .who .nm{font-family:'Cinzel',serif;font-weight:800;letter-spacing:.14em;font-size:15px;
        color:#eaf4ff;text-shadow:0 0 12px rgba(39,224,255,.6)}
      #xto-intro .who .ep{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#7f93b8}
      #xto-intro .script{padding:22px 26px 8px;min-height:132px}
      #xto-intro .beatT{font-family:'Cinzel',serif;font-weight:800;font-size:clamp(20px,3.4vw,30px);letter-spacing:.06em;
        background:linear-gradient(120deg,#27e0ff,#8a6cff,#1fd6c4);-webkit-background-clip:text;background-clip:text;
        color:transparent;filter:drop-shadow(0 0 16px rgba(39,224,255,.35));margin-bottom:10px;min-height:1.2em}
      #xto-intro .beatS{font-size:clamp(14px,1.9vw,17px);line-height:1.55;color:#c3d4f2;max-width:60ch;min-height:3.1em}
      #xto-intro .beatS .car{color:#27e0ff;animation:xtoBlink 1s steps(1) infinite}
      @keyframes xtoBlink{50%{opacity:0}}
      #xto-intro .foot{display:flex;align-items:center;justify-content:space-between;gap:16px;
        padding:6px 26px 22px}
      #xto-intro .dots{display:flex;gap:7px}
      #xto-intro .dots i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.14);transition:.3s}
      #xto-intro .dots i.on{background:#27e0ff;box-shadow:0 0 10px #27e0ff}
      #xto-intro .skip{background:none;border:none;color:#5f739a;font-size:11px;letter-spacing:.24em;
        text-transform:uppercase;cursor:pointer;padding:8px 4px}
      #xto-intro .skip:hover{color:#9fb4d8}
      #xto-intro .rise{opacity:0;transform:translateY(8px);transition:.5s;pointer-events:none;
        font-family:'Cinzel',serif;font-weight:800;letter-spacing:.14em;font-size:16px;color:#04060d;
        padding:12px 30px;border:none;border-radius:12px;cursor:pointer;
        background:linear-gradient(120deg,#27e0ff,#1fd6c4);box-shadow:0 0 26px rgba(39,224,255,.55)}
      #xto-intro .rise.ready{opacity:1;transform:none;pointer-events:auto;animation:xtoPulse 2.4s ease-in-out infinite}
      #xto-intro .rise:hover{filter:brightness(1.12)}
      @keyframes xtoPulse{0%,100%{box-shadow:0 0 22px rgba(39,224,255,.45)}50%{box-shadow:0 0 40px rgba(39,224,255,.85)}}

      /* Quest objective HUD line */
      #xto-quest{position:absolute;top:16px;left:50%;transform:translateX(-50%);
        display:flex;align-items:center;gap:10px;padding:9px 18px;border-radius:999px;
        border:1px solid rgba(39,224,255,.35);background:rgba(6,12,26,.72);backdrop-filter:blur(6px);
        font-family:'Segoe UI',system-ui,sans-serif;font-size:13px;letter-spacing:.04em;color:#dbe8ff;
        box-shadow:0 0 22px rgba(39,224,255,.22);opacity:0;transition:opacity .5s}
      #xto-quest.show{opacity:1}
      #xto-quest .swz{width:14px;height:14px;border-radius:50%;border:2px solid transparent;
        border-top-color:#27e0ff;border-right-color:#8a6cff;animation:xtoSpin 3.2s linear infinite}
      #xto-quest .lbl{font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:#7f93b8}
      #xto-quest b{color:#eaf4ff;font-weight:700}
    `;
    document.head.appendChild(el);
  }

  // ── Procedural neon bedroom (fallback if bedroom.jpg is missing/unloadable) ─
  //    Drawn once to a canvas; looks intentional, not a flat gradient.
  function paintBedroom(cv) {
    const w = cv.width = 1024, h = cv.height = 560;
    const g = cv.getContext('2d');
    // wall gradient — dawn teal→violet
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a1a33'); bg.addColorStop(0.55, '#0b1226'); bg.addColorStop(1, '#06090f');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // floor
    g.fillStyle = '#080d18'; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.strokeStyle = 'rgba(39,224,255,.18)'; g.lineWidth = 1;
    for (let i = 0; i < 10; i++) { const y = h * 0.72 + i * (h * 0.28 / 10); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // window with dawn light (right)
    const wx = w * 0.60, wy = h * 0.12, ww = w * 0.30, wh = h * 0.46;
    const sky = g.createLinearGradient(wx, wy, wx, wy + wh);
    sky.addColorStop(0, '#2a4a7a'); sky.addColorStop(0.6, '#3a6ea8'); sky.addColorStop(1, '#e8b98a');
    g.fillStyle = sky; g.fillRect(wx, wy, ww, wh);
    g.strokeStyle = 'rgba(39,224,255,.55)'; g.lineWidth = 3; g.strokeRect(wx, wy, ww, wh);
    g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh);
    g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
    // light shaft from window across floor
    const shaft = g.createLinearGradient(wx, wy + wh, wx - 260, h);
    shaft.addColorStop(0, 'rgba(232,185,138,.28)'); shaft.addColorStop(1, 'rgba(232,185,138,0)');
    g.fillStyle = shaft; g.beginPath();
    g.moveTo(wx, wy + wh); g.lineTo(wx + ww, wy + wh); g.lineTo(wx + ww - 120, h); g.lineTo(wx - 300, h); g.closePath(); g.fill();
    // bed (left) — frame + mattress + neon trim + glow pillow
    const bx = w * 0.06, by = h * 0.52, bw = w * 0.44, bh = h * 0.26;
    g.fillStyle = '#12203a'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#1b2f52'; g.fillRect(bx, by - h * 0.06, bw, h * 0.08); // headboard
    g.fillStyle = '#c9d8f0'; g.fillRect(bx + 8, by + 6, bw - 16, bh * 0.42); // sheets
    g.fillStyle = '#eaf1ff'; g.fillRect(bx + 18, by + 2, bw * 0.28, bh * 0.3); // pillow
    // neon trim on bed
    g.shadowColor = '#27e0ff'; g.shadowBlur = 22; g.strokeStyle = '#27e0ff'; g.lineWidth = 3;
    g.strokeRect(bx, by, bw, bh);
    g.shadowBlur = 0;
    // holo wall panels (violet)
    g.shadowColor = '#8a6cff'; g.shadowBlur = 18;
    g.strokeStyle = 'rgba(138,108,255,.8)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const px = w * 0.08 + i * 46, py = h * 0.14; g.strokeRect(px, py, 34, 96); }
    g.shadowBlur = 0;
    // small plant + lamp glow
    g.fillStyle = '#1fd6c4'; g.beginPath(); g.arc(w * 0.54, h * 0.66, 6, 0, 7); g.fill();
    const lamp = g.createRadialGradient(w * 0.03, h * 0.30, 4, w * 0.03, h * 0.30, 120);
    lamp.addColorStop(0, 'rgba(39,224,255,.35)'); lamp.addColorStop(1, 'rgba(39,224,255,0)');
    g.fillStyle = lamp; g.fillRect(0, h * 0.16, 240, 240);
    // vignette
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
  }

  // Try to load the HF bedroom.jpg; on any failure paint the procedural one.
  function mountArt(container) {
    const cv = document.createElement('canvas');
    container.appendChild(cv);
    const img = new Image();
    let settled = false;
    const useFallback = () => { if (settled) return; settled = true; paintBedroom(cv); };
    img.onload = () => {
      if (settled) return; settled = true;
      cv.remove();
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block';
      container.insertBefore(img, container.firstChild);
    };
    img.onerror = useFallback;
    // if the image hasn't loaded promptly, paint fallback so we never stall
    setTimeout(() => { if (!img.complete || img.naturalWidth === 0) useFallback(); }, 1400);
    img.src = '/assets/xto/bedroom.jpg?v=1';
  }

  // ── The build ─────────────────────────────────────────────────────────────
  function build(ctx) {
    injectCSS();

    const chosen = (ctx.chosen || 'TURTLE').toUpperCase();
    const hero = HEROES[chosen] || HEROES.TURTLE;
    const beats = narration(hero);

    // Pause the world so the 3D loop does not run under the overlay.
    ctx.flags.paused = true;

    // Place the hero at the town spawn now, ready for when we un-pause.
    try {
      const sp = (ctx.city && ctx.city.spawn) || { x: 0, z: 30 };
      if (ctx.player && ctx.player.position) ctx.player.position.set(sp.x, 0, sp.z);
      if (ctx.player && ctx.player.object3D) ctx.player.object3D.position.set(sp.x, 0, sp.z);
    } catch (_) {}

    // ── Build the overlay DOM ──
    const root = document.createElement('div');
    root.id = 'xto-intro';
    root.innerHTML = `
      <div class="swirl a"></div><div class="swirl b"></div>
      <div class="stage">
        <div class="art"></div>
        <div class="who">
          <img src="${hero.portrait}" alt="${hero.name}"
               onerror="this.src='/assets/agents/${chosen === 'ZEROX' ? 'SHADDAI' : chosen}-portrait.png'"/>
          <div><div class="nm">${hero.name}</div><div class="ep">${hero.epithet}</div></div>
        </div>
        <div class="script"><div class="beatT"></div><div class="beatS"></div></div>
        <div class="foot">
          <div class="dots">${beats.map(() => '<i></i>').join('')}</div>
          <button class="skip">skip ▸</button>
          <button class="rise">▶ Rise</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('show'));

    mountArt(root.querySelector('.art'));

    const beatT = root.querySelector('.beatT');
    const beatS = root.querySelector('.beatS');
    const dots = Array.from(root.querySelectorAll('.dots i'));
    const riseBtn = root.querySelector('.rise');
    const skipBtn = root.querySelector('.skip');

    let bi = -1;        // current beat index
    let typing = null;  // active typewriter timer
    let done = false;   // intro dismissed

    function stopType() { if (typing) { clearInterval(typing); typing = null; } }

    function showBeat(i) {
      stopType();
      bi = i;
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      const b = beats[i];
      beatT.textContent = b.t;
      beatT.style.animation = 'none'; void beatT.offsetWidth; beatT.style.animation = '';
      // typewriter the sentence
      let n = 0;
      beatS.innerHTML = '<span class="txt"></span><span class="car">▍</span>';
      const txt = beatS.querySelector('.txt');
      const car = beatS.querySelector('.car');
      typing = setInterval(() => {
        n++;
        txt.textContent = b.s.slice(0, n);
        if (n >= b.s.length) { stopType(); car.remove(); if (i === beats.length - 1) armRise(); }
      }, 18);
    }

    function armRise() { riseBtn.classList.add('ready'); }

    // Advance on click anywhere on the stage (or wait, then auto-advance).
    let autoTimer = null;
    function next() {
      if (done) return;
      // if still typing, finish the line instantly first
      if (typing) {
        stopType();
        beatS.innerHTML = beats[bi].s;
        if (bi === beats.length - 1) armRise();
        return;
      }
      if (bi < beats.length - 1) { showBeat(bi + 1); scheduleAuto(); }
    }
    function scheduleAuto() {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => { if (bi < beats.length - 1) next(); }, 4200);
    }

    root.querySelector('.stage').addEventListener('click', (e) => {
      if (e.target === riseBtn || e.target === skipBtn) return;
      next();
    });

    // ── Transition: fade out, un-pause, hand control to the player ──
    function rise() {
      if (done) return; done = true;
      stopType(); clearTimeout(autoTimer);
      root.classList.remove('show'); root.classList.add('hide');
      setTimeout(() => { try { root.remove(); } catch (_) {} }, 650);
      // ensure hero is at spawn, then release the world
      try {
        const sp = (ctx.city && ctx.city.spawn) || { x: 0, z: 30 };
        if (ctx.player && ctx.player.position) ctx.player.position.set(sp.x, 0, sp.z);
        if (ctx.player && ctx.player.object3D) ctx.player.object3D.position.set(sp.x, 0, sp.z);
      } catch (_) {}
      ctx.flags.paused = false;               // <-- 3D loop resumes; player has control
      showQuest('Step outside · find SHADDAI');
    }

    riseBtn.addEventListener('click', rise);
    skipBtn.addEventListener('click', rise);

    // start the sequence
    showBeat(0); scheduleAuto();

    // ── QUEST OBJECTIVE HUD LINE ──────────────────────────────────────────
    const quest = document.createElement('div');
    quest.id = 'xto-quest';
    quest.className = 'panel';
    quest.innerHTML = `<span class="swz"></span><div><div class="lbl">Objective</div><b>—</b></div>`;
    const questText = quest.querySelector('b');
    (ctx.hud || document.body).appendChild(quest);

    function showQuest(text) { questText.textContent = text; quest.classList.add('show'); }
    function setQuest(text) { questText.textContent = text; }
    // Small API so later modules can push the story forward.
    function advanceQuest(text) { setQuest(text); }

    // ── update() — cheap neon pulse on the quest line only ──
    let pulse = 0;
    return {
      update(dt, t) {
        pulse += dt;
        if (quest.classList.contains('show')) {
          const a = 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.0));
          quest.style.boxShadow = `0 0 ${18 + 14 * a}px rgba(39,224,255,${0.18 + 0.18 * a})`;
        }
      },
      // exposed story API
      showQuest, setQuest, advanceQuest,
      rise, isDone: () => done
    };
  }

  // Expose the contract.
  window.XTO_Story = { build };

  // ── SELF-BOOTSTRAP ────────────────────────────────────────────────────────
  // The shell does not list XTO_Story in its MODULES, and this file may not edit
  // the shell.  So wait until window.XTO + player + city exist, then build once.
  let booted = false;
  function tryBoot() {
    if (booted) return;
    const x = window.XTO;
    if (!x) return;
    // wait for player + city (city.spawn) so the transition can place the hero
    if (!x.player || !(x.city && x.city.spawn)) return;
    booted = true;
    try {
      const api = build(x);
      x.XTO_Story = api;
      // register update() with the shell's loop if it exposes a way; otherwise
      // drive it from our own rAF (guarded so we never double-run vs the shell).
      if (api && typeof api.update === 'function') {
        let last = performance.now();
        (function selfLoop(now) {
          const dt = Math.min(0.05, (now - last) / 1000); last = now;
          if (!x.flags.paused) { try { api.update(dt, x.time ? x.time.t : now / 1000); } catch (_) {} }
          requestAnimationFrame(selfLoop);
        })(last);
      }
    } catch (e) { try { window.__xtoErr && window.__xtoErr('story: ' + (e && e.message)); } catch (_) {} }
  }
  // poll briefly until the world is ready (cheap; stops once booted)
  const iv = setInterval(() => { tryBoot(); if (booted) clearInterval(iv); }, 120);
  // also try on next frames in case everything is already up
  requestAnimationFrame(function r() { tryBoot(); if (!booted) requestAnimationFrame(r); });
})();
