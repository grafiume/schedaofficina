
/*!
 * exact-gate-combo.v7.js  —  ALL‑IN‑ONE FIX
 *
 * Obiettivi:
 *  1) Match ESATTO (case-insensitive, spazi normalizzati) su TUTTE le ricerche.
 *  2) Niente record "random": solo l'ULTIMA risposta è valida (newest-response-wins).
 *  3) Niente duplicati: dedupe per id PRIMA che i dati arrivino all'app.
 *  4) Ordinamento deterministico.
 *
 * Come funziona:
 *  - Intercetta window.fetch per REST /rest/v1/records|records_view.
 *    • Applica filtri "eq" su colonne *_norm SE ESISTONO; altrimenti filtra client-side normalizzando i campi.
 *    • Rimuove i duplicati per id.
 *    • Scarta le risposte vecchie riscrivendo il body in [] (newest-response-wins).
 *    • Ritorna un Response nuovo con JSON già filtrato/ordinato.
 *  - Intercetta supabase.from(...).select() (no-op, perché il filtro lo imponiamo via fetch).
 *  - Intercetta supabase.rpc('search_records_exact_all*') e applica lo stesso filtraggio/ordinamento.
 *
 * Non richiede modifiche all'HTML. Se hai già creato le colonne *_norm con lo SQL fornito, userà quelle.
 */
(function(){
  const LOG = "[exact-gate v7]";
  const N = s => String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // ---- Legge i filtri correnti dall'UI ----
  function readFilters(){
    const out = {};
    out.q = N($("#q")?.value || "");

    // Campo Note (match esatto) se presente
    const noteExact = $("#filterNoteExact")?.value || "";
    if (noteExact) out.note = N(noteExact);

    // Box Filtri tecnici
    const box = (function(){
      const all = $$('div,section,form');
      return all.find(el => /Filtri tecnici\s*\(singoli\)/i.test(el.textContent||""));
    })();
    if (box){
      const pairs = [
        { re:/batt\.*\s*collettore/i, key:"battCollettore" },
        { re:/lunghezza\s*asse/i,     key:"lunghezzaAsse" },
        { re:/lunghezza\s*pacco/i,    key:"lunghezzaPacco" },
        { re:/larghezza\s*pacco/i,    key:"larghezzaPacco" },
        { re:/punta/i,                key:"punta" },
        { re:/^n\.?$/i,               key:"numPunte" },
        { re:/stato/i,                key:"statoPratica" },
      ];
      const labels = $$('label', box);
      labels.forEach(lab => {
        const text = (lab.textContent||"").trim();
        const ctl  = lab.querySelector('input,select,textarea');
        const val  = ctl ? N(ctl.value) : "";
        if (!val) return;
        const m = pairs.find(p => p.re.test(text));
        if (m) out[m.key] = val;
      });
    }

    // Campi rapidi opzionali
    const quick = [
      { sel:'#fCliente',     key:'cliente' },
      { sel:'#fNumero',      key:'numero' },
      { sel:'#fTelefono',    key:'telefono' },
      { sel:'#fEmail',       key:'email' },
      { sel:'#fDescrizione', key:'descrizione' },
      { sel:'#fModello',     key:'modello' },
      { sel:'#fNote',        key:'note' },
    ];
    quick.forEach(q => { const el = $(q.sel); if (el && N(el.value)) out[q.key] = N(el.value); });
    return out;
  }

  // ---- Normalized getters (preferisce *_norm se presenti nel record) ----
  function getNorm(r, field){
    const normKey = (field + "_norm")
      .replace(/([A-Z])/g, m => m.toLowerCase()); // dataArrivo -> dataarrivo_norm (non usato qui)
    const v = r.hasOwnProperty(normKey) ? r[normKey] : r[field];
    return N(v);
  }

  // ---- Applica filtro esatto su un record ----
  function recordMatches(r, F){
    // Filtri puntuali
    const keys = Object.keys(F).filter(k => k !== "q");
    for (const k of keys){
      if (!F[k]) continue;
      const rv = getNorm(r, k);
      if (rv !== F[k]) return false;
    }
    // Ricerca generale (OR su più colonne)
    if (F.q){
      const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica'];
      const any = cols.some(c => getNorm(r,c) === F.q);
      if (!any) return false;
    }
    return true;
  }

  // ---- Ordinamento deterministico ----
  function stableSort(arr){
    const copy = arr.slice();
    copy.sort((a,b)=>{
      // Data arrivo DESC (se stringhe date ISO o DD/MM/… gestiamo lexicographically ok per ISO; altrimenti fallback)
      const da = N(a.dataArrivo);
      const db = N(b.dataArrivo);
      if (da !== db) return db.localeCompare(da);
      // created_at DESC
      const ca = N(a.created_at || a.createdAt);
      const cb = N(b.created_at || b.createdAt);
      if (ca !== cb) return cb.localeCompare(ca);
      // id ASC
      const ia = String(a.id||"");
      const ib = String(b.id||"");
      return ia.localeCompare(ib);
    });
    return copy;
  }

  // ---- Dedupe per id ----
  function dedupeById(arr){
    const seen = new Set();
    const out = [];
    for (const r of arr){
      const id = String(r?.id ?? "");
      if (!id) { out.push(r); continue; }
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(r);
    }
    return out;
  }

  // ---- NEWEST-RESPONSE-WINS per endpoint ----
  const latestReq = { records: 0, records_view: 0 };
  function endpointKey(url){
    const m = url.match(/\/rest\/v1\/(records|records_view)\b/i);
    return m ? m[1].toLowerCase() : null;
  }

  // ---- FETCH WRAP ----
  (function installFetch(){
    if (window.__EXACT_GATE_FETCH_V7__) return;
    const ORIG = window.fetch.bind(window);

    window.fetch = async function(input, init={}){
      let url = typeof input === 'string' ? input : (input?.url || '');
      const method = (init?.method || (typeof input!=='string' ? input?.method : '') || 'GET').toUpperCase();
      const key = endpointKey(url);

      // Solo GET records/records_view con select
      if (method === 'GET' && key && /[?&]select=/.test(url)){
        const F = readFilters();

        // Numero progressivo per "newest-response-wins"
        const reqId = (latestReq[key] = (latestReq[key] + 1));

        // Esegui fetch originale
        const res = await ORIG.apply(this, arguments).catch(err => { throw err; });

        // Se nel frattempo è partita una richiesta più recente, neutralizza questa risposta
        if (reqId !== latestReq[key]) {
          // restituisci una risposta vuota (array) per evitare che la UI appendi vecchi dati
          return new Response('[]', { status: 200, headers: { 'content-type':'application/json' } });
        }

        // Clona e filtra JSON
        try {
          const clone = res.clone();
          // Se non è JSON o non è array, torna l'originale
          const ct = clone.headers.get('content-type')||'';
          if (!/application\/json/i.test(ct)) return res;
          const data = await clone.json();
          if (!Array.isArray(data)) return res;

          // 1) Filtra con match esatto
          let filtered = data.filter(r => recordMatches(r, F));
          // 2) Dedupe per id
          filtered = dedupeById(filtered);
          // 3) Ordina
          filtered = stableSort(filtered);

          // Ritorna nuovo Response con JSON già pulito
          const body = JSON.stringify(filtered);
          const headers = new Headers(res.headers);
          headers.set('content-length', String(body.length));
          return new Response(body, { status: 200, headers });
        } catch (e){
          console.warn(LOG, "rewrite fallita, ritorno originale:", e);
          return res;
        }
      }

      // Altrimenti, passa l'originale
      return ORIG.apply(this, arguments);
    };

    window.__EXACT_GATE_FETCH_V7__ = true;
    console.log(LOG, "fetch hook attivo (exact, dedupe, newest-response-wins)");
  })();

  // ---- RPC WRAP (search_records_exact_all*) ----
  (function installRPC(){
    const sb = window.supabase;
    if (!sb || !sb.rpc || window.__EXACT_GATE_RPC_V7__) return;
    const ORIG = sb.rpc.bind(sb);

    sb.rpc = async function(fn, params){
      const out = await ORIG(fn, params);
      try{
        if (/^search_records_exact_all/i.test(fn) && out?.data && Array.isArray(out.data)){
          const F = readFilters();
          let arr = out.data.filter(r => recordMatches(r, F));
          arr = dedupeById(arr);
          arr = stableSort(arr);
          out.data = arr;
        }
      }catch(e){ console.warn(LOG, "rpc rewrite fallita:", e); }
      return out;
    };

    window.__EXACT_GATE_RPC_V7__ = true;
    console.log(LOG, "rpc hook attivo (exact, dedupe, sort)");
  })();
})();
