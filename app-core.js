// UI & Ricerca ESATTA (case/accents-insensitive)
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const el = {
  q: $("#q"),
  results: $("#results"),
  btnSearch: $("#btnSearch"),
  btnReset: $("#btnReset"),
  kpiTot: $("#kpiTot"),
  kpiAttesa: $("#kpiAttesa"),
  kpiLav: $("#kpiLavorazione"),
  kpiComp: $("#kpiCompletate"),
  filters: {
    cliente: $("#f_cliente"),
    modello: $("#f_modello"),
    descrizione: $("#f_descrizione"),
    telefono: $("#f_telefono"),
    email: $("#f_email"),
    note: $("#f_note"),
    punta: $("#f_punta"),
    numPunte: $("#f_numPunte"),
    battCollettore: $("#f_battCollettore"),
    lunghezzaAsse: $("#f_lunghezzaAsse"),
    lunghezzaPacco: $("#f_lunghezzaPacco"),
    larghezzaPacco: $("#f_larghezzaPacco"),
  }
};

let ALL = [];

function normalize(v){
  if(v === null || v === undefined) return "";
  const s = String(v).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // rimuove accenti
  return s;
}
function asNumberOrStr(v){
  if(v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if(!Number.isNaN(n)) return n;
  return String(v);
}

function eqExact(a, b){
  // confronto perfetto tra due valori: ignora case/accents
  // gestisce numeri (133 == "133")
  const na = asNumberOrStr(a);
  const nb = asNumberOrStr(b);
  const bothNum = (typeof na === 'number' && typeof nb === 'number');
  if(bothNum) return na === nb;
  return normalize(na) === normalize(nb);
}

function recordMatches(rec, query, fields, perFieldFilters){
  // 1) filtri per campo (tutti i campi valorizzati devono matchare)
  for(const [k, val] of Object.entries(perFieldFilters)){
    if(val === "" || val === null || val === undefined) continue;
    if(!eqExact(rec[k], val)) return false;
  }
  // 2) query generale: se presente deve matchare su ALMENO uno dei campi
  if(query){
    const n = normalize(query);
    let ok = false;
    for(const f of fields){
      if(eqExact(rec[f], n)) { ok = true; break; }
    }
    if(!ok) return false;
  }
  return true;
}

function computeKpis(list){
  const tot = list.length;
  const att = list.filter(r => normalize(r.statoPratica) === 'in attesa').length;
  const lav = list.filter(r => normalize(r.statoPratica) === 'in lavorazione').length;
  const comp = list.filter(r => normalize(r.statoPratica) === 'completata').length;
  el.kpiTot.textContent = tot;
  el.kpiAttesa.textContent = att;
  el.kpiLav.textContent = lav;
  el.kpiComp.textContent = comp;
}

function render(list){
  el.results.innerHTML = "";
  const tpl = $("#cardTpl");
  for(const r of list){
    const node = tpl.content.firstElementChild.cloneNode(true);
    const thumb = node.querySelector('.thumb');
    const cliente = node.querySelector('.cliente');
    const desc = node.querySelector('.descrizione');
    const st = node.querySelector('.stato');
    const mod = node.querySelector('.modello');
    const punte = node.querySelector('.punte');
    const ddt = node.querySelector('.ddt');
    const scad = node.querySelector('.scadenza');
    const banner = node.querySelector('.closed-banner');

    const imgUrl = sbPublicImage(r.image_url);
    if(imgUrl){ thumb.src = imgUrl; } else { thumb.src = "assets/logo-elip.jpg"; }

    cliente.textContent = r.cliente || "(senza cliente)";
    desc.textContent = r.descrizione || "";
    st.textContent = r.statoPratica || "";
    mod.textContent = r.modello ? ("Mod: " + r.modello) : "";
    punte.textContent = r.numPunte ? ("Punte: " + r.numPunte) : "";
    ddt.textContent = r.docTrasporto || "";
    if(r.dataScadenza){ scad.textContent = "Scadenza: " + r.dataScadenza; }

    // Banner CHIUSA se completata
    if(normalize(r.statoPratica) === 'completata'){
      banner.classList.remove('hidden');
    }

    el.results.appendChild(node);
  }
  computeKpis(list);
}

function gatherFilters(){
  const F = {};
  for(const [k, input] of Object.entries(el.filters)){
    const val = (input?.value ?? "").toString().trim();
    if(val !== "") F[k] = val;
  }
  return F;
}

function unifiedSearch(){
  const q = el.q.value.trim();
  const perField = gatherFilters();
  const allowed = [
    'cliente','modello','descrizione','telefono','email','note',
    'punta','numPunte','battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco','docTrasporto'
  ];
  const filtered = ALL.filter(r => recordMatches(r, q || "", allowed, perField));
  render(filtered);
}

function resetAll(){
  // pulisce tutto e torna alla home (tutti i record)
  el.q.value = "";
  for(const input of Object.values(el.filters)){
    if(!input) continue;
    if(input.tagName === "SELECT"){ input.selectedIndex = 0; }
    else input.value = "";
  }
  render(ALL);
}

async function boot(){
  ALL = await sbListAll(500);
  render(ALL);
  // bind
  el.btnSearch.addEventListener('click', unifiedSearch);
  el.btnReset.addEventListener('click', resetAll);
  el.q.addEventListener('keydown', e => { if(e.key === 'Enter'){ unifiedSearch(); } });
}

window.addEventListener('DOMContentLoaded', boot);
