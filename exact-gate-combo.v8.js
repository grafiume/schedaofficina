/*!
 * exact-gate-combo.v8.js
 * (bundle: fingerprint + server params + newest-response-wins + dedupe + stable sort)
 * See chat for full description.
 */
(function(){
  const LOG = "[exact-gate v8]";
  const N = s => String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  function findFiltersBox(){
    const all = $$('div,section,form');
    return all.find(el => /Filtri tecnici\s*\(singoli\)/i.test(el.textContent||""));
  }
  function readFilters(){
    const out = {};
    out.q = N($("#q")?.value || "");
    const noteExact = $("#filterNoteExact")?.value || "";
    if (noteExact) out.note = N(noteExact);
    const box = findFiltersBox();
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
  function filtersFingerprint(F){
    const keys = Object.keys(F).sort();
    const parts = keys.map(k => `${k}=${F[k]}`);
    return parts.join('&');
  }
  function getNorm(r, field){
    const nk = field.replace(/([A-Z])/g, m => m.toLowerCase()) + "_norm";
    const v = Object.prototype.hasOwnProperty.call(r, nk) ? r[nk] : r[field];
    return N(v);
  }
  function recordMatches(r, F){
    const keys = Object.keys(F).filter(k => k !== 'q');
    for (const k of keys){
      if (getNorm(r,k) !== F[k]) return false;
    }
    if (F.q){
      const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica'];
      const any = cols.some(c => getNorm(r,c) === F.q);
      if (!any) return false;
    }
    return true;
  }
  function dedupeById(arr){
    const seen = new Set(); const out = [];
    for (const r of arr){
      const id = String(r?.id || "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(r);
    }
    return out;
  }
  function stableSort(arr){
    const copy = arr.slice();
    copy.sort((a,b)=>{
      const da = N(a.dataArrivo); const db = N(b.dataArrivo);
      if (da !== db) return db.localeCompare(da);
      const ca = N(a.created_at || a.createdAt); const cb = N(b.created_at || b.createdAt);
      if (ca !== cb) return cb.localeCompare(ca);
      return String(a.id||"").localeCompare(String(b.id||""));
    });
    return copy;
  }
  function buildServerParams(F){
    const params = [];
    Object.entries(F).forEach(([k,v]) => {
      if (!v || k==='q') return;
      const nk = k.replace(/([A-Z])/g, m => m.toLowerCase()) + "_norm";
      const quoted = `%22${encodeURIComponent(v)}%22`;
      params.push(`${nk}=eq.${quoted}`);
    });
    if (F.q){
      const cols = ['note_norm','cliente_norm','descrizione_norm','modello_norm','telefono_norm','numero_norm','email_norm','statopratica_norm'];
      const encVal = encodeURIComponent(F.q);
      const quoted = `%22${encVal}%22`;
      params.push(`or=(${cols.map(c => `${c}.eq.${quoted}`).join(',')})`);
    }
    params.push('order=dataArrivo.desc,created_at.desc,id.asc');
    return params.join('&');
  }
  (function lockSearchButton(){
    const btn = $("#btnDoSearch") || $$('button').find(b => /cerca/i.test(b.textContent||""));
    if (!btn || btn.__LOCKED_ONCE__) return;
    btn.__LOCKED_ONCE__ = true;
    let busy = false;
    btn.addEventListener('click', (e)=>{
      if (busy) { e.preventDefault(); e.stopPropagation(); return false; }
      busy = true;
      setTimeout(()=> busy=false, 400);
    }, true);
  })();
  (function installFetch(){
    if (window.__EXACT_V8_FETCH__) return;
    const ORIG = window.fetch.bind(window);
    const latest = { records: "", records_view: "" };
    window.fetch = async function(input, init={}){
      let url = typeof input === 'string' ? input : (input?.url || '');
      const method = (init?.method || (typeof input!=='string' ? input?.method : '') || 'GET').toUpperCase();
      const m = url.match(/\/rest\/v1\/(records|records_view)\b/i);
      const endpoint = m ? m[1].toLowerCase() : null;
      if (method === 'GET' && endpoint && /[?&]select=/.test(url)){
        const F = readFilters();
        const fp = filtersFingerprint(F);
        latest[endpoint] = fp;
        const sep = url.includes('?') ? '&' : '?';
        const add = buildServerParams(F);
        if (add) url = `${url}${sep}${add}`;
        arguments[0] = url;
        const res = await ORIG.apply(this, arguments).catch(err => { throw err; });
        if (latest[endpoint] !== fp) {
          return new Response('[]', { status:200, headers:{'content-type':'application/json'} });
        }
        try {
          const clone = res.clone();
          const ct = clone.headers.get('content-type')||'';
          if (!/application\/json/i.test(ct)) return res;
          const data = await clone.json();
          if (!Array.isArray(data)) return res;
          let arr = data.filter(r => recordMatches(r, F));
          arr = dedupeById(arr);
          arr = stableSort(arr);
          const body = JSON.stringify(arr);
          const headers = new Headers(res.headers);
          headers.set('content-length', String(body.length));
          return new Response(body, { status:200, headers });
        } catch(e){
          return res;
        }
      }
      return ORIG.apply(this, arguments);
    };
    window.__EXACT_V8_FETCH__ = true;
  })();
  (function installRPC(){
    const sb = window.supabase;
    if (!sb || !sb.rpc || window.__EXACT_V8_RPC__) return;
    const ORIG = sb.rpc.bind(sb);
    window.supabase.rpc = async function(fn, params){
      const out = await ORIG(fn, params);
      try{
        if (/^search_records_exact_all/i.test(fn) && out?.data && Array.isArray(out.data)){
          const F = readFilters();
          let arr = out.data.filter(r => recordMatches(r, F));
          arr = dedupeById(arr);
          arr = stableSort(arr);
          out.data = arr;
        }
      }catch(e){}
      return out;
    };
    window.__EXACT_V8_RPC__ = true;
  })();
})();
