
/*!
 * gf-modal-bridge.v1.1.js
 * - Come v1, ma con AGGANCIO IMMAGINE robusto:
 *   1) Se image_url è già http(s) -> usa quello.
 *   2) Se è un path, prova getPublicUrl('path'), poi 'records/path', poi solo basename.
 *   3) Se non c'è image_url, chiama RPC photos_for_record(id, 1) e usa images[0] o thumbs[0].
 */
(function () {
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
  const sb0 = resolveSupabase();
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const $ = (s,ctx=document)=>ctx.querySelector(s);
  const qsa = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const safe = v => (v==null?"":String(v));

  // === Modal ===
  if (!document.getElementById("gfModal")) {
    const wrap = document.createElement("div");
    wrap.id = "gfModal";
    wrap.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;z-index:2147483000;align-items:center;justify-content:center;";
    wrap.innerHTML = `
      <div id="gfCard" style="background:#fff; width:min(920px,96vw); max-height:92vh; overflow:auto; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,.3);">
        <div style="padding:12px 16px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #eee">
          <div id="gfTitle" style="font-weight:600">Scheda</div>
          <button id="gfClose" style="border:0;background:#eee;padding:6px 10px;border-radius:8px;cursor:pointer">Chiudi</button>
        </div>
        <div style="padding:16px">
          <div style="display:grid; grid-template-columns: 180px 1fr; gap:16px">
            <div>
              <div id="gfImageBox" style="width:100%;aspect-ratio:4/3;background:#f3f3f3;border:1px solid #ddd;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden">
                <img id="gfImage" alt="" style="max-width:100%;max-height:100%;display:none">
                <div id="gfImgEmpty" style="color:#888;font-size:12px">Nessuna immagine</div>
              </div>
              <div id="gfId" style="margin-top:8px;font-size:12px;color:#777;word-break:break-all"></div>
              <div id="gfNumero" style="margin-top:4px;font-size:12px;color:#777"></div>
            </div>
            <div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px">
                <label>Descrizione
                  <input id="gfDescrizione" class="gf-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px">
                </label>
                <label>Cliente
                  <input id="gfCliente" class="gf-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px">
                </label>
                <label>Telefono
                  <input id="gfTelefono" class="gf-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px">
                </label>
                <label>Stato
                  <select id="gfStato" class="gf-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px">
                    <option>In attesa</option>
                    <option>In lavorazione</option>
                    <option>Completata</option>
                  </select>
                </label>
                <label style="grid-column:1 / -1">Note
                  <textarea id="gfNote" rows="2" class="gf-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px"></textarea>
                </label>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;grid-column:1 / -1">
                  <label>Data arrivo
                    <input id="gfArrivo" placeholder="YYYY-MM-DD o DD/MM/YYYY" class="gf-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px">
                  </label>
                  <label>Data accettazione
                    <input id="gfAcc" placeholder="YYYY-MM-DD o DD/MM/YYYY" class="gf-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px">
                  </label>
                  <label>Data scadenza
                    <input id="gfScad" placeholder="YYYY-MM-DD o DD/MM/YYYY" class="gf-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px">
                  </label>
                </div>
              </div>
              <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
                <button id="gfSave" style="background:#1e8b3d;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer">Salva</button>
                <button id="gfOpenRecordPage" style="background:#e07b39;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer">Apri pagina (se supportata)</button>
              </div>
              <div id="gfMsg" style="margin-top:8px;font-size:12px;color:#555"></div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    $("#gfClose").onclick = () => { wrap.style.display="none"; };
  }

  function asISO(s){
    if (!s) return "";
    s = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m){ const [_, d, mo, y] = m; return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`; }
    return s;
  }

  function isHttp(u){ return /^https?:\/\//i.test(u||''); }
  function baseName(p){ const s = String(p||'').split(/[\\/]/); return s[s.length-1] || ''; }

  function toPublicUrl(path) {
    try {
      const sb = resolveSupabase();
      if (!sb) return null;
      const { data } = sb.storage.from('photos').getPublicUrl(path);
      return data?.publicUrl || null;
    } catch(e){ return null; }
  }

  async function resolveImageUrl(record) {
    // 1) field image_url
    let u = safe(record.image_url||"");
    if (isHttp(u)) return u;
    if (u) {
      const candidates = [u, `records/${u}`, `records/${baseName(u)}`, baseName(u)];
      for (const c of candidates) {
        const pub = toPublicUrl(c);
        if (pub) return pub;
      }
    }
    // 2) prova RPC photos_for_record(id,1)
    try {
      const sb = resolveSupabase();
      if (!sb) return "";
      const { data } = await sb.rpc('photos_for_record', { p_record_id: record.id, p_limit: 1 });
      const first = (data && data[0]) || null;
      const p = (first?.thumbs && first.thumbs[0]) || (first?.images && first.images[0]) || "";
      if (p) {
        const pub = toPublicUrl(p) || toPublicUrl(`records/${p}`) || toPublicUrl(`records/${baseName(p)}`) || toPublicUrl(baseName(p));
        if (pub) return pub;
      }
    } catch(e){}
    return "";
  }

  async function loadRecord(id){
    const msg = $("#gfMsg"); msg.textContent = "";
    const sbc = resolveSupabase();
    if (!sbc) { msg.textContent = "Supabase client non trovato in pagina."; return; }
    const { data, error } = await sbc.from("records").select("*").eq("id", id).maybeSingle();
    if (error) { msg.textContent = "Errore load: " + error.message; return; }
    if (!data) { msg.textContent = "Record non trovato."; return; }

    $("#gfTitle").textContent = `Scheda — ${safe(data.cliente||'')} ${data.numero?`(#${data.numero})`:''}`;
    $("#gfId").textContent = `id: ${id}`;
    $("#gfNumero").textContent = data.numero ? `numero: ${data.numero}` : "";

    // IMMAGINE robusta
    const img = $("#gfImage"), empty = $("#gfImgEmpty");
    const finalUrl = await resolveImageUrl(data);
    if (finalUrl){
      img.src = finalUrl; img.style.display="block"; empty.style.display="none";
    } else {
      img.src=""; img.style.display="none"; empty.style.display="block";
    }

    $("#gfDescrizione").value  = safe(data.descrizione || data.modello || "");
    $("#gfCliente").value      = safe(data.cliente || "");
    $("#gfTelefono").value     = safe(data.telefono || "");
    $("#gfStato").value        = /lavorazione/i.test(safe(data.statoPratica)) ? "In lavorazione"
                                : /complet/i.test(safe(data.statoPratica))   ? "Completata"
                                : "In attesa";
    $("#gfNote").value         = safe(data.note || "");
    $("#gfArrivo").value       = safe(data.dataArrivo || "");
    $("#gfAcc").value          = safe(data.dataAccettazione || "");
    $("#gfScad").value         = safe(data.dataScadenza || "");

    $("#gfSave").onclick = async () => {
      const payload = {
        descrizione: $("#gfDescrizione").value.trim().replace(/\s*Note:\s*.*$/i,''),
        cliente:     $("#gfCliente").value.trim(),
        telefono:    $("#gfTelefono").value.trim(),
        statoPratica:$("#gfStato").value.trim(),
        note:        $("#gfNote").value.trim(),
        dataArrivo:  asISO($("#gfArrivo").value),
        dataAccettazione: asISO($("#gfAcc").value),
        dataScadenza:     asISO($("#gfScad").value),
      };
      const sbc2 = resolveSupabase();
      const { error: e2 } = await sbc2.from("records").update(payload).eq("id", id);
      $("#gfMsg").textContent = e2 ? ("Errore salvataggio: " + e2.message) : "Salvato ✔";
      const btn = document.getElementById("btnDoSearch"); if (btn) btn.click();
    };

    $("#gfOpenRecordPage").onclick = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("id", id);
      window.location.assign(url.toString());
    };

    $("#gfModal").style.display = "flex";
  }

  window.openRecord = async function(id){
    if (!id || !UUID_RE.test(id)) return console.warn("[gf-modal] id non valido", id);
    await loadRecord(id);
  };
  window.editRecord = window.openRecord;

  const TBL = document.querySelector('#tableResults');
  if (!TBL) return;

  function getIdFromNode(el){
    if (!el) return '';
    let id = el.dataset?.id || el.dataset?.recordId || '';
    if (UUID_RE.test(id)) return id.match(UUID_RE)[0];
    const tr = el.closest('tr');
    id = tr?.dataset?.id || tr?.getAttribute('data-record-id') || '';
    if (UUID_RE.test(id)) return id.match(UUID_RE)[0];
    const href = el.getAttribute?.('href') || '';
    if (UUID_RE.test(href)) return href.match(UUID_RE)[0];
    const onclk = el.getAttribute?.('onclick') || '';
    if (UUID_RE.test(onclk)) return onclk.match(UUID_RE)[0];
    return '';
  }

  function normalizeRows(){
    qsa('tbody tr', TBL).forEach(tr => {
      let id = tr.dataset.id || tr.getAttribute('data-record-id') || '';
      if (!UUID_RE.test(id||'')) {
        const probe = tr.querySelector('[data-id],[data-record-id],a[href],button[onclick],img');
        id = getIdFromNode(probe || tr) || id;
      }
      if (UUID_RE.test(id||'')) {
        tr.dataset.id = id;
        tr.setAttribute('data-record-id', id);
        qsa('a,button,select,img', tr).forEach(el => {
          el.dataset.id = id;
          el.setAttribute('data-record-id', id);
        });
      }
    });
  }
  normalizeRows();

  function wireActions(){
    qsa('tbody tr', TBL).forEach(tr => {
      const id = tr.dataset.id || tr.getAttribute('data-record-id');
      if (!UUID_RE.test(id||'')) return;
      const firstTd = tr.children[0];
      const img = firstTd?.querySelector('img') || firstTd;
      if (img && !img.__gfWire) { img.__gfWire = true;
        img.addEventListener('click', (e)=>{ e.preventDefault(); window.openRecord(id); }, false);
      }
      const btnOpen = qsa('button,a', tr).find(b => /\bapri\b/i.test((b.textContent||'')) || b.classList.contains('btn-open'));
      if (btnOpen && !btnOpen.__gfWire) { btnOpen.__gfWire = true;
        btnOpen.addEventListener('click', (e)=>{ e.preventDefault(); window.openRecord(id); }, false);
      }
      const btnEdit = qsa('button,a', tr).find(b => /modifica/i.test((b.textContent||'')) || b.classList.contains('btn-edit'));
      if (btnEdit && !btnEdit.__gfWire) { btnEdit.__gfWire = true;
        btnEdit.addEventListener('click', (e)=>{ e.preventDefault(); window.editRecord(id); }, false);
      }
    });
  }
  wireActions();
  new MutationObserver(() => { normalizeRows(); wireActions(); }).observe(TBL.querySelector('tbody')||TBL, { childList:true, subtree:true });
})();
