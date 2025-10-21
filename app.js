/* Ricerca con match esatto (case-insensitive) su campi singoli.
   Implementazione pulita: usa ILIKE senza wildcard per ottenere uguaglianza insensibile al case.
   Dove il campo è numerico (asse/pacco/larghezza/numPunte) usa EQ.
*/
const $ = sel => document.querySelector(sel);
const norm = v => String(v ?? '').trim();

function getFilters(){
  const F = {};
  F.q = norm($("#q")?.value).toLowerCase();

  // esatti testo
  ["descrizione","modello","cliente","telefono","email","note"].forEach(k => {
    const el = $("#f_"+k);
    const v = norm(el?.value);
    if (v) F[k] = v;
  });
  // tecnici
  const tmap = {
    battCollettore:"#f_battCollettore",
    lunghezzaAsse:"#f_lunghezzaAsse",
    lunghezzaPacco:"#f_lunghezzaPacco",
    larghezzaPacco:"#f_larghezzaPacco",
    punta:"#f_punta",
    numPunte:"#f_numPunte"
  };
  for (const [k,sel] of Object.entries(tmap)){
    const v = norm($(sel)?.value);
    if (v) F[k] = v;
  }
  return F;
}

function hasAnyFilter(F){ return Object.keys(F).some(k => F[k]); }

async function search(){
  const F = getFilters();
  let { data, error } = await sb.from('records').select('*').order('dataApertura', {ascending:false}).limit(2000);
  if (error) {
    console.error(error);
    $("#resBody").innerHTML = `<tr><td colspan="5" class="text-danger">${error.message}</td></tr>`;
    $("#results").classList.remove("d-none");
    $("#resCount").textContent = "0";
    return;
  }
  const rows = clientExactFilter(Array.isArray(data)?data:[], F);
  renderResults(rows);
}
  // numerici = eq
  const numFields = ["lunghezzaAsse","lunghezzaPacco","larghezzaPacco","numPunte"];
  for (const k of numFields){
    if (F[k]) q = q.eq(k, isNaN(Number(F[k])) ? F[k] : Number(F[k]));
  }

  // filtro "q" esatto su più colonne (se presente)
  if (F.q){
    const cols = ["descrizione","modello","cliente","telefono","email","note"];
    const ors = cols.map(c => `${c}.ilike.${F.q}`).join(",");
    q = q.or(ors);
  }

  // ordinamento (opzionale se presente la colonna)
  try { q = q.order("dataApertura", { ascending:false }); } catch(e){}

  let resp = await q;
  if (!hasAnyFilter(F)) {
    resp = await sb.from('records').select('*').order('dataApertura', {ascending:false}).limit(500);
  }
  const { data, error } = resp;
  if (error) {
    console.error(error);
    $("#resBody").innerHTML = `<tr><td colspan="5" class="text-danger">${error.message}</td></tr>`;
    $("#results").classList.remove("d-none");
    $("#resCount").textContent = "0";
    return;
  }

  renderResults(Array.isArray(data)?data:[]);
}

function renderResults(rows){
  const tb = $("#resBody");
  tb.innerHTML = "";
  $("#resCount").textContent = rows.length;
  $("#results").classList.remove("d-none");

  if (!rows.length){
    tb.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nessun risultato</td></tr>';
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.addEventListener("click", ()=>{ if(r.id) showPreviewFor(r.id); });
    tr.innerHTML = `
      <td>${safe(r.descrizione)}</td>
      <td>${safe(r.cliente)}</td>
      <td>${safe(r.modello)}</td>
      <td class="text-center">${safe(r.statoPratica||"")}</td>
      <td class="text-end nowrap">
        <div class="btn-group">
          <button class="btn btn-sm btn-outline-primary" data-open="${r.id||""}" disabled>Apri</button>
          <button class="btn btn-sm btn-outline-success" data-edit="${r.id||""}" disabled>Modifica</button>
        </div>
        ${ (r.statoPratica||"") === "Completata" ? '<div class="mt-1"><span class="badge badge-chiusa">Chiusa</span></div>' : "" }
      </td>`;
    tb.appendChild(tr);
  });
}

function safe(v){
  return (v==null?"":String(v)).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

function resetAll(){
  document.querySelectorAll("#page-search input, #page-search select").forEach(el => el.value = "");
  $("#resBody").innerHTML = "";
  $("#resCount").textContent = "0";
  $("#results").classList.add("d-none");
  $("#q").focus();
}

$("#btnDoSearch").addEventListener("click", search);
$("#btnReset").addEventListener("click", resetAll);
document.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ search(); }});


async function showPreviewFor(recordId){
  try {
    const { data, error } = await sb.from('photos').select('*').eq('record_id', recordId).order('created_at', {ascending:true}).limit(1);
    const imgEl = document.getElementById('previewImg');
    const empty = document.getElementById('previewEmpty');
    if (error) throw error;
    if (data && data.length && data[0].path){
      const path = data[0].path;
      const { data:pub } = sb.storage.from('photos').getPublicUrl(path);
      imgEl.src = (pub && pub.publicUrl) ? pub.publicUrl : "";
      if (imgEl.src){ imgEl.classList.remove('d-none'); empty.classList.add('d-none'); }
      else { imgEl.classList.add('d-none'); empty.classList.remove('d-none'); }
    } else {
      imgEl.src = ""; imgEl.classList.add('d-none'); empty.classList.remove('d-none');
    }
  } catch(e){
    console.warn("Anteprima non disponibile:", e?.message||e);
    const imgEl = document.getElementById('previewImg');
    const empty = document.getElementById('previewEmpty');
    imgEl.src = ""; imgEl.classList.add('d-none'); empty.classList.remove('d-none');
  }
}


// --- v3.1 exact filter like "prima": client-side normalization with accent removal ---
const deacc = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normExact = v => deacc(v).toLowerCase().trim().replace(/\s+/g,' ');

function clientExactFilter(rows, F){
  const has = key => F[key] && String(F[key]).length>0;
  const numEq = (a,b) => {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
    return String(a)==String(b);
  };

  const wantQ = has("q");
  const qCols = ["descrizione","modello","cliente","telefono","email","note"];

  return rows.filter(r => {
    if (wantQ){
      const nq = normExact(F.q);
      const okQ = qCols.some(c => normExact(r[c]) === nq);
      if (!okQ) return false;
    }
    for (const k of ["descrizione","modello","cliente","telefono","email","note","battCollettore","punta"]){
      if (has(k) && normExact(r[k]) !== normExact(F[k])) return false;
    }
    for (const k of ["lunghezzaAsse","lunghezzaPacco","larghezzaPacco","numPunte"]){
      if (has(k) && !numEq(r[k], F[k])) return false;
    }
    return true;
  });
}
