
/*!
 * table-inline-edit-addon.v1.js
 * Inline edit per tabella Bootstrap (id: #tableResults) senza modificare HTML.
 * - Doppio click su celle editabili (tutte tranne Foto/Azioni) → contenteditable.
 * - Inietta "Salva" / "Annulla" nella cella Azioni della riga.
 * - Conversione date (gg/mm/aaaa ↔︎ YYYY-MM-DD).
 * - Update su Supabase (tabella: 'records') usando ID riga autodetect.
 *
 * Rilevamento ID riga: data-id | data-record-id | id (uuid) | dai pulsanti "Apri/Modifica" (href/data-id).
 */
(function(){
  const LOG = "[inline-edit]";
  const $ = (s, ctx=document)=>ctx.querySelector(s);
  const $$ = (s, ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  // ===== Supabase client resolver (come negli altri addon) =====
  function resolveSupabase() {
    try {
      if (window.supabase?.from) return window.supabase;
      if (typeof window.getSupabase === "function") { const c = window.getSupabase(); if (c?.from) return c; }
      if (window.sb?.from) return window.sb;
      if (window.__supabaseClient?.from) return window.__supabaseClient;
      if (window.__supabase?.from) return window.__supabase;
    } catch(e){}
    return null;
  }
  const sb = resolveSupabase();
  if (!sb) { console.warn(LOG, "Client Supabase non trovato. L'edit salterà il salvataggio."); }

  // ===== Configurazione mapping Tabella → DB =====
  // Campi visibili nella tabella (dedotti dai tuoi header):
  // foto, descrizioneModello, cliente, telefono, dataArrivo, dataAccettazione, dataScadenza, stato, azioni
  // Mappa verso colonne DB reali
  const MAP_DB = {
    descrizioneModello: "descrizione",
    cliente: "cliente",
    telefono: "telefono",
    dataArrivo: "dataArrivo",
    dataAccettazione: "dataAccettazione",
    dataScadenza: "dataScadenza",
    stato: "statoPratica"
    // foto/azioni NON salvati
  };

  // Quali celle sono editabili
  const EDITABLE_FIELDS = new Set(["descrizioneModello","cliente","telefono","dataArrivo","dataAccettazione","dataScadenza","stato"]);

  // ===== Util =====
  function parseITDate(s){
    // accetta "dd/mm/yyyy"
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [_, d, mo, y] = m;
    const dd = d.padStart(2,'0'), mm = mo.padStart(2,'0');
    return `${y}-${mm}-${dd}`;
  }
  function fmtIT(d){
    try {
      if (!d) return "";
      const date = (typeof d === "string") ? new Date(d) : d;
      if (isNaN(date)) return String(d);
      const dd = String(date.getDate()).padStart(2,"0");
      const mm = String(date.getMonth()+1).padStart(2,"0");
      const yy = date.getFullYear();
      return `${dd}/${mm}/${yy}`;
    } catch(e){ return String(d||""); }
  }
  function isUuid(s){ return UUID_RE.test(String(s||"")); }

  function getRowId(tr){
    if (!tr) return "";
    // preferisci dataset
    const ds = tr.dataset || {};
    const cands = [
      ds.id, ds.recordId, ds.recordid, ds.uuid, ds.pk,
      tr.getAttribute("data-id"), tr.getAttribute("data-record-id"), tr.id
    ].filter(Boolean);
    for (const c of cands){ if (isUuid(c)) return c.match(UUID_RE)[0]; }

    // prova da pulsanti link nella riga
    const links = $$("a,button", tr);
    for (const a of links){
      const did = a.getAttribute("data-id") || a.getAttribute("data-record-id");
      if (isUuid(did)) return did.match(UUID_RE)[0];
      const href = a.getAttribute("href") || "";
      if (UUID_RE.test(href)) return href.match(UUID_RE)[0];
      const onclk = a.getAttribute("onclick") || "";
      if (UUID_RE.test(onclk)) return onclk.match(UUID_RE)[0];
    }
    return "";
  }

  function findHeaders(tbl){
    return [...tbl.querySelectorAll("thead th")].map(th => th.textContent.trim());
  }

  function buildFieldIndex(tbl){
    // deduce field key dal testo header come nello snippet precedente
    const headers = findHeaders(tbl);
    return headers.map(label => label.toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu,' ')
      .trim()
      .replace(/\s+([a-z])/g, (_,c)=>c.toUpperCase())
      .replace(/\s+/g,'')
    );
  }

  // Inietta pulsanti Salva/Annulla nella cella Azioni (senza rompere i tuoi)
  function ensureRowButtons(tr){
    let td = tr.lastElementChild; // supponiamo 'Azioni' ultima colonna
    if (!td) return null;
    let wrap = td.querySelector(".ie-actions");
    if (!wrap){
      wrap = document.createElement("div");
      wrap.className = "ie-actions d-flex gap-1 flex-wrap mt-1";
      td.appendChild(wrap);
    }
    let btnSave = wrap.querySelector(".ie-save");
    let btnCancel = wrap.querySelector(".ie-cancel");
    if (!btnSave){
      btnSave = document.createElement("button");
      btnSave.type = "button";
      btnSave.className = "btn btn-sm btn-success ie-save d-none";
      btnSave.textContent = "Salva";
      wrap.appendChild(btnSave);
    }
    if (!btnCancel){
      btnCancel = document.createElement("button");
      btnCancel.type = "button";
      btnCancel.className = "btn btn-sm btn-outline-secondary ie-cancel d-none";
      btnCancel.textContent = "Annulla";
      wrap.appendChild(btnCancel);
    }
    return { btnSave, btnCancel, wrap };
  }

  function enterEdit(tr, fieldIndex){
    if (tr.classList.contains("editing")) return;
    tr.classList.add("editing");
    tr.dataset._snapshot = tr.innerHTML; // snapshot HTML, semplice ma efficace

    const cells = [...tr.children];
    for (let i=0;i<cells.length;i++){
      const key = fieldIndex[i];
      if (!EDITABLE_FIELDS.has(key)) continue;
      const td = cells[i];
      td.setAttribute("contenteditable","true");
      td.classList.add("border","border-warning","rounded");
      // Se è colonna stato con opzioni, lasciamo testo libero per ora
    }
    const {btnSave, btnCancel} = ensureRowButtons(tr);
    if (btnSave && btnCancel){
      btnSave.classList.remove("d-none");
      btnCancel.classList.remove("d-none");
      btnCancel.onclick = () => exitEdit(tr, true);
      btnSave.onclick = () => saveRow(tr, fieldIndex);
    }
  }

  function exitEdit(tr, cancel=false){
    if (!tr.classList.contains("editing")) return;
    const cells = [...tr.children];
    for (const td of cells){
      td.removeAttribute("contenteditable");
      td.classList.remove("border","border-warning","rounded");
    }
    const actions = tr.querySelector(".ie-actions");
    if (actions){
      const s = actions.querySelector(".ie-save"); if (s) s.classList.add("d-none");
      const c = actions.querySelector(".ie-cancel"); if (c) c.classList.add("d-none");
    }
    if (cancel && tr.dataset._snapshot){
      tr.innerHTML = tr.dataset._snapshot;
    }
    delete tr.dataset._snapshot;
    tr.classList.remove("editing");
  }

  function getCellText(td){
    return (td.textContent || "").trim().replace(/\s+/g," ");
  }

  function collectChanges(tr, fieldIndex){
    const cells = [...tr.children];
    const changes = {};
    for (let i=0;i<cells.length;i++){
      const key = fieldIndex[i];
      if (!EDITABLE_FIELDS.has(key)) continue;
      const dbKey = MAP_DB[key];
      if (!dbKey) continue;
      let val = getCellText(cells[i]);

      // Conversioni
      if (/^data(A|a)/.test(key)){ // date
        const iso = parseITDate(val);
        if (iso) val = iso;
        else if (!val) val = null;
      }
      if (key === "stato"){
        // normalizza spazi e capitalizzazione minima
        val = val.replace(/\s+/g," ").trim();
      }
      changes[dbKey] = val;
    }
    return changes;
  }

  async function saveRow(tr, fieldIndex){
    const id = getRowId(tr);
    if (!id){ alert("Impossibile determinare l'ID della riga."); return; }

    const payload = collectChanges(tr, fieldIndex);
    if (!Object.keys(payload).length){ exitEdit(tr); return; }

    try{
      if (!sb){
        console.warn(LOG, "Nessun Supabase client: salto update. Payload:", payload);
        exitEdit(tr);
        return;
      }
      const { data, error } = await sb.from("records").update(payload).eq("id", id).select();
      if (error) throw error;
      // Dopo salvataggio, riconversione date a IT per display
      const cells = [...tr.children];
      for (let i=0;i<cells.length;i++){
        const key = fieldIndex[i];
        if (!EDITABLE_FIELDS.has(key)) continue;
        if (/^data(A|a)/.test(key)){
          const dbKey = MAP_DB[key];
          const newVal = (data && data[0] && data[0][dbKey]) || null;
          cells[i].textContent = fmtIT(newVal);
        }
      }
      exitEdit(tr);
    }catch(e){
      console.error(LOG, "Errore update:", e);
      alert("Errore durante il salvataggio: " + (e?.message || e));
    }
  }

  function makeEditable(){
    const tbl = document.getElementById("tableResults");
    if (!tbl){ console.warn(LOG, "#tableResults non trovato"); return; }

    const fieldIndex = buildFieldIndex(tbl);

    // doppio click per entrare in edit
    tbl.addEventListener("dblclick", (ev)=>{
      const td = ev.target.closest("td");
      if (!td) return;
      const tr = td.parentElement;
      const col = [...tr.children].indexOf(td);
      const key = fieldIndex[col];
      if (!EDITABLE_FIELDS.has(key)) return; // non editabili: foto/azioni
      enterEdit(tr, fieldIndex);
    });

    // scorciatoie: ESC annulla, CMD/CTRL+S salva
    tbl.addEventListener("keydown", (e)=>{
      const tr = e.target.closest && e.target.closest("tr.editing");
      if (!tr) return;
      if (e.key === "Escape"){ e.preventDefault(); exitEdit(tr, true); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="s"){
        e.preventDefault();
        saveRow(tr, fieldIndex);
      }
    });

    console.log(LOG, "Inline edit attivo su #tableResults");
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", makeEditable);
  } else {
    makeEditable();
  }
})();
