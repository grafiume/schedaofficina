
/*!
 * notes-exact-addon.v2.js
 * Aggiunge la ricerca "Note (match esatto)" SENZA toccare la ricerca generale.
 * - Non richiede modifiche all'HTML (inietta un input accanto ai filtri tecnici).
 * - Se il campo Note è valorizzato → usa Supabase con eq('note', valore).
 * - Se il campo Note è vuoto → lascia lavorare la tua lista() originale.
 * - Usa il renderer esistente (renderPager/drawListPage).
 */
(function(){
  const LOG = "[notes-addon]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // usa window.sb (supabase-client.js) o fallback window.supabase
  const sb = (window.sb || window.supabase);
  if (!sb || !sb.from) { console.warn(LOG, "Supabase client non trovato"); return; }

  function ensureNoteInput(){
    if ($("#noteExact")) return true;

    // Trova un contenitore filtri: priorità #page-search, altrimenti qualsiasi box con testo "Filtri tecnici"
    let box = $("#page-search");
    if (!box) {
      const all = $$("div,section,form");
      box = all.find(el => /Filtri tecnici/i.test(el.textContent||"")) || document.body;
    }

    // Cerca una row di input, altrimenti usa box
    const row = box.querySelector(".row") || box;

    const col = document.createElement("div");
    col.className = "col-md-3 my-1";
    col.innerHTML = `
      <input id="noteExact" class="form-control" placeholder="Note (match esatto)">
    `;
    row.appendChild(col);

    // Tasto invio → click su Cerca (se esiste)
    $("#noteExact")?.addEventListener("keydown", (e)=>{
      if (e.key === "Enter") { e.preventDefault(); $("#btnDoSearch")?.click(); }
    });

    console.log(LOG, "Campo Note (match esatto) aggiunto");
    return true;
  }

  async function searchByNoteExact(noteVal){
    // Query deterministica su Supabase, ordina come fa la tua lista
    let q = sb.from("records").select("*")
      .eq("note", noteVal)
      .order("dataArrivo", { ascending:false })
      .order("created_at", { ascending:false })
      .order("id", { ascending:true });

    const { data, error } = await q;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  // Wrap non invasivo di lista(): solo quando c'è il valore in Note
  function installWrapper(){
    const orig = window.lista;
    if (!orig || orig.__wrappedByNotesExact) {
      // Se non esiste ancora lista, installiamo quando DOM è pronto/handler Cerca presente
      console.warn(LOG, "lista() non trovata ora; riproverò al primo click di Cerca");
    }

    const btn = $("#btnDoSearch");
    if (!btn) {
      console.warn(LOG, "Bottone Cerca non trovato; riprovo al DOMContentLoaded");
      return;
    }

    // Rimuovi eventuali listener duplicati aggiungendo un "guard"
    if (btn.__NOTES_HOOKED__) return;
    btn.__NOTES_HOOKED__ = true;

    btn.addEventListener("click", async (ev) => {
      try {
        const noteInput = $("#noteExact");
        const noteVal = (noteInput?.value || "").trim();

        if (!noteVal) {
          // Nessun valore → lascia lavorare la ricerca generale originale
          if (typeof window.lista === "function") return; // l'handler originale proseguirà
          return;
        }

        // Con valore → INTERCETTA e fai SOLO ricerca su Note = valore
        ev.preventDefault();
        ev.stopPropagation();

        console.log(LOG, `Ricerca Note="` + noteVal + `"`);

        // Disattiva eventuali realtime
        try { if (sb.removeAllChannels) sb.removeAllChannels(); } catch(e){}

        const rows = await searchByNoteExact(noteVal);

        // Render con i tuoi metodi
        window.searchRows = rows;
        window.page = 1;
        if (typeof window.renderPager === 'function') window.renderPager(rows.length);
        if (typeof window.drawListPage === 'function') await window.drawListPage();

        console.log(LOG, `risultati: ${rows.length}`);
      } catch (err){
        console.error(LOG, err);
        alert("Errore ricerca Note: " + (err.message || err));
      }
    }, true);

    if (typeof orig === "function") orig.__wrappedByNotesExact = true;
    console.log(LOG, "Wrapper su lista()/Cerca attivo — solo per Note valorizzato");
  }

  function attachReset(){
    // Aggancia #btnClearFilter se esiste, altrimenti non crea nulla (non tocchiamo UI esistente)
    const btn = $("#btnClearFilter");
    if (!btn) return;
    btn.addEventListener("click", ()=>{
      const el = $("#noteExact");
      if (el) el.value = "";
      console.log(LOG, "Reset Note eseguito (campo pulito)");
    });
  }

  function init(){
    ensureNoteInput();
    installWrapper();
    attachReset();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
