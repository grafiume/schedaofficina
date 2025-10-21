
/*!
 * note-exact-hook.v3.js
 * Enforce NOTE exact-match filter everywhere:
 *  - UI field "Note (match esatto)"
 *  - Supabase .from(...).select(): inject .ilike('note', <val>) when table = records/records_view
 *  - fetch to /rest/v1/{records|records_view}: append &note=ilike.<val>
 *  - RPC search_records_exact_all* : post-filter client-side by note exact (case-insensitive)
 */
(function(){
  const LOG = "[note-exact]";
  const norm = v => String(v||"").toLowerCase().trim().replace(/\s+/g, " ");
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // ---------- UI ----------
  function findFiltersBox(){
    const all = $$('div,section,form');
    return all.find(el => /Filtri tecnici\s*\(singoli\)/i.test(el.textContent||""));
  }
  function ensureNoteInput(){
    if ($("#filterNoteExact")) return true;
    const box = findFiltersBox();
    if (!box) return false;

    const btnApply = Array.from(box.querySelectorAll('button')).find(b => /applica\s*filtri/i.test(b.textContent||""));
    const btnReset = Array.from(box.querySelectorAll('button')).find(b => /reset/i.test(b.textContent||""));

    const wrap = document.createElement('div');
    wrap.className = 'col-md-3';
    wrap.innerHTML = `<input id="filterNoteExact" class="form-control" placeholder="Note (match esatto)">`;

    const anchor = box.querySelector('input.form-control, select.form-select') || btnApply;
    (anchor?.parentElement || box).insertAdjacentElement('beforebegin', wrap);

    const apply = ()=>{
      const val = norm($("#filterNoteExact")?.value || "");
      window.__NOTE_EQ__ = val;
      console.log(LOG, val ? `attivo (=${val})` : "disattivato");
      const btnSearch = document.getElementById('btnDoSearch') || btnApply;
      if (btnSearch) btnSearch.click();
    };
    $("#filterNoteExact").addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ e.preventDefault(); apply(); }});
    btnApply && btnApply.addEventListener('click', apply);
    btnReset && btnReset.addEventListener('click', () => { const ip=$("#filterNoteExact"); if(ip) ip.value=""; window.__NOTE_EQ__=""; });
    return true;
  }

  // ---------- Hook: supabase.from(...).select() ----------
  function installFromHook(){
    const sb = window.supabase;
    if (!sb || !sb.from || window.__NOTE_FROM_HOOK__) return !!sb;
    const originalFrom = sb.from.bind(sb);
    sb.from = function(table){
      const qb = originalFrom(table);
      if (!/^(records|records_view)$/i.test(table||"")) return qb;
      const originalSelect = qb.select?.bind(qb);
      if (!originalSelect) return qb;
      qb.select = function(){
        const q = originalSelect.apply(this, arguments);
        try {
          const note = norm(window.__NOTE_EQ__ || "");
          if (note && q.ilike) q.ilike('note', note); // exact case-insensitive (no %)
        } catch(e){ console.warn(LOG, "from/select hook fail:", e); }
        return q;
      };
      return qb;
    };
    window.__NOTE_FROM_HOOK__ = true;
    console.log(LOG, "hook .from().select() installato");
    return true;
  }

  // ---------- Hook: fetch /rest/v1/{records|records_view} ----------
  function installFetchHook(){
    if (window.__NOTE_FETCH_HOOK__) return true;
    const ORIG = window.fetch.bind(window);
    window.fetch = function(input, init){
      try{
        let url = typeof input === 'string' ? input : (input?.url || '');
        const method = (init?.method || (typeof input!=='string' ? input?.method : '') || 'GET').toUpperCase();
        if (method === 'GET' && /\/rest\/v1\/(records|records_view)\b/i.test(url) && /[?&]select=/.test(url)){
          const note = norm(window.__NOTE_EQ__ || "");
          const hasNote = /[?&]note=/i.test(url);
          if (note && !hasNote){
            url += (url.includes('?') ? '&' : '?') + 'note=ilike.' + encodeURIComponent(note);
            arguments[0] = url;
          }
        }
      }catch(e){ console.warn(LOG, "fetch hook fail:", e); }
      return ORIG.apply(this, arguments);
    };
    window.__NOTE_FETCH_HOOK__ = true;
    console.log(LOG, "hook fetch REST installato");
    return true;
  }

  // ---------- Hook: supabase.rpc('search_records_exact_all*') ----------
  function installRPCHook(){
    const sb = window.supabase;
    if (!sb || !sb.rpc || window.__NOTE_RPC_HOOK__) return !!sb;
    const originalRPC = sb.rpc.bind(sb);
    sb.rpc = async function(fnName, params){
      const p = params || {};
      const res = await originalRPC(fnName, p);
      try{
        if (/^search_records_exact_all/i.test(fnName)){
          const note = norm(window.__NOTE_EQ__ || "");
          if (note && res?.data && Array.isArray(res.data)){
            res.data = res.data.filter(r => norm(r?.note) === note);
          }
        }
      }catch(e){ console.warn(LOG, "rpc hook post-filter fail:", e); }
      return res;
    };
    window.__NOTE_RPC_HOOK__ = true;
    console.log(LOG, "hook rpc() installato");
    return true;
  }

  function init(){
    ensureNoteInput();
    installFromHook();
    installFetchHook();
    installRPCHook();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else
    init();
})();
