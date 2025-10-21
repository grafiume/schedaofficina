
/*!
 * note-supabase-hook.v1.js
 * Aggiunge input "Note (match esatto)" nei Filtri tecnici e INIETTA
 * automaticamente un filtro Supabase `.ilike('note', '<val>')` in TUTTE
 * le query `.select()` verso le tabelle `records` / `records_view` quando attivo.
 *
 * -> Non tocca l'HTML della tabella e non riscrive il render: il filtro avviene lato server.
 */
(function(){
  const LOG = "[note-hook]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const norm = v => String(v||"").toLowerCase().trim().replace(/\s+/g, " ");

  // 1) Campo UI "Note (match esatto)"
  function findFiltersBox(){
    const all = $$('div,section,form'); // robusto
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
      window.__NOTE_EQ__ = val; // usata dall'hook
      console.log(LOG, val ? `attivo (=${val})` : "disattivato");
      // Trigghera una ricerca se esiste il bottone Cerca o Applica
      const btnSearch = document.getElementById('btnDoSearch') || btnApply;
      if (btnSearch) btnSearch.click();
    };

    $("#filterNoteExact").addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ e.preventDefault(); apply(); }});
    btnApply && btnApply.addEventListener('click', apply);
    btnReset && btnReset.addEventListener('click', () => { const ip=$("#filterNoteExact"); if(ip) ip.value=""; window.__NOTE_EQ__=""; });
    return true;
  }

  // 2) Hook per Supabase .from().select() → aggiunge .ilike('note', v) se attivo
  function installSupabaseHook(){
    if (!window.supabase || !window.supabase.from || window.__NOTE_HOOK_INSTALLED__) {
      return !!window.supabase;
    }
    const originalFrom = window.supabase.from.bind(window.supabase);
    window.supabase.from = function(table){
      const qb = originalFrom(table);
      if (!/^(records|records_view)$/i.test(table||"")) return qb;

      // wrappa select
      const originalSelect = qb.select?.bind(qb);
      if (!originalSelect) return qb;

      qb.select = function(){
        const q = originalSelect.apply(this, arguments);
        try {
          const note = norm(window.__NOTE_EQ__ || "");
          if (note) {
            // ILIKE senza % => match esatto case-insensitive
            q.ilike && q.ilike('note', note);
          }
        } catch(e){ console.warn(LOG, "hook ilike note fallito:", e); }
        return q;
      };
      return qb;
    };
    window.__NOTE_HOOK_INSTALLED__ = true;
    console.log(LOG, "hook su supabase.from() installato");
    return true;
  }

  function init(){
    ensureNoteInput();
    installSupabaseHook();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else
    init();
})();
