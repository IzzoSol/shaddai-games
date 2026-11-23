/* mmo-client.js — REAL wiring between game.html and the standalone
   MMO backend (server/index.js, port 3001). This replaces reliance on
   auth.js/skills.js/market.js/buildings.js, which call a
   shaddai_bridge_call global that does not exist in this codebase and
   never actually reach the server — they are disconnected scaffold,
   not integration.

   Dev-only: the MMO server runs standalone on localhost:3001 and is
   not yet mounted into backend/server-production.js, so this client
   only works when that server is running locally alongside the main
   app. Production wiring (proxy route or merging into the main
   backend) is a separate follow-up.
*/
(function () {
  const API = 'http://localhost:3001';
  const CHAR_KEY = 'shd_mmo_char_id';

  // Identity the server understands: the dashboard stores the signed-in
  // user id as shd_uid / shd_player_code (same convention as
  // world-agents-ui.js). /agent/claim + /agent/forge-roster + /agent/bodies
  // are owner-scoped on this header (agentBodies uidOf); without it they
  // 401. Legacy characterId routes ignore it. Sent on every call so a
  // character spawned here is associated with the same uid /claim grants
  // the body to (agentBodies ensureChar).
  function uid() {
    try { return localStorage.getItem('shd_uid') || localStorage.getItem('shd_player_code') || ''; } catch (e) { return ''; }
  }

  async function call(method, path, body) {
    const opts = { method, headers: {} };
    const u = uid(); if (u) opts.headers['x-user-id'] = u;
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(API + path, opts);
    } catch (e) {
      throw new Error('MMO server unreachable at ' + API + ' (is `node index.js` running in server/?)');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  const GET = (path) => call('GET', path);
  const POST = (path, body) => call('POST', path, body);

  let charId = localStorage.getItem(CHAR_KEY);

  function showDeathOverlay(result) {
    const drops = Object.entries(result.dropped || {}).map(([k, v]) => `${k} ×${v}`).join(', ') || 'nothing';
    const ov = document.createElement('div');
    ov.style.cssText = `
      position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center;
      background:radial-gradient(circle at center, rgba(120,0,0,.55), rgba(10,0,0,.9));
      color:#fff; font:14px/1.5 system-ui,sans-serif; text-align:center;
    `;
    ov.innerHTML = `
      <div style="background:#1a0505;border:1px solid #5a1010;border-radius:12px;padding:24px 28px;max-width:320px">
        <div style="font-size:22px;font-weight:800;letter-spacing:1px;color:#ff5a5a;margin-bottom:10px">YOU DIED</div>
        ${result.dangerous
          ? `<div>Dropped: <b>${drops}</b></div><div style="margin-top:4px">Sparks lost: <b>${result.sparksLost || 0}</b></div>
             ${result.graveId ? `<div style="margin-top:10px;font-size:12px;opacity:.8">A grave holds your items for ${Math.round((result.graveExpiresInMs||0)/60000)} minutes — open the MMO panel's Grave tab to reclaim them.</div>` : ''}`
          : `<div style="opacity:.8">Safe death — nothing lost.</div>`}
        <button id="mmoRespawnBtn" style="margin-top:16px;padding:8px 18px;border:none;border-radius:8px;background:#00e5a0;color:#04121a;font-weight:700;cursor:pointer">Respawn</button>
      </div>
    `;
    document.body.appendChild(ov);
    ov.querySelector('#mmoRespawnBtn').onclick = () => ov.remove();
  }

  async function ensureCharacter() {
    if (charId) return charId;
    const r = await POST('/character/spawn');
    charId = r.characterId;
    localStorage.setItem(CHAR_KEY, charId);
    return charId;
  }

  const MMO = {
    api: { GET, POST },
    getCharacterId: () => charId,
    ensureCharacter,
    // ---- character ----
    state: () => GET('/character/state?characterId=' + charId),
    move: (dx, dy) => POST('/character/move', { characterId: charId, dx, dy }),
    shop: (itemId) => POST('/character/shop', { characterId: charId, itemId }),
    die: async (dangerous) => { const r = await POST('/character/die', { characterId: charId, dangerous: !!dangerous }); showDeathOverlay(r); return r; },
    venture: async () => { const r = await POST('/character/venture', { characterId: charId }); if (r.outcome === 'died') showDeathOverlay(r); return r; },
    graveList: () => GET('/character/grave/list?characterId=' + charId),
    graveRetrieve: (graveId) => POST('/character/grave/retrieve', { characterId: charId, graveId }),
    // ---- quests ----
    questList: () => GET('/quest/list'),
    questActive: () => GET('/quest/active?characterId=' + charId),
    questAccept: (questId) => POST('/quest/accepted', { questId, characterId: charId }),
    questProgress: (questId, amount) => POST('/quest/progress', { questId, characterId: charId, amount }),
    questComplete: (questId) => POST('/quest/complete', { questId, characterId: charId }),
    // ---- daily board ----
    dailyBoard: () => GET('/daily/board?characterId=' + charId),
    dailyAccept: (questId) => POST('/daily/accept', { characterId: charId, questId }),
    dailyProgress: (questId, amount) => POST('/daily/progress', { characterId: charId, questId, amount }),
    dailyClaim: (questId) => POST('/daily/claim', { characterId: charId, questId }),
    dailyDrop: (questId) => POST('/daily/drop', { characterId: charId, questId }),
    // ---- login bonus ----
    bonusState: () => GET('/bonus/state?characterId=' + charId),
    bonusClaim: () => POST('/bonus/claim', { characterId: charId }),
    // ---- housing plots ----
    plotList: () => GET('/plot/list?characterId=' + charId),
    plotBuy: (plotId) => POST('/plot/buy', { characterId: charId, plotId }),
    plotAssign: (plotId, agentId) => POST('/plot/assign', { characterId: charId, plotId, agentId }),
    plotCollect: (plotId) => POST('/plot/collect', { characterId: charId, plotId }),
    // ---- hired agents (labor board) ----
    agentRoster: () => GET('/agent/roster?characterId=' + charId),
    agentForgeRoster: () => GET('/agent/forge-roster'),
    agentBodies: () => GET('/agent/bodies'),
    agentHire: (role) => POST('/agent/hire', { characterId: charId, role }),
    // Station a forged operative via the body-grant path (POST /agent/claim),
    // NOT the legacy /agent/hire forged branch: forge-roster returns
    // Operative ids (op_...) while /hire looks ids up in custom_agents.json
    // (agent_...), so the old call 404'd on every operative id. /claim is
    // owner-checked and grants a body (grant_...) the shift/collect routes
    // understand; a second claim 409s "already stationed".
    agentStation: (operativeId) => POST('/agent/claim', { operativeId }),
    agentShift: (key) => POST('/agent/shift/' + key, { characterId: charId }),
    agentCollect: (key) => POST('/agent/collect/' + key, { characterId: charId }),
    // ---- player market ----
    marketListings: () => GET('/market/listings'),
    marketList: (itemName, price, duration) => POST('/market/listing', { ownerId: charId, itemName, price, duration }),
    marketBid: (listingId, amount) => POST('/market/bid', { listingId, bidderId: charId, amount }),
    marketComplete: (listingId, sellerId) => POST('/market/complete', { listingId, buyerId: charId, sellerId }),
    // ---- skills / Total Level ----
    skillsState: () => GET('/skills/state?characterId=' + charId),
    skillsTrain: (skill) => POST('/skills/train', { characterId: charId, skill })
  };
  window.MMO = MMO;

  /* ---------------- minimal panel UI ---------------- */
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (html != null) e.innerHTML = html;
    return e;
  }

  const TABS = ['Wilds', 'Skills', 'Quests', 'Daily', 'Bonus', 'Plot', 'Agents', 'Market', 'Grave'];
  const CANDIDATE_PLOT_IDS = ['plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5', 'plot-6'];
  let activeTab = 'Wilds';

  function buildPanel() {
    const panel = el('div', { id: 'mmoPanel' });
    // Bottom-right: the top-right corner is already crowded (dashboard/back
    // buttons at top:10-16, the mobile action-toggle at top:90, its cluster
    // below that), and this panel is player-opened, not a passive HUD, so it
    // doesn't need to live up there. Hotbar is bottom-center, D-pad is
    // bottom-left -- bottom-right on this page is genuinely free.
    panel.style.cssText = `
      position:fixed; bottom:80px; right:12px; width:min(320px,92vw); max-height:60vh;
      background:#0b0f14; border:1px solid #2a3542; border-radius:10px;
      color:#dfe8ee; font:12px/1.4 system-ui,sans-serif; z-index:9500;
      display:none; flex-direction:column; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.5);
    `;
    const head = el('div', {}, `<b>SHADDAI MMO</b> <span id="mmoCharTag" style="opacity:.6;font-size:10px"></span>`);
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#121a22;border-bottom:1px solid #2a3542';
    const closeBtn = el('span', { style: 'cursor:pointer;opacity:.7' }, '✕');
    closeBtn.onclick = () => { panel.style.display = 'none'; };
    head.appendChild(closeBtn);

    const hud = el('div', { id: 'mmoHud' });
    hud.style.cssText = 'padding:6px 10px;font-size:11px;opacity:.85;border-bottom:1px solid #2a3542;background:#0e151c';

    const tabsBar = el('div');
    tabsBar.style.cssText = 'display:flex;border-bottom:1px solid #2a3542;flex-wrap:wrap';
    TABS.forEach(t => {
      const b = el('div', {}, t);
      b.style.cssText = 'flex:1;text-align:center;padding:6px 0;cursor:pointer;font-size:11px;opacity:.7';
      b.onclick = () => { activeTab = t; renderTab(); };
      b._label = t;
      tabsBar.appendChild(b);
    });

    const body = el('div', { id: 'mmoBody' });
    body.style.cssText = 'padding:10px;overflow-y:auto;flex:1';

    panel.appendChild(head);
    panel.appendChild(hud);
    panel.appendChild(tabsBar);
    panel.appendChild(body);
    document.body.appendChild(panel);

    const toggle = el('div', {}, '⚔ MMO');
    toggle.id = 'mmoToggle';
    toggle.style.cssText = `
      position:fixed; bottom:80px; right:12px; z-index:9499;
      background:#00e5a0; color:#04121a; font:700 12px system-ui,sans-serif;
      padding:8px 12px; border-radius:8px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.4);
    `;
    toggle.onclick = async () => {
      const showing = panel.style.display === 'flex';
      if (showing) { panel.style.display = 'none'; return; }
      toggle.style.display = 'none';
      panel.style.display = 'flex';
      try {
        await ensureCharacter();
        document.getElementById('mmoCharTag').textContent = charId;
      } catch (e) {
        document.getElementById('mmoBody').textContent = e.message;
        return;
      }
      refreshHud();
      renderTab();
    };

    async function refreshHud() {
      try {
        const [{ character }, { totalLevel }] = await Promise.all([MMO.state(), MMO.skillsState()]);
        const inv = Object.entries(character.inventory || {}).map(([k, v]) => `${k}×${v}`).join(', ') || 'empty';
        hud.innerHTML = `⚡ ${character.currency?.sparks ?? 0} Sparks · TL ${totalLevel} · HP ${character.stats?.hp ?? '-'} · ${inv}`;
      } catch (e) { hud.textContent = e.message; }
    }
    // re-show the launcher pill when the panel closes
    const obs = new MutationObserver(() => { if (panel.style.display === 'none') toggle.style.display = 'block'; });
    obs.observe(panel, { attributes: true, attributeFilter: ['style'] });
    document.body.appendChild(toggle);

    function highlightTabs() {
      Array.from(tabsBar.children).forEach(b => {
        b.style.opacity = b._label === activeTab ? '1' : '.55';
        b.style.background = b._label === activeTab ? '#1a2530' : 'transparent';
      });
    }

    async function renderTab() {
      highlightTabs();
      body.innerHTML = 'Loading…';
      try {
        if (activeTab === 'Wilds') await renderWilds();
        else if (activeTab === 'Skills') await renderSkills();
        else if (activeTab === 'Quests') await renderQuests();
        else if (activeTab === 'Daily') await renderDaily();
        else if (activeTab === 'Bonus') await renderBonus();
        else if (activeTab === 'Plot') await renderPlot();
        else if (activeTab === 'Agents') await renderAgents();
        else if (activeTab === 'Market') await renderMarket();
        else if (activeTab === 'Grave') await renderGrave();
        refreshHud();
      } catch (e) {
        body.textContent = 'Error: ' + e.message;
      }
    }

    async function renderWilds() {
      const { character } = await MMO.state();
      body.innerHTML = `<div style="font-weight:600;margin-bottom:6px">The Wilderness</div>
        <div style="font-size:11px;opacity:.7;margin-bottom:10px">Costs 15 energy (you have ${character.stats?.energy ?? 0}). ~30% chance of a dangerous death — dropped items land in a reclaimable grave, Sparks loss is permanent. Otherwise you find loot.</div>`;
      const btn = el('button', {}, '⚔ Venture into the Wilds');
      btn.style.cssText = 'padding:8px 16px;border:none;border-radius:8px;cursor:pointer;background:#b33;color:#fff;font-weight:700';
      btn.onclick = async () => {
        try {
          const r = await MMO.venture();
          if (r.outcome === 'loot') alertInline(new Error('Found: ' + JSON.stringify(r.gained)));
          renderWilds();
        } catch (e) { alertInline(e); }
      };
      body.appendChild(btn);
    }

    async function renderSkills() {
      const r = await MMO.skillsState();
      body.innerHTML = `<div style="font-weight:600;margin-bottom:8px">Total Level: ${r.totalLevel} ${r.totalLevel >= 10 ? '(soft token gate active on trades)' : r.totalLevel >= 5 ? '(market unlocked)' : '(reach TL 5 for the market)'}</div>`;
      Object.entries(r.skills).forEach(([name, s]) => {
        const row = el('div', {}, `<div style="font-weight:600">${name} — Lv ${s.level}</div>
          <div style="font-size:11px;opacity:.7">${s.xp} xp</div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const btn = el('button', {}, 'Train (+25xp)');
        btn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        btn.onclick = async () => { try { await MMO.skillsTrain(name); renderSkills(); } catch (e) { alertInline(e); } };
        row.appendChild(btn);
        body.appendChild(row);
      });
    }

    async function renderMarket() {
      const r = await MMO.marketListings();
      body.innerHTML = '';
      const sellRow = el('div', {}, `<div style="font-weight:600;margin-bottom:4px">List an item</div>`);
      sellRow.style.cssText = 'padding:8px;margin-bottom:8px;background:#121a22;border-radius:6px';
      const itemIn = el('input', { placeholder: 'item (e.g. ore)', style: 'width:36%;padding:4px;margin-right:4px;background:#0b0f14;color:#dfe8ee;border:1px solid #2a3542;border-radius:4px' });
      const priceIn = el('input', { placeholder: 'price', type: 'number', style: 'width:28%;padding:4px;margin-right:4px;background:#0b0f14;color:#dfe8ee;border:1px solid #2a3542;border-radius:4px' });
      const listBtn = el('button', {}, 'List');
      listBtn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
      listBtn.onclick = async () => {
        try { await MMO.marketList(itemIn.value.trim(), parseInt(priceIn.value, 10)); renderMarket(); }
        catch (e) { alertInline(e); }
      };
      sellRow.appendChild(itemIn); sellRow.appendChild(priceIn); sellRow.appendChild(listBtn);
      body.appendChild(sellRow);

      (r.listings || []).filter(l => l.active).forEach(l => {
        const mine = l.ownerId === charId;
        const row = el('div', {}, `<div style="font-weight:600">${l.itemName} — ${l.price}⚡</div>
          <div style="font-size:11px;opacity:.7">Seller: ${l.ownerId}${mine ? ' (you)' : ''}</div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        if (!mine) {
          const btn = el('button', {}, 'Buy now');
          btn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
          btn.onclick = async () => { try { await MMO.marketComplete(l.id, l.ownerId); renderMarket(); } catch (e) { alertInline(e); } };
          row.appendChild(btn);
        }
        body.appendChild(row);
      });
    }

    async function renderQuests() {
      const [{ quests: all }, { quests: active }] = await Promise.all([MMO.questList(), MMO.questActive()]);
      const activeIds = new Set(active.map(q => q.id));
      body.innerHTML = '';
      all.forEach(q => {
        const a = active.find(x => x.id === q.id);
        const row = el('div', {}, `
          <div style="font-weight:600">${q.title}</div>
          <div style="opacity:.7;font-size:11px">${q.description}</div>
          <div style="font-size:11px;margin:4px 0">Reward: ${q.rewardXP} XP · ${q.rewardSparks}⚡</div>
        `);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const btn = el('button');
        btn.style.cssText = 'width:100%;padding:6px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        if (a) {
          btn.textContent = `Progress ${a.progress}/${a.targetAmount} — add 1`;
          btn.onclick = async () => { await MMO.questProgress(q.id, 1); renderQuests(); };
        } else if (activeIds.has(q.id)) {
          btn.textContent = 'Active';
          btn.disabled = true;
        } else {
          btn.textContent = 'Accept';
          btn.onclick = async () => { await MMO.questAccept(q.id); renderQuests(); };
        }
        row.appendChild(btn);
        body.appendChild(row);
      });
    }

    async function renderDaily() {
      const r = await MMO.dailyBoard();
      body.innerHTML = '';
      (r.quests || []).forEach(q => {
        const row = el('div', {}, `<div style="font-weight:600">${q.name} <span style="opacity:.6;font-weight:400">(${q.progress}/${q.target})</span></div>
          <div style="font-size:11px;opacity:.7">${q.desc} · reward ${q.reward}⚡</div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const mkBtn = (label) => { const b = el('button', {}, label); b.style.cssText = 'margin-right:6px;margin-top:4px;padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700'; return b; };
        if (q.claimed) {
          row.appendChild(mkBtn('Claimed')).disabled = true;
        } else if (!q.accepted) {
          const b = mkBtn('Accept');
          b.onclick = async () => { try { await MMO.dailyAccept(q.id); renderDaily(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        } else if (q.progress < q.target) {
          const b = mkBtn('+1 progress');
          b.onclick = async () => { try { await MMO.dailyProgress(q.id, 1); renderDaily(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        } else {
          const b = mkBtn('Claim reward');
          b.onclick = async () => { try { await MMO.dailyClaim(q.id); renderDaily(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        }
        body.appendChild(row);
      });
      if (!body.children.length) body.textContent = 'No board data.';
    }

    async function renderBonus() {
      const r = await MMO.bonusState();
      body.innerHTML = '';
      const row = el('div', {}, `<div style="font-weight:600">Login streak: ${r.streak} day${r.streak === 1 ? '' : 's'}</div>
        <div style="font-size:11px;opacity:.7">Next claim: ${r.nextAmount}⚡</div>`);
      row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
      const btn = el('button', {}, r.claimedToday ? 'Claimed today' : 'Claim stipend');
      btn.disabled = r.claimedToday;
      btn.style.cssText = 'padding:6px 12px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
      btn.onclick = async () => { try { await MMO.bonusClaim(); renderBonus(); } catch (e) { alertInline(e); } };
      row.appendChild(btn);
      body.appendChild(row);
    }

    async function renderPlot() {
      const r = await MMO.plotList();
      const mine = r.plots || [];
      body.innerHTML = '';
      mine.forEach(p => {
        const row = el('div', {}, `<div style="font-weight:600">Your plot: ${p.id}</div>
          <div style="font-size:11px;opacity:.7">${p.agent ? 'Worked by ' + p.agent : 'No agent stationed'}</div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const btn = el('button', {}, p.agent ? 'Collect yield' : 'Assign scout to work it');
        btn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        btn.onclick = async () => {
          try {
            if (p.agent) { const c = await MMO.plotCollect(p.id); alertInline(new Error('Collected ' + c.yieldAmount + ' Sparks')); }
            else { await MMO.plotAssign(p.id, 'scout'); }
            renderPlot();
          } catch (e) { alertInline(e); }
        };
        row.appendChild(btn);
        body.appendChild(row);
      });
      const ownedIds = new Set(mine.map(p => p.id));
      const available = CANDIDATE_PLOT_IDS.filter(id => !ownedIds.has(id));
      if (available.length) {
        const buyRow = el('div', {}, `<div style="font-weight:600;margin-bottom:4px">Buy a plot (100⚡)</div>`);
        buyRow.style.cssText = 'padding:8px;background:#121a22;border-radius:6px';
        const sel = el('select');
        sel.style.cssText = 'padding:4px;margin-right:6px;background:#0b0f14;color:#dfe8ee;border:1px solid #2a3542;border-radius:4px';
        available.forEach(id => sel.appendChild(el('option', { value: id }, id)));
        const buyBtn = el('button', {}, 'Buy');
        buyBtn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        buyBtn.onclick = async () => { try { await MMO.plotBuy(sel.value); renderPlot(); } catch (e) { alertInline(e); } };
        buyRow.appendChild(sel); buyRow.appendChild(buyBtn);
        body.appendChild(buyRow);
      }
      if (!body.children.length) body.textContent = 'No plots left to buy.';
    }

    async function renderAgents() {
      const [r, forge, bodies] = await Promise.all([MMO.agentRoster(), MMO.agentForgeRoster(), MMO.agentBodies()]);
      body.innerHTML = '';
      const roster = r.roster || {};
      // Bodies granted via /claim are keyed by grantId, not by the legacy
      // roster — map operativeId -> grant so a stationed operative shows its
      // working row (shift/collect by grant id) instead of the Station button.
      const stationed = {};
      (bodies.bodies || []).forEach(g => { stationed[g.operativeId] = g; });
      const mkBtn = (label) => { const b = el('button', {}, label); b.style.cssText = 'margin-right:6px;margin-top:4px;padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700'; return b; };

      function renderWorkingRow(row, key, owned) {
        const working = Date.now() < owned.shiftEndAt;
        if (working) {
          const mins = Math.max(0, Math.round((owned.shiftEndAt - Date.now()) / 60000));
          row.appendChild(el('div', { style: 'font-size:11px;opacity:.7' }, `Lv ${owned.level} · Working — ${mins}m left`));
        } else if (owned.shiftEndAt > 0) {
          row.appendChild(el('div', { style: 'font-size:11px;opacity:.7;margin-bottom:2px' }, `Lv ${owned.level}`));
          const b = mkBtn('Collect');
          b.onclick = async () => { try { const c = await MMO.agentCollect(key); alertInline(new Error('Gained: ' + JSON.stringify(c.gained) + ' — now Lv ' + c.newLevel)); renderAgents(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        } else {
          row.appendChild(el('div', { style: 'font-size:11px;opacity:.7;margin-bottom:2px' }, `Lv ${owned.level}`));
          const b = mkBtn('Start shift');
          b.onclick = async () => { try { await MMO.agentShift(key); renderAgents(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        }
      }

      // base recruit roles
      const ROLES = Object.keys(r.roles || { gatherer: 1, merchant: 1, scout: 1, crafter: 1 });
      ROLES.forEach(role => {
        const owned = roster[role];
        const def = (r.roles || {})[role] || {};
        const row = el('div', {}, `<div style="font-weight:600">${def.name || role} <span style="opacity:.6;font-weight:400">(${def.cost}⚡)</span></div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        if (!owned) {
          const b = mkBtn('Hire');
          b.onclick = async () => { try { await MMO.agentHire(role); renderAgents(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        } else renderWorkingRow(row, role, owned);
        body.appendChild(row);
      });

      // real dashboard-forged agents you can station in the 2D realm
      body.appendChild(el('div', { style: 'font-weight:600;margin:10px 0 4px;opacity:.8' }, 'Your Forged Agents'));
      (forge.agents || []).forEach(fa => {
        const grant = stationed[fa.id];
        // Normalize a body grant to the working-row shape (shiftEndAt/level);
        // the row's shift/collect then run against the grant id. Legacy
        // roster entries (role names / agent_ ids) never match an operative
        // id, so the fallback is only a safety net.
        const owned = grant ? { shiftEndAt: (grant.workState && grant.workState.shiftEndAt) || 0, level: grant.level || 1 } : roster[fa.id];
        const row = el('div', {}, `<div style="font-weight:600">${fa.emoji || '🤖'} ${fa.name} <span style="opacity:.6;font-weight:400">(${fa.role})</span></div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        if (!owned) {
          const b = mkBtn('Station in world (free)');
          b.onclick = async () => { try { await MMO.agentStation(fa.id); renderAgents(); } catch (e) { alertInline(e); } };
          row.appendChild(b);
        } else renderWorkingRow(row, grant ? grant.grantId : fa.id, owned);
        body.appendChild(row);
      });
      if (!(forge.agents || []).length) body.appendChild(el('div', { style: 'font-size:11px;opacity:.6' }, 'No agents forged yet — create one on the dashboard\'s Forge tab.'));
    }

    async function renderGrave() {
      const r = await MMO.graveList();
      body.innerHTML = '';
      const testRow = el('div', {}, `<div style="font-size:11px;opacity:.6;margin-bottom:6px">No combat system exists yet to trigger this for real — test the death/grave flow directly:</div>`);
      const dieBtn = el('button', {}, '☠ Simulate wilderness death');
      dieBtn.style.cssText = 'padding:6px 12px;border:none;border-radius:6px;cursor:pointer;background:#b33;color:#fff;font-weight:700;margin-bottom:10px';
      dieBtn.onclick = async () => { try { await MMO.die(true); renderGrave(); } catch (e) { alertInline(e); } };
      testRow.appendChild(dieBtn);
      body.appendChild(testRow);
      (r.graves || []).forEach(g => {
        const mins = Math.max(0, Math.round((g.expiresAt - Date.now()) / 60000));
        const row = el('div', {}, `<div style="font-weight:600">Grave at (${g.location.x},${g.location.y})</div>
          <div style="font-size:11px;opacity:.7">${JSON.stringify(g.items)} · expires in ${mins}m</div>`);
        row.style.cssText = 'padding:8px;margin-bottom:6px;background:#121a22;border-radius:6px';
        const btn = el('button', {}, 'Retrieve');
        btn.style.cssText = 'padding:5px 10px;border:none;border-radius:6px;cursor:pointer;background:#00e5a0;color:#04121a;font-weight:700';
        btn.onclick = async () => { try { await MMO.graveRetrieve(g.id); renderGrave(); } catch (e) { alertInline(e); } };
        row.appendChild(btn);
        body.appendChild(row);
      });
      if (!body.children.length) body.textContent = 'No active graves.';
    }

    function alertInline(err) {
      const n = el('div', {}, err.message);
      n.style.cssText = 'position:fixed;top:130px;right:12px;background:#241;color:#dfe8ee;padding:8px 12px;border-radius:6px;z-index:9600;font:12px system-ui';
      document.body.appendChild(n);
      setTimeout(() => n.remove(), 2500);
    }
  }

  /* ---------------- day/night cycle ----------------
     Purely visual, no server round-trip: a full-screen tint synced to
     real UTC hour (the same "world clock" every player shares). Darkest
     at midnight UTC, fully clear at noon UTC. pointer-events:none so it
     never blocks clicks on the game underneath. */
  function installDayNight() {
    const overlay = document.createElement('div');
    overlay.id = 'mmoDayNight';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:3; pointer-events:none;
      transition:background-color 3s linear, opacity 3s linear;
    `;
    document.body.appendChild(overlay);
    function tick() {
      const hour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
      // 0 at noon (brightest), 1 at midnight (darkest) — smooth cosine curve
      const darkness = (1 - Math.cos((hour / 24) * Math.PI * 2)) / 2;
      overlay.style.backgroundColor = '#0a1030';
      overlay.style.opacity = (darkness * 0.55).toFixed(2);
    }
    tick();
    setInterval(tick, 60 * 1000);
  }
  // installDayNight() is NOT installed on game.html: the game runs its own day/night cycle (tod, T key)
  // and draws night lights after its tint — a second real-clock overlay darkened the world at in-game
  // noon and dimmed every light. Kept above for pages without their own cycle.

  // The panel only works while the dev MMO server (server/index.js :3001) is up — so the ⚔ MMO button
  // appears only when that server answers, instead of dangling in front of every player.
  function boot() {
    fetch(API + '/', { cache: 'no-store' }).then(function (r) { if (r.ok) buildPanel(); }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
