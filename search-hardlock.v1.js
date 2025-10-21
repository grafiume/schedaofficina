
/*!
 * search-hardlock.v1.js
 * (retry writing file)
 */
(function(){
  const LOG = "[search-hardlock]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  const State = { active:false, timers:new Set(), observers:new Set(), realtime:new Set(), inFlight:0 };

  (function hijackTimers(){
    if (window.__SEARCH_HARDLOCK_TIMERS__) return;
    const _setInterval = window.setInterval;
    const _setTimeout  = window.setTimeout;
    const _clearInterval = window.clearInterval;
    const _clearTimeout  = window.clearTimeout;
    window.setInterval = function(fn, ms, ...rest){
      const id = _setInterval(fn, ms, ...rest);
      if (State.active) State.timers.add({ type:'int', id });
      return id;
    };
    window.setTimeout = function(fn, ms, ...rest){
      const id = _setTimeout(fn, ms, ...rest);
      if (State.active) State.timers.add({ type:'out', id });
      return id;
    };
    window.clearInterval = function(id){
      _clearInterval(id);
      for (const t of State.timers){ if (t.type==='int' && t.id===id) State.timers.delete(t); }
    };
    window.clearTimeout = function(id){
      _clearTimeout(id);
      for (const t of State.timers){ if (t.type==='out' && t.id===id) State.timers.delete(t); }
    };
    window.__SEARCH_HARDLOCK_TIMERS__ = true;
  })();

  function disconnectObservers(){
    try {
      const body = document.querySelector('body');
      if (!body) return;
      const key = '__moList__';
      if (!body[key]) return;
      const list = body[key];
      if (Array.isArray(list)) {
        list.forEach(mo => { try{ mo.disconnect(); }catch(e){} State.observers.add(mo); });
      }
    } catch(e){}
  }

  function suspendRealtime(){
    try{
      const sb = window.supabase || window.__supabaseClient || window.sb;
      if (!sb) return;
      if (sb.removeAllChannels) {
        sb.removeAllChannels();
        State.realtime.add('removed-all');
        console.log(LOG, "Realtime rimosso durante la ricerca");
      }
    }catch(e){}
  }

  function lockSearch(){
    if (State.active) return;
    State.active = true;
    State.inFlight = 0;
    disconnectObservers();
    suspendRealtime();
    console.log(LOG, "LOCK attivo");
  }
  function unlockSearch(){
    if (!State.active) return;
    State.active = false;
    for (const t of Array.from(State.timers)){
      try{ (t.type==='int' ? clearInterval : clearTimeout)(t.id); }catch(e){}
      State.timers.delete(t);
    }
    console.log(LOG, "LOCK rilasciato");
  }

  (function hookFetchCount(){
    if (window.__SEARCH_HARDLOCK_FETCH__) return;
    const ORIG = window.fetch.bind(window);
    window.fetch = async function(input, init){
      let url = typeof input === 'string' ? input : (input?.url || '');
      const method = (init?.method || (typeof input!=='string' ? input?.method : '') || 'GET').toUpperCase();
      const isRecords = method==='GET' && /\/rest\/v1\/(records|records_view)\b/i.test(url) && /[?&]select=/.test(url);
      if (isRecords && State.active) {
        State.inFlight++;
        try {
          const res = await ORIG.apply(this, arguments);
          return new Response(res.body, res);
        } finally {
          State.inFlight--;
          setTimeout(() => {
            if (State.active && State.inFlight<=0) {
              const rows = document.querySelectorAll('#tableResults tbody tr');
              if (rows.length >= 0) unlockSearch();
            }
          }, 50);
        }
      }
      return ORIG.apply(this, arguments);
    };
    window.__SEARCH_HARDLOCK_FETCH__ = true;
  })();

  (function hookSearchButton(){
    const btn = $("#btnDoSearch") || $$('button').find(b => /cerca/i.test((b.textContent||"").toLowerCase()));
    if (!btn || btn.__SEARCH_LOCKED__) return;
    btn.__SEARCH_LOCKED__ = true;
    btn.addEventListener('click', ()=>{
      lockSearch();
      btn.disabled = true;
      setTimeout(()=>{ try{ btn.disabled = false; }catch(e){} }, 350);
    }, true);
    console.log(LOG, "agganciato bottone Cerca");
  })();

  window.__searchLock = { lock: lockSearch, unlock: unlockSearch, state: State };
  console.log(LOG, "pronto");
})();
