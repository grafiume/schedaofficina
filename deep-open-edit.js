// deep-open-edit.js
// Apre automaticamente la schermata "Modifica scheda" quando l'URL contiene ?edit=<ID> oppure ?id=<ID>.
// Esempio:
// https://grafiume.github.io/schedaofficina/index.html?edit=621e65f2-3ae9-4cdf-99c4-279b3066886b

(function () {
  function getTargetId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("edit") || params.get("id") || "";
  }

  const targetId = getTargetId();
  if (!targetId) return;

  function hasLoadedTarget() {
    try {
      return Array.isArray(window.state?.all) && window.state.all.some(function (r) {
        return String(r && r.id) === String(targetId);
      });
    } catch (_e) {
      return false;
    }
  }

  function isEditVisible() {
    const editPage = document.getElementById("page-edit");
    return !!editPage && !editPage.classList.contains("d-none");
  }

  function tryOpenEdit() {
    try {
      // openEdit cerca il record dentro window.state.all: se i dati non sono ancora
      // caricati bisogna aspettare, altrimenti resta la Home.
      if (!hasLoadedTarget()) return false;

      if (typeof window.openEdit === "function") {
        window.openEdit(targetId);
        return isEditVisible();
      }

      if (typeof openEdit === "function") {
        openEdit(targetId);
        return isEditVisible();
      }
    } catch (error) {
      console.warn("[deep-open-edit] tentativo non riuscito:", error);
    }

    return false;
  }

  function startPolling() {
    let attempts = 0;
    const maxAttempts = 160;

    const timer = setInterval(function () {
      attempts += 1;

      if (tryOpenEdit() || attempts >= maxAttempts) {
        clearInterval(timer);
        if (attempts >= maxAttempts && !isEditVisible()) {
          console.warn("[deep-open-edit] scheda non aperta o record non trovato:", targetId);
        }
      }
    }, 250);
  }

  document.addEventListener("DOMContentLoaded", function () {
    tryOpenEdit();
    startPolling();
  }, { once: true });

  if (document.readyState !== "loading") {
    tryOpenEdit();
    startPolling();
  }
})();

// Fase 2: avanzamento lavori in fondo alla scheda, con tutte le voci e somme automatiche.
(function(){
  "use strict";

  const START = "<!--ELIP_PHASE2_JSON_START-->";
  const END = "<!--ELIP_PHASE2_JSON_END-->";
  const EDIT_PASSWORD = "MIO";
  let phase2Unlocked = false;
  const ROWS = [
    ["05","SMONTAGGIO COMPLETO DEL MOTORE SISTEMATICO"],
    ["29","LAVAGGIO COMPONENTI E TRATTAMENTO TERMICO AVVOLGIMENTI"],
    ["06","VERIFICHE MECCANICHE ALBERI E ALLOGGIAMENTO CUSCINETTI E VERIFICHE ELETTRICHE AVVOLGIMENTI"],
    ["07","TORNITURA SMICATURA ED EQUILIBRATURA ROTORE"],
    ["22","SOSTITUZIONE COLLETTORE CON RECUPERO AVVOLGIMENTO"],
    ["01","AVVOLGIMENTO INDOTTO CON RECUPERO COLLETTORE"],
    ["01C","AVVOLGIMENTO INDOTTO CON SOSTITUZIONE COLLETTORE"],
    ["08","ISOLAMENTO STATORE"],
    ["02","AVVOLGIMENTO STATORE"],
    ["31","LAVORAZIONI MECCANICHE ALBERO"],
    ["32","LAVORAZIONI MECCANICHE FLANGE"],
    ["19","SOSTITUZIONE SPAZZOLE"],
    ["20","SOSTITUZIONE MOLLE PREMISPAZZOLE"],
    ["21","SOSTITUZIONE CUSCINETTI"],
    ["23","SOSTITUZIONE TENUTA MECCANICA"],
    ["26","SOSTITUZIONE GUARNIZIONI PARAOLIO"],
    ["30","MONTAGGIO COLLAUDO E VERNICIATURA"],
    ["16","RICAMBI VARI"]
  ];

  function db(){
    if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    if(!window.__phase2Db) window.__phase2Db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return window.__phase2Db;
  }
  function rec(){ return window.state && window.state.editing ? window.state.editing : null; }
  function esc(v){ return String(v ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
  function num(v){ const n = Number(String(v || "").replace(",",".")); return Number.isFinite(n) ? n : 0; }
  function euro(v){ return Number(v || 0).toLocaleString("it-IT",{style:"currency",currency:"EUR"}); }
  function baseRows(){
    return ROWS.map(function(r,i){ return {code:r[0],description:r[1],position:i,checked:false,ore:"",addetto:"",dataEntrata:"",dataUscita:"",prezzo:""}; });
  }
  function merge(saved){
    const map = new Map((saved || []).map(function(r){ return [String(r.code || "").toUpperCase(), r]; }));
    return baseRows().map(function(r){ return Object.assign({}, r, map.get(r.code) || {}, {code:r.code, description:r.description}); });
  }
  function enc(rows){
    try{ return btoa(unescape(encodeURIComponent(JSON.stringify({rows:rows,savedAt:new Date().toISOString()})))); }
    catch(_e){ return ""; }
  }
  function dec(notes){
    const s = String(notes || "");
    const a = s.indexOf(START), b = s.indexOf(END);
    if(a < 0 || b < 0 || b <= a) return null;
    try{ return JSON.parse(decodeURIComponent(escape(atob(s.slice(a + START.length, b).trim())))).rows || null; }
    catch(_e){ return null; }
  }
  function strip(notes){
    const s = String(notes || "");
    const a = s.indexOf(START), b = s.indexOf(END);
    if(a < 0 || b < 0 || b <= a) return s.trim();
    return (s.slice(0,a) + s.slice(b + END.length)).trim();
  }
  function withData(notes, rows){
    const clean = strip(notes);
    const block = START + enc(rows) + END;
    return clean ? clean + "\n" + block : block;
  }
  function style(){
    if(document.getElementById("phase2Style")) return;
    const s = document.createElement("style");
    s.id = "phase2Style";
    s.textContent = "#phase2Card .table{min-width:1120px;margin-bottom:0}#phase2Card th{font-size:.78rem;white-space:nowrap;background:#fff6ef}#phase2Card td{vertical-align:middle}#phase2Card .phase-code{width:56px;text-align:center;font-weight:700}#phase2Card .phase-desc{min-width:310px;font-size:.86rem;line-height:1.2}#phase2Card .phase-check{width:38px;text-align:center}#phase2Card .phase-ore{width:82px}#phase2Card .phase-addetto{width:150px}#phase2Card .phase-date{width:150px}#phase2Card .phase-price{width:130px}#phase2Card input{font-size:.86rem}#phase2Card .phase-totals{display:flex;gap:.75rem;flex-wrap:wrap;justify-content:flex-end}#phase2Card .phase-total-box{border:1px solid #dee2e6;border-radius:6px;padding:.45rem .7rem;background:#f8f9fa;min-width:145px;text-align:right}#phase2Card .phase-total-box strong{display:block;font-size:1rem}#phase2Card.phase-locked .phase-field{background:#f8f9fa;color:#6c757d}#phase2LockHint{font-weight:600}@media print{#phase2Card .btn,#phase2Card .phase-save-status{display:none!important}}";
    document.head.appendChild(s);
  }
  function rowHtml(rows){
    return rows.map(function(r,i){
      return '<tr data-phase-row="'+i+'"><td class="phase-code">'+r.code+'</td><td class="phase-desc">'+r.description+'</td><td class="phase-check"><input class="form-check-input phase-field" type="checkbox" data-field="checked" '+(r.checked?'checked':'')+'></td><td><input class="form-control form-control-sm phase-field phase-ore" data-field="ore" inputmode="decimal" value="'+esc(r.ore)+'"></td><td><input class="form-control form-control-sm phase-field phase-addetto" data-field="addetto" value="'+esc(r.addetto)+'"></td><td><input class="form-control form-control-sm phase-field phase-date" data-field="dataEntrata" type="date" value="'+esc(r.dataEntrata)+'"></td><td><input class="form-control form-control-sm phase-field phase-date" data-field="dataUscita" type="date" value="'+esc(r.dataUscita)+'"></td><td><input class="form-control form-control-sm phase-field phase-price" data-field="prezzo" inputmode="decimal" value="'+esc(r.prezzo)+'"></td></tr>';
    }).join("");
  }
  function card(){
    style();
    const page = document.getElementById("page-edit");
    if(!page) return null;
    let c = document.getElementById("phase2Card");
    if(c) return c;
    c = document.createElement("div");
    c.id = "phase2Card";
    c.className = "card mt-4 mb-4";
    c.innerHTML = '<div class="card-header py-2 d-flex justify-content-between align-items-center gap-2 flex-wrap"><strong>Avanzamento lavori - Fase 2</strong><span class="small text-muted" id="phase2LockHint">Bloccata: inserisci password per modificare</span></div><div class="card-body"><div class="table-responsive"><table class="table table-bordered table-sm align-middle"><thead><tr><th>COD</th><th>DESCRIZIONE LAVORI</th><th>X</th><th>ORE</th><th>ADDETTO</th><th>DATA ENTRATA</th><th>DATA USCITA</th><th>PREZZO</th></tr></thead><tbody id="phase2Rows"></tbody></table></div><div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mt-3"><div class="phase-save-status small text-muted" id="phase2Status">Apri una scheda per caricare l\\\'avanzamento.</div><div class="phase-totals"><div class="phase-total-box"><span class="small text-muted">Ore totali</span><strong id="phase2OreTot">0</strong></div><div class="phase-total-box"><span class="small text-muted">Totale prezzo</span><strong id="phase2PrezzoTot">0,00 EUR</strong></div></div><div class="d-flex gap-2 flex-wrap"><button type="button" class="btn btn-outline-secondary" id="phase2UnlockBtn">Sblocca modifiche</button><button type="button" class="btn btn-outline-primary" id="phase2SaveBtn">Salva avanzamento</button></div></div></div>';
    page.appendChild(c);
    c.addEventListener("input", totals);
    c.addEventListener("change", totals);
    c.querySelector("#phase2UnlockBtn").addEventListener("click", unlockPhase2);
    c.querySelector("#phase2SaveBtn").addEventListener("click", save);
    applyPhase2Lock();
    return c;
  }
  function applyPhase2Lock(){
    const c = document.getElementById("phase2Card");
    if(!c) return;
    c.classList.toggle("phase-locked", !phase2Unlocked);
    c.querySelectorAll(".phase-field").forEach(function(el){ el.disabled = !phase2Unlocked; });
    const saveBtn = document.getElementById("phase2SaveBtn");
    const unlockBtn = document.getElementById("phase2UnlockBtn");
    const hint = document.getElementById("phase2LockHint");
    if(saveBtn) saveBtn.disabled = !phase2Unlocked;
    if(unlockBtn) unlockBtn.textContent = phase2Unlocked ? "Blocca modifiche" : "Sblocca modifiche";
    if(hint) hint.textContent = phase2Unlocked ? "Sbloccata: puoi modificare e salvare" : "Bloccata: inserisci password per modificare";
  }
  function unlockPhase2(){
    if(phase2Unlocked){
      phase2Unlocked = false;
      applyPhase2Lock();
      return;
    }
    const pwd = window.prompt("Password per modificare avanzamento lavori:");
    if(String(pwd || "").trim().toUpperCase() !== EDIT_PASSWORD){
      const st = document.getElementById("phase2Status");
      if(st) st.textContent = "Password errata: sezione ancora bloccata.";
      applyPhase2Lock();
      return;
    }
    phase2Unlocked = true;
    const st = document.getElementById("phase2Status");
    if(st) st.textContent = "Sezione sbloccata: ora puoi modificare.";
    applyPhase2Lock();
  }
  function collect(){
    const rows = baseRows();
    document.querySelectorAll("#phase2Rows tr").forEach(function(tr){
      const i = Number(tr.getAttribute("data-phase-row"));
      if(!Number.isInteger(i) || !rows[i]) return;
      tr.querySelectorAll(".phase-field").forEach(function(el){
        const f = el.getAttribute("data-field");
        rows[i][f] = el.type === "checkbox" ? el.checked : el.value.trim();
      });
    });
    return rows;
  }
  function totals(){
    const rows = collect();
    const ore = rows.reduce(function(s,r){ return s + num(r.ore); }, 0);
    const prezzo = rows.reduce(function(s,r){ return s + num(r.prezzo); }, 0);
    const o = document.getElementById("phase2OreTot"), p = document.getElementById("phase2PrezzoTot");
    if(o) o.textContent = ore.toLocaleString("it-IT",{maximumFractionDigits:2});
    if(p) p.textContent = euro(prezzo);
  }
  async function findQuote(r){
    const client = db();
    if(!client || !r || !r.id) return null;
    const res = await client.from("quotes").select("id,record_id,status,notes,created_at").eq("record_id", r.id).order("created_at",{ascending:false}).limit(20);
    const rows = res.data || [];
    return rows.find(function(q){ return String(q.notes || "").includes(START); }) || rows[0] || null;
  }
  async function findOrCreateQuote(r){
    const existing = await findQuote(r);
    if(existing) return existing;
    const client = db();
    if(!client || !r || !r.id) return null;
    const payloads = [
      {record_id:r.id,status:"BOZZA",notes:"",subtotal_ex_vat:0,vat_rate:22,vat_total:0,grand_total:0,progress_percent:0},
      {record_id:r.id,status:"BOZZA",notes:""},
      {record_id:r.id,stato:"bozza",notes:""}
    ];
    for(const payload of payloads){
      try{
        const res = await client.from("quotes").insert(payload).select("id,record_id,status,notes,created_at").single();
        if(!res.error && res.data) return res.data;
      }catch(_e){}
    }
    return null;
  }
  async function load(){
    const c = card(), body = document.getElementById("phase2Rows"), st = document.getElementById("phase2Status");
    if(!c || !body) return;
    body.innerHTML = rowHtml(baseRows());
    totals();
    const r = rec();
    if(!r || !r.id){ if(st) st.textContent = "Apri una scheda per caricare l'avanzamento."; return; }
    if(st) st.textContent = "Caricamento avanzamento...";
    try{
      const q = await findQuote(r);
      body.innerHTML = rowHtml(merge(dec(q && q.notes) || []));
      totals();
      applyPhase2Lock();
      if(st) st.textContent = q ? "Avanzamento caricato." : "Nessun preventivo collegato: compila e premi Salva avanzamento.";
    }catch(e){
      if(st) st.textContent = "Non riesco a caricare l'avanzamento: " + (e.message || e);
    }
  }
  async function save(){
    const r = rec(), client = db(), st = document.getElementById("phase2Status");
    if(!r || !r.id){ if(st) st.textContent = "Apri prima una scheda."; return; }
    if(!client){ if(st) st.textContent = "Supabase non pronto."; return; }
    if(!phase2Unlocked){ if(st) st.textContent = "Inserisci prima la password per modificare questa sezione."; return; }
    const rows = collect();
    totals();
    if(st) st.textContent = "Salvataggio avanzamento...";
    try{
      const q = await findOrCreateQuote(r);
      if(!q || !q.id) throw new Error("preventivo collegato non disponibile");
      const res = await client.from("quotes").update({notes:withData(q.notes || "", rows)}).eq("id", q.id);
      if(res.error) throw res.error;
      if(st) st.textContent = "Avanzamento salvato. Totali aggiornati.";
    }catch(e){
      if(st) st.textContent = "Errore salvataggio avanzamento: " + (e.message || e);
    }
  }

  const originalOpenEdit = window.openEdit;
  if(typeof originalOpenEdit === "function" && !originalOpenEdit.__phase2Patched){
    window.openEdit = function(){
      const out = originalOpenEdit.apply(this, arguments);
      setTimeout(load, 0);
      return out;
    };
    Object.defineProperty(window.openEdit, "__phase2Patched", {value:true});
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", card, {once:true});
  else card();
})();
