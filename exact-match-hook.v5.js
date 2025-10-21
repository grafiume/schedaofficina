
/*!
 * exact-match-hook.v5.js
 * Applica la DINAMICA "match esatto" (case-insensitive, spazi normalizzati)
 * a TUTTE le ricerche: generale e filtri tecnici.
 *
 * Richiede lo schema SQL "exact-match-normalized.sql" già applicato (colonne *_norm).
 */
(function(){
  const LOG = "[exact-v5]";
  const norm = v => String(v||"").toLowerCase().trim().replace(/\s+/g, " ");
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // 1) Colleziona i valori dei filtri dal DOM
  function readFilters(){
    const out = {};

    // Generale (#q)
    const q = $("#q")?.value || "";
    out.q = norm(q);

    // Box Filtri tecnici (singoli)
    const box = (function(){
      const all = $$('div,section,form');
      return all.find(el => /Filtri tecnici\s*\(singoli\)/i.test(el.textContent||""));
    })();
    if (box){
      // Mappa label -> colonna *_norm
      // Nota: adattiamo label italiane comuni al tuo index
      const map = [
        { re:/batt\.*\s*collettore/i, col:"battcollettore_norm" },
        { re:/lunghezza\s*asse/i,     col:"lunghezzaasse_norm" },
        { re:/lunghezza\s*pacco/i,    col:"lunghezzapacco_norm" },
        { re:/larghezza\s*pacco/i,    col:"larghezzapacco_norm" },
        { re:/punta/i,                col:"punta_norm" },
        { re:/^n\.?$/i,               col:"numpunte_norm" },
        { re:/stato/i,                col:"statopratica_norm" },
        { re:/note/i,                 col:"note_norm", id:"#filterNoteExact" }, // se presente
      ];

      // Se c'è il campo "Note (match esatto)" aggiunto da noi
      const noteExact = $("#filterNoteExact")?.value || "";
      if (noteExact) out['note_norm'] = norm(noteExact);

      // Scansiona label+controllo nel box
      const labels = $$('label', box);
      labels.forEach(lab => {
        const text = (lab.textContent||"").trim();
        const input = lab.querySelector('input,select,textarea');
        const val = input ? norm(input.value) : "";
        if (!val) return;
        for (const m of map){
          if (m.re.test(text)) {
            out[m.col] = val;
            break;
          }
        }
      });
    }

    // Campi rapidi sulla barra (cliente, numero, telefono, ecc.) se presenti
    const quick = [
      { sel:'#fCliente',      col:'cliente_norm' },
      { sel:'#fNumero',       col:'numero_norm' },
      { sel:'#fTelefono',     col:'telefono_norm' },
      { sel:'#fEmail',        col:'email_norm' },
      { sel:'#fDescrizione',  col:'descrizione_norm' },
      { sel:'#fModello',      col:'modello_norm' },
      { sel:'#fNote',         col:'note_norm' },
    ];
    quick.forEach(q => {
      const el = $(q.sel); if (!el) return;
      const v = norm(el.value); if (v) out[q.col] = v;
    });

    return out;
  }

  // 2) Costruisce una stringa or=() di PostgREST per la ricerca generale su più colonne
  function buildOrParamForQ(q){
    if (!q) return "";
    const cols = [
      'note_norm','cliente_norm','descrizione_norm','modello_norm',
      'telefono_norm','numero_norm','email_norm','statopratica_norm'
    ];
    // or=(col.eq."val",col.eq."val"...)
    const encVal = encodeURIComponent(q);
    const quoted = `%22${encVal}%22`; // "val"
    const parts = cols.map(c => `${c}.eq.${quoted}`);
    return `or=(${parts.join(',')})`;
  }

  // 3) Hook supabase.from().select()
  function installFromHook(){
    const sb = window.supabase;
    if (!sb || !sb.from || window.__EXACT_FROM_V5__) return !!sb;
    const originalFrom = sb.from.bind(sb);
    sb.from = function(table){
      const qb = originalFrom(table);
      if (!/^(records|records_view)$/i.test(table||"")) return qb;
      const originalSelect = qb.select?.bind(qb);
      if (!originalSelect) return qb;

      qb.select = function(){
        const q = originalSelect.apply(this, arguments);
        try{
          const f = readFilters();
          // filtri puntuali (eq su *_norm)
          Object.entries(f).forEach(([k,v]) => {
            if (!v) return;
            if (k.endsWith('_norm')) { q.eq && q.eq(k, v); }
          });
          // ricerca generale q → OR su più colonne
          if (f.q) {
            const cols = [
              'note_norm','cliente_norm','descrizione_norm','modello_norm',
              'telefono_norm','numero_norm','email_norm','statopratica_norm'
            ];
            if (q.or) {
              const clauses = cols.map(c => `${c}.eq."${f.q}"`).join(',');
              q.or(clauses);
            } else {
              // fallback: se l'SDK non ha .or(), non facciamo nulla qui (ci pensa fetch hook)
            }
          }
        }catch(e){ console.warn(LOG, 'from/select hook fail:', e); }
        return q;
      };
      return qb;
    };
    window.__EXACT_FROM_V5__ = true;
    console.log(LOG, "hook .from().select() attivo");
    return true;
  }

  // 4) Hook fetch REST /rest/v1/records|records_view
  function installFetchHook(){
    if (window.__EXACT_FETCH_V5__) return true;
    const ORIG = window.fetch.bind(window);
    window.fetch = function(input, init){
      try{
        let url = typeof input === 'string' ? input : (input?.url || '');
        const method = (init?.method || (typeof input!=='string' ? input?.method : '') || 'GET').toUpperCase();
        if (method === 'GET' && /\/rest\/v1\/(records|records_view)\b/i.test(url) && /[?&]select=/.test(url)){
          const f = readFilters();
          const params = [];

          // eq per ogni *_norm
          Object.entries(f).forEach(([k,v]) => {
            if (!v || !k.endsWith('_norm')) return;
            const quoted = `%22${encodeURIComponent(v)}%22`;
            params.push(`${k}=eq.${quoted}`);
          });

          // OR della ricerca generale
          if (f.q) params.push(buildOrParamForQ(f.q));

          if (params.length){
            const sep = url.includes('?') ? '&' : '?';
            url = url + sep + params.join('&');
            arguments[0] = url;
          }
        }
      }catch(e){ console.warn(LOG, 'fetch hook fail:', e); }
      return ORIG.apply(this, arguments);
    };
    window.__EXACT_FETCH_V5__ = true;
    console.log(LOG, "hook fetch REST attivo");
    return true;
  }

  // 5) Hook RPC: se usi search_records_exact_all*, post-filtra by *_norm
  function installRPCHook(){
    const sb = window.supabase;
    if (!sb || !sb.rpc || window.__EXACT_RPC_V5__) return !!sb;
    const orig = sb.rpc.bind(sb);
    sb.rpc = async function(fn, params){
      const res = await orig(fn, params);
      try{
        if (/^search_records_exact_all/i.test(fn) && res?.data && Array.isArray(res.data)){
          const f = readFilters();
          const arr = res.data;
          const ok = a => (a??'') !== '';
          const pass = r => {
            // filtri eq
            for (const [k,v] of Object.entries(f)){
              if (!v || !k.endsWith('_norm')) continue;
              const field = k.replace(/_norm$/, '');
              if (norm(r[field]) !== v) return false;
            }
            // q (ricerca generale) -> match su almeno un campo della lista
            if (f.q){
              const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica'];
              const any = cols.some(c => norm(r[c]) === f.q);
              if (!any) return false;
            }
            return true;
          };
          res.data = arr.filter(pass);
        }
      }catch(e){ console.warn(LOG, 'rpc hook fail:', e); }
      return res;
    };
    window.__EXACT_RPC_V5__ = true;
    console.log(LOG, "hook rpc() attivo");
    return true;
  }

  function init(){
    installFromHook();
    installFetchHook();
    installRPCHook();
    console.log(LOG, "pronto (usa il tuo UI normale).");
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else
    init();
})();
