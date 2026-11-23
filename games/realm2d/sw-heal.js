/* SELF-HEAL: an older cache-first service worker used to cache the dashboard, so pre-fix
   builds (old image launcher, white chat, stale images/assets) kept getting served stale.
   Kill any registered SW + purge all caches once per session, then reload once to pull
   fresh assets. Shared by every top-level page (see public/index.html for the original
   inline copy this was extracted from). */
(function(){
  if (!('serviceWorker' in navigator)) return;
  try { if (sessionStorage.getItem('shd_sw_healed')) return; } catch(e){ return; }
  navigator.serviceWorker.getRegistrations().then(function(regs){
    var had = regs && regs.length;
    Promise.all((regs||[]).map(function(r){ return r.unregister().catch(function(){}); }))
      .then(function(){ return (window.caches ? caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); }) : null); })
      .then(function(){ try { sessionStorage.setItem('shd_sw_healed','1'); } catch(e){}
        if (had) location.reload(); })
      .catch(function(){ try { sessionStorage.setItem('shd_sw_healed','1'); } catch(e){} });
  }).catch(function(){});
})();
