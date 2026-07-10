// === ELIP TAGLIENTE • app.v25.js ===
// Thumb 144x144 con lazy-load + throttling & backoff (anti 429), overlay in pagina,
// Ricerca con filtri esatti, Nuova scheda con upload immagini (mobile OK),
// Salva scheda => ritorno automatico alla Home.

// ----------------- Helpers -----------------
let _creatingNew=false;
let _newGeneratedId=null;
let _newMainName=null;
(function(){
  if (typeof window.fmtIT !== 'function') {
    window.fmtIT = function(d){
      if(!d) return '';
      const s = String(d);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)){
        const [y,m,dd] = s.split('-');
        return [dd,m,y].join('/');
      }
      return s;
    };
  }
  if (typeof window.norm !== 'function') {
    window.norm = s => (s??'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }
  if (typeof window.statusOrder !== 'function') {
    window.statusOrder = s => { s=norm(s); if(s.includes('attesa'))return 1; if(s.includes('lavorazione'))return 2; if(s.includes('completata'))return 3; return 9; };
  }
  if (typeof window.byHomeOrder !== 'function') {
    window.byHomeOrder = (a,b)=>{
      // Ordine principale: dataApertura desc
      const da = String(b.dataApertura||'').localeCompare(String(a.dataApertura||''));
      if (da !== 0) return da;
      // Secondario: stato
      return window.statusOrder(a.statoPratica) - window.statusOrder(b.statoPratica);
    };
  }
})();


function parseDateLoose(v){
  if(!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function daysDiffFromToday(v){
  const d = parseDateLoose(v);
  if(!d) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  return Math.round((d.getTime()-now.getTime())/86400000);
}
function daysSince(v){
  const d = parseDateLoose(v);
  if(!d) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  return Math.round((now.getTime()-d.getTime())/86400000);
}
function emptyQuoteInfo(){
  return { quoteId:null, status:'', accepted:false, sent:false, urgent:false, sentAt:null, acceptedAt:null };
}
async function refreshQuoteCache(){
  window.state.quoteMap = {};
  if(!sb) return;
  try{
    const { data, error } = await sb
      .from('quotes')
      .select('id,record_id,status,accepted_at,sent_at,is_urgent,created_at')
      .limit(1000);
    if(error){ console.warn('refreshQuoteCache error', error); return; }

    function rank(row){
      const st = String(row?.status || '').toUpperCase();
      if (st === 'ACCETTATO' || row?.accepted_at) return 4;
      if (st === 'INVIATO' || row?.sent_at) return 3;
      if (st === 'BOZZA') return 2;
      return 1;
    }

    for(const row of (data || [])){
      const key = row.record_id;
      if(!key) continue;
      const prev = window.state.quoteMap[key];
      if(!prev || rank(row) > rank(prev)) window.state.quoteMap[key] = row;
    }
  }catch(e){
    console.warn('refreshQuoteCache failed', e);
  }
}
function getQuoteInfo(recordId){
  const row = window.state?.quoteMap?.[recordId];
  if(!row) return emptyQuoteInfo();
  const status = String(row.status || '').toUpperCase();
  return {
    quoteId: row.id || null,
    status,
    accepted: status === 'ACCETTATO' || !!row.accepted_at,
    sent: status === 'INVIATO' || !!row.sent_at,
    urgent: !!row.is_urgent,
    sentAt: row.sent_at || null,
    acceptedAt: row.accepted_at || null
  };
}
function enrichPriority(record, qinfo){
  const q = qinfo || emptyQuoteInfo();
  let score = 0;
  const reasons = [];
  const stato = String(record?.statoPratica || '');

  const importo = Number(record?.importoConcordato || 0);
  if (importo > 0){
    score += 85;
    reasons.push('Importo concordato');
  } else if (q.accepted){
    score += 80;
    reasons.push('Preventivo accettato');
  } else if (q.sent){
    score += 35;
    reasons.push('Preventivo inviato');
  } else {
    score += 10;
    reasons.push('Da definire');
  }

  if (norm(stato).includes('lavorazione')){
    score += 15;
    reasons.push('In lavorazione');
  }

  const dueDays = daysDiffFromToday(record?.dataScadenza);
  if (dueDays !== null){
    if (dueDays < 0){ score += 35; reasons.push('Scadenza superata'); }
    else if (dueDays <= 2){ score += 25; reasons.push('Scadenza vicina'); }
    else if (dueDays <= 5){ score += 12; reasons.push('Scadenza prossima'); }
  }

  const ageDays = daysSince(record?.dataApertura);
  if (ageDays !== null){
    if (ageDays >= 20){ score += 20; reasons.push('Aperta da 20+ giorni'); }
    else if (ageDays >= 15){ score += 15; reasons.push('Aperta da 15+ giorni'); }
    else if (ageDays >= 10){ score += 10; reasons.push('Aperta da 10+ giorni'); }
    else if (ageDays >= 5){ score += 5; reasons.push('Aperta da 5+ giorni'); }
  }

  const completed = norm(stato).includes('completata');
  let label = 'BASSA', cls = 'prio-bassa';
  if (!completed && score >= 70){ label = 'ALTA'; cls = 'prio-alta'; }

  return {
    priorita_score: completed ? -9999 : score,
    priorita_label: label,
    priorita_class: cls,
    priorita_title: reasons.join(' • ')
  };
}
function byPriorityHomeOrder(a,b){
  return byHomeOrder(a,b);
}
function getPClassFromQuoteInfo(qinfo, statoLavoro){
  if (!qinfo || !qinfo.quoteId) return 'p-gray';
  if (qinfo.accepted) {
    if (String(statoLavoro || '') === 'Completata') return 'p-green';
    if (String(statoLavoro || '') === 'In lavorazione') return 'p-orange';
    return 'p-blue';
  }
  if (qinfo.sent) return 'p-yellow';
  return 'p-gray';
}
function getPTitleFromQuoteInfo(qinfo, statoLavoro){
  if (!qinfo || !qinfo.quoteId) return 'Preventivo non inviato';
  if (qinfo.accepted) {
    if (String(statoLavoro || '') === 'Completata') return 'Preventivo accettato • lavoro chiuso';
    if (String(statoLavoro || '') === 'In lavorazione') return 'Preventivo accettato • in lavorazione';
    return 'Preventivo accettato';
  }
  if (qinfo.sent) return 'Preventivo inviato';
  return 'Preventivo presente';
}
function buildQuoteBadge(record){
  const qinfo = getQuoteInfo(record.id);
  const hasImporto = Number(record?.importoConcordato || 0) > 0;
  const hasAccepted = !!(qinfo && qinfo.accepted);
  const hasSent = !!(qinfo && qinfo.sent);

  const span = document.createElement('span');
  let badgeClass = 'p-gray';
  let badgeTitle = 'Preventivo non inviato';

  if (hasImporto || hasAccepted) {
    badgeClass = 'p-green';
    badgeTitle = 'Preventivo accettato';
  } else if (hasSent) {
    badgeClass = 'p-yellow';
    badgeTitle = 'Preventivo inviato';
  }

  span.className = 'badge-p ' + badgeClass;
  span.title = badgeTitle;
  span.setAttribute('aria-label', badgeTitle);
  span.textContent = 'P';
  span.style.cursor = 'pointer';
  span.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const forced = record?.importoConcordato || document.getElementById('eImportoConcordato')?.value || null;
    if (forced) {
      try{
        await syncAutoQuoteForRecord(Object.assign({}, record, { importoConcordato: forced }), forced);
        await refreshQuoteCache();
      }catch(e){}
    }
    const fresh = getQuoteInfo(record.id);
    if (fresh && fresh.quoteId) {
      try{
        const url = 'preventivo.html?id=' + encodeURIComponent(fresh.quoteId) + '&preview_pdf=1';
        window.open(url, 'previewPreventivoPdf', 'popup=yes,width=1500,height=980,resizable=yes,scrollbars=yes');
      }catch(e){
        location.href = 'preventivo.html?id=' + encodeURIComponent(fresh.quoteId);
      }
    } else {
      alert('Preventivo non disponibile');
    }
  });
  return span;
}
function buildPriorityBadge(record){
  const qinfo = getQuoteInfo(record.id);
  const hasEconomicOk = (Number(record?.importoConcordato || 0) > 0) || !!(qinfo && qinfo.accepted);
  if (!hasEconomicOk) return document.createTextNode('');
  const span = document.createElement('span');
  span.className = 'econ-dot';
  span.title = Number(record?.importoConcordato || 0) > 0 ? 'Importo pattuito' : 'Preventivo accettato';
  return span;
}

function show(id){
  ['page-home','page-search','page-edit'].forEach(pid=>{
    const el=document.getElementById(pid); if(el) el.classList.add('d-none');
  });
  const tgt=document.getElementById(id); if(tgt) tgt.classList.remove('d-none');
  window.state.currentView=id.replace('page-','');
}
if (typeof window.state !== 'object'){ window.state={ all:[], currentView:'home', editing:null }; }


// ----------------- Auth UI / sessione -----------------
let _authModal = null;
let _authReadyPromise = null;

function getLoginReturnUrl(){
  try{
    const u = new URL(location.href);
    u.searchParams.delete('returnTo');
    return u.pathname + u.search;
  }catch(_e){
    return 'index.html';
  }
}
function getStoredEmail(){ try{ return localStorage.getItem('elip_last_email') || ''; }catch(_e){ return ''; } }
function setStoredEmail(v){ try{ if(v) localStorage.setItem('elip_last_email', v); }catch(_e){} }

async function getCurrentSessionSafe(){
  if(!sb || !sb.auth) return null;
  try{
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  }catch(_e){
    return null;
  }
}

function updateAuthButtons(session){
  const btnOpen = document.getElementById('btnAuthOpen');
  const btnLogout = document.getElementById('btnLogout');
  const hint = document.getElementById('authUserHint');
  const isLogged = !!(session?.user?.email);

  if(btnOpen) btnOpen.classList.toggle('d-none', isLogged);
  if(btnLogout) btnLogout.classList.toggle('d-none', !isLogged);
  if(hint) hint.textContent = isLogged ? 'Sessione attiva' : 'Nessuna sessione attiva';
}

function getAuthModal(){
  const el = document.getElementById('authModal');
  if(!el || typeof bootstrap === 'undefined') return null;
  if(!_authModal) _authModal = new bootstrap.Modal(el, { backdrop:'static', keyboard:false });
  return _authModal;
}

function showAuthError(msg){
  const el = document.getElementById('authErr');
  if(!el) return;
  if(msg){
    el.textContent = msg;
    el.classList.remove('d-none');
  }else{
    el.textContent = '';
    el.classList.add('d-none');
  }
}

async function openAuthModal(forceOpen=false){
  const modal = getAuthModal();
  if(!modal) return;
  const emailEl = document.getElementById('authEmail');
  const passEl = document.getElementById('authPassword');
  if(emailEl && !emailEl.value) emailEl.value = getStoredEmail();
  if(passEl) passEl.value = '';
  showAuthError('');
  if(forceOpen) modal.show();
  else modal.show();
}

async function doAuthLogin(){
  const email = (document.getElementById('authEmail')?.value || '').trim();
  const password = document.getElementById('authPassword')?.value || '';
  if(!email || !password){
    showAuthError('Inserisci email e password.');
    return false;
  }
  try{
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw error;
    setStoredEmail(email);
    updateAuthButtons(data?.session || null);
    getAuthModal()?.hide();
    await window.loadAll();
    return true;
  }catch(e){
    showAuthError('Login non riuscito: ' + (e?.message || e));
    return false;
  }
}

async function requireAuthenticatedSession(){
  const session = await getCurrentSessionSafe();
  updateAuthButtons(session);
  if(session) return session;
  await openAuthModal(true);
  return null;
}

// ----------------- Supabase -----------------
if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
  console.warn('config.js mancante o variabili non definite');
}
const sb = (typeof supabase!=='undefined')
  ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

// ----------------- Storage helpers -----------------
const bucket='photos';
const _pubUrlCache=new Map();
function publicUrl(path){ const {data}=sb.storage.from(bucket).getPublicUrl(path); return data?.publicUrl||''; }
function publicUrlCached(path){ if(_pubUrlCache.has(path)) return _pubUrlCache.get(path); const u=publicUrl(path); _pubUrlCache.set(path,u); return u; }

// Throttling queue per evitare 429
const REQ_QUEUE = [];
let ACTIVE = 0;
const MAX_CONCURRENCY = 2;          // al massimo 2 richieste contemporanee
const MIN_SPACING_MS = 160;         // spaziatura tra job per non saturare
function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function runQueue(){
  if (ACTIVE >= MAX_CONCURRENCY) return;
  const job = REQ_QUEUE.shift();
  if (!job) return;
  ACTIVE++;
  try { await job(); }
  finally {
    ACTIVE--;
    // leggero spacing tra job
    setTimeout(runQueue, MIN_SPACING_MS);
  }
}
function enqueue(fn){
  REQ_QUEUE.push(fn);
  runQueue();
}

// list con retry/backoff se 429
async function listPhotosFromPrefix(prefix){
  let attempt = 0;
  while (attempt < 4){
    const { data, error } = await sb.storage.from(bucket).list(prefix, {limit:200, sortBy:{column:'name', order:'asc'}});
    if (!error) return (data||[]).map(x => prefix + x.name);
    // se 429 o rete, backoff
    const msg = (error?.message || '').toLowerCase();
    const status = error?.status || 0;
    if (status === 429 || msg.includes('too many') || msg.includes('rate')){
      await delay(400 + attempt*600);
      attempt++;
      continue;
    }
    // altri errori -> stop
    return [];
  }
  return [];
}

// Try multiple layouts + table fallback (con queue)
const FIRST_PHOTO_CACHE = new Map(); // recordId -> url (o '' se nessuna)
function getThumbUrl(recordId){
  // Se in cache, immediato
  if (FIRST_PHOTO_CACHE.has(recordId)) return Promise.resolve(FIRST_PHOTO_CACHE.get(recordId));

  // Promise di risoluzione che usa la queue con backoff
  return new Promise((resolve)=>{
    enqueue(async ()=>{
      // 1) new layout
      let p = await listPhotosFromPrefix(`records/${recordId}/`);
      if (!p.length){
        // 2) old layout
        p = await listPhotosFromPrefix(`${recordId}/`);
      }
      if (!p.length){
        // 3) fallback tabella
        try{
          const { data, error } = await sb.from('photos')
            .select('path, created_at')
            .eq('record_id', recordId)
            .order('created_at', { ascending:true })
            .limit(1);
          if (!error && data && data.length) p = [data[0].path];
        }catch{}
      }
      const url = p.length ? publicUrlCached(p[0]) : '';
      FIRST_PHOTO_CACHE.set(recordId, url);
      resolve(url);
    });
  });
}

// Lazy-load con IntersectionObserver
const IO = ('IntersectionObserver' in window)
  ? new IntersectionObserver((entries)=>{
      entries.forEach(en=>{
        if (en.isIntersecting){
          const img = en.target;
          IO.unobserve(img);
          const recordId = img.getAttribute('data-rec');
          if (!recordId) return;
          getThumbUrl(recordId).then(url=>{
            if (url){
              img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
              img.src = url;
              img.addEventListener('click', ()=>openLightbox(url));
            } else {
              img.alt = '—';
            }
          });
        }
      });
    }, { rootMargin: '200px 0px' })
  : null;

function mountLazyThumb(imgEl, recordId){
  imgEl.setAttribute('data-rec', recordId);
  if (IO) IO.observe(imgEl);
  else {
    // fallback senza IO: carica comunque con queue
    getThumbUrl(recordId).then(url=>{
      if (url){
        imgEl.decoding='async'; imgEl.loading='lazy'; imgEl.fetchPriority='low';
        imgEl.src = url;
        imgEl.addEventListener('click', ()=>openLightbox(url));
      } else {
        imgEl.alt = '—';
      }
    });
  }
}

// ----------------- Overlay (single) -----------------
(function initOverlay(){
  const overlay = document.getElementById('imgOverlay');
  const img = document.getElementById('imgOverlayImg');
  if (!overlay || !img) return;
  const btn = overlay.querySelector('.closeBtn');
  function close(){ overlay.classList.remove('open'); img.removeAttribute('src'); }
  btn?.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close(); });
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });
  window.__openOverlay = function(url){ img.src = url; overlay.classList.add('open'); };
})();
function openLightbox(url){
  if (typeof window.__openOverlay === 'function') window.__openOverlay(url);
  else { try{ window.location.assign(url); } catch(e){ window.location.href = url; } }
}


function parseImporto(v){
  if(v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if(!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function isImportoColumnError(error){
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('importoconcordato') && (msg.includes('does not exist'));
}
async function createOrUpdateAutoQuoteItems(quoteId, amount){
  const noteText = 'Riparazione come da importo concordato';
  try { await sb.from('quote_items').delete().eq('quote_id', quoteId); } catch(e) {}

  const candidates = [
    { quote_id: quoteId, position:0, rip_code:'RIP00', description:noteText, qty:1, unit_price_ex_vat:amount, line_total_ex_vat:amount, line_progress_percent:0, work_status:'DA_FARE' },
    { quote_id: quoteId, code:'RIP00', description:noteText, qty:1, unit_price:amount, line_total:amount },
    { quote_id: quoteId, codice:'RIP00', descrizione:noteText, quantita:1, prezzo:amount, totale:amount },
    { quote_id: quoteId, sku:'RIP00', description:noteText, quantity:1, unit_price:amount, total:amount },
    { quote_id: quoteId, item_code:'RIP00', descrizione:noteText, qta:1, prezzo_unitario:amount, totale_riga:amount }
  ];

  for(const payload of candidates){
    try{
      const { error } = await sb.from('quote_items').insert(payload);
      if(!error) return true;
    }catch(e){}
  }
  return false;
}



async function autoCreateRip00QuoteViaRpc(recordId, amount, acceptedAt){
  try{
    const { data, error } = await sb.rpc('auto_create_rip00_quote', {
      p_record_id: recordId,
      p_amount: amount,
      p_accepted_at: acceptedAt
    });
    if(error) return null;
    return data || null;
  }catch(e){
    return null;
  }
}

async function syncAutoQuoteForRecord(record, forcedAmount){
  if(!sb || !record?.id) return null;

  const amount = parseImporto(forcedAmount != null ? forcedAmount : record.importoConcordato);
  if(!(amount > 0)) return null;

  const acceptedAt = record.dataApertura || new Date().toISOString().slice(0,10);

  const rpcQuoteId = await autoCreateRip00QuoteViaRpc(record.id, amount, acceptedAt);
  if(rpcQuoteId){
    try{ await refreshQuoteCache(); }catch(e){}
    return rpcQuoteId;
  }

  const autoNote = '[AUTO_RIP00] Creato automaticamente da importo concordato';
  const lineText = 'Riparazione come da importo concordato';
  const vatRate = 22;
  const vatTotal = +(amount * (vatRate/100)).toFixed(2);
  const grandTotal = +(amount + vatTotal).toFixed(2);

  let rows = [];
  try{
    const res = await sb
      .from('quotes')
      .select('id,record_id,status,notes,subtotal_ex_vat,accepted_at,created_at')
      .eq('record_id', record.id)
      .order('created_at', { ascending:false })
      .limit(20);
    if(res.error) throw res.error;
    rows = res.data || [];
  }catch(e){
    console.warn('lookup quotes failed', e);
    return null;
  }

  let autoQuote = rows.find(x => String(x.notes || '').includes('[AUTO_RIP00]')) || null;
  let quoteId = autoQuote?.id || null;

  const manual = rows.find(x => !String(x.notes || '').includes('[AUTO_RIP00]'));
  if(manual){
    let manualItems = [];
    try{
      const itemsRes = await sb
        .from('quote_items')
        .select('id,rip_code,description,unit_price_ex_vat,line_total_ex_vat,qty')
        .eq('quote_id', manual.id)
        .limit(20);
      manualItems = itemsRes.data || [];
    }catch(e){}

    const hasManualItems = manualItems.some(it =>
      Number(it?.line_total_ex_vat || 0) > 0 ||
      Number(it?.unit_price_ex_vat || 0) > 0 ||
      Number(it?.qty || 0) > 1 ||
      !!String(it?.description || '').trim() ||
      !!String(it?.rip_code || '').trim()
    );
    const hasManualHeader =
      Number(manual?.subtotal_ex_vat || 0) > 0 ||
      !!String(manual?.accepted_at || '').trim() ||
      !!String(manual?.notes || '').trim();

    if(hasManualItems || hasManualHeader) return manual.id || null;

    quoteId = manual.id;
  }

  const quotePayload = {
    record_id: record.id,
    status: 'ACCETTATO',
    accepted_at: acceptedAt,
    sent_at: acceptedAt,
    notes: autoNote,
    subtotal_ex_vat: amount,
    vat_rate: vatRate,
    vat_total: vatTotal,
    grand_total: grandTotal,
    progress_percent: 0
  };

  if(quoteId){
    try{
      const upd = await sb.from('quotes').update(quotePayload).eq('id', quoteId);
      if(upd.error) throw upd.error;
    }catch(e){
      console.warn('update auto quote failed', e);
      return null;
    }
  } else {
    try{
      const ins = await sb.from('quotes').insert(quotePayload).select('id').single();
      if(ins.error || !ins.data?.id){
        console.warn('create auto quote failed', ins.error);
        return null;
      }
      quoteId = ins.data.id;
    }catch(e){
      console.warn('create auto quote exception', e);
      return null;
    }
  }

  try{
    await sb.from('quote_items').delete().eq('quote_id', quoteId);
  }catch(e){}

  try{
    const itemPayload = {
      quote_id: quoteId,
      position: 0,
      rip_code: 'RIP00',
      description: lineText,
      qty: 1,
      unit_price_ex_vat: amount,
      line_total_ex_vat: amount,
      line_progress_percent: 0,
      work_status: 'DA_FARE'
    };
    const insItem = await sb.from('quote_items').insert(itemPayload);
    if(insItem.error){
      console.warn('create quote item failed', insItem.error);
      return quoteId;
    }
  }catch(e){
    console.warn('create quote item exception', e);
    return quoteId;
  }

  try{ await refreshQuoteCache(); }catch(e){}
  return quoteId;
}

// ----------------- KPI + Home render -----------------
function getAttesaRows(rows){
  return (rows || []).filter(r => norm(r.statoPratica).includes('attesa'));
}
function getAttesaAgeDays(record){
  return daysSince(record?.dataArrivo || record?.dataApertura);
}
function getAttesaBucket(record){
  const d = getAttesaAgeDays(record);
  if(d === null || d <= 7) return '0_7';
  if(d <= 15) return '8_15';
  return 'over15';
}
function renderDashboardAttese(rows){
  try{
    const attese = getAttesaRows(rows);
    const b07 = attese.filter(r => getAttesaBucket(r) === '0_7').length;
    const b815 = attese.filter(r => getAttesaBucket(r) === '8_15').length;
    const over15 = attese.filter(r => getAttesaBucket(r) === 'over15').length;
    const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    set('dashAttTot', attese.length);
    set('dashAtt07', b07);
    set('dashAtt815', b815);
    set('dashAttOver15', over15);
  }catch(e){ console.warn('renderDashboardAttese failed', e); }
}
function renderKPIs(rows){
  try{
    const tot=rows.length;
    const att=rows.filter(r=>norm(r.statoPratica).includes('attesa')).length;
    const lav=rows.filter(r=>norm(r.statoPratica).includes('lavorazione')).length;
    const comp=rows.filter(r=>norm(r.statoPratica).includes('completata')).length;
    const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    set('kpiTot',tot); set('kpiAttesa',att); set('kpiLav',lav); set('kpiComp',comp);
    renderDashboardAttese(window.state?.all || rows);
  }catch{}
}
function filterAtteseByBucket(bucket){
  const all = window.state?.all || [];
  let rows = getAttesaRows(all);
  if(bucket){ rows = rows.filter(r => getAttesaBucket(r) === bucket); }
  renderHome(rows);
  show('page-home');
}
function appendClosedStatusDetails(td, record){
  const b=document.createElement('span');
  b.className='badge badge-chiusa d-inline-block mt-1';
  b.textContent='Chiusa';
  td.appendChild(document.createElement('br'));
  td.appendChild(b);

  if(record?.dataChiusura){
    const date=document.createElement('div');
    date.className='small text-muted mt-1';
    date.textContent=fmtIT(record.dataChiusura);
    td.appendChild(date);
  }
}

window.renderHome=function(rows){
  const tb=document.getElementById('homeRows'); if(!tb) return;
  tb.innerHTML=''; renderKPIs(rows);
  (rows||[]).sort(byHomeOrder).forEach(r=>{
    const tr=document.createElement('tr');

    const tdFoto=document.createElement('td'); tdFoto.className='thumb-cell';
    const img=document.createElement('img'); img.className='thumb thumb-home'; img.alt='';
    tdFoto.appendChild(img); tr.appendChild(tdFoto);

    const tdData=document.createElement('td'); tdData.textContent=fmtIT(r.dataApertura); tr.appendChild(tdData);
    const tdCassetto=document.createElement('td'); tdCassetto.textContent=r.cassetto??''; tr.appendChild(tdCassetto);

    const tdCliente=document.createElement('td');
    tdCliente.textContent=r.cliente??'';
    tdCliente.appendChild(buildQuoteBadge(r));
    tr.appendChild(tdCliente);

    const tdDesc=document.createElement('td'); tdDesc.textContent=r.descrizione??''; tr.appendChild(tdDesc);
    const tdMod=document.createElement('td'); tdMod.textContent=r.modello??''; tr.appendChild(tdMod);

    const tdStato=document.createElement('td');
    const closed=norm(r.statoPratica).includes('completata');
    const statoTxt=document.createElement('span'); statoTxt.textContent=(r.statoPratica??'');
    tdStato.appendChild(statoTxt);
    if(closed) appendClosedStatusDetails(tdStato, r);
    tr.appendChild(tdStato);

    const tdAz=document.createElement('td'); tdAz.className='text-end';
    const btn=document.createElement('button'); btn.className='btn btn-sm btn-outline-primary'; btn.type='button'; btn.textContent='Apri';
    btn.addEventListener('click',()=>openEdit(r.id)); tdAz.appendChild(btn); tr.appendChild(tdAz);

    tb.appendChild(tr);

    // Miniatura: lazy + queue (anti 429)
    mountLazyThumb(img, r.id);
  });
  if(!rows?.length){ tb.innerHTML='<tr><td colspan="8" class="text-center text-muted py-4">Nessun record</td></tr>'; }
};

// ----------------- Ricerca -----------------
function getSearchFilters(){
  return {
    q: document.getElementById('q').value.trim(),
    cassetto: (document.getElementById('cassettoSearch')?.value || document.getElementById('fCassetto')?.value || '').trim(),
    noteExact: document.getElementById('noteExact')?.value.trim() || '',
    batt: document.getElementById('fBatt').value.trim(),
    asse: document.getElementById('fAsse')?.value.trim() || '',
    pacco: document.getElementById('fPacco')?.value.trim() || '',
    larg: document.getElementById('fLarg')?.value.trim() || '',
    punta: document.getElementById('fPunta')?.value.trim() || '',
    np: document.getElementById('fNP')?.value.trim() || '',
  };
}
function toNum(val){ if(val==null) return null; const s=String(val).trim().replace(',', '.'); if(s==='') return null; const n=Number(s); return Number.isFinite(n)?n:null; }
function isNumEq(fv, rv){ if(fv==null || String(fv).trim()==='') return true; const f=toNum(fv), r=toNum(rv); if(f===null||r===null) return false; return f===r; }
function matchRow(r,f){
  if(f.q){
    const hay=[r.cassetto,r.descrizione,r.modello,r.cliente,r.telefono,r.docTrasporto].map(norm).join(' ');
    const tokens=norm(f.q).split(/\s+/).filter(Boolean);
    for(const t of tokens){ if(!hay.includes(t)) return false; }
  }
  if(f.cassetto && norm(r.cassetto)!==norm(f.cassetto)) return false;
  if(f.noteExact){
    const noteWords = new Set(norm(r.note).split(/[^a-z0-9]+/).filter(Boolean));
    const noteTokens = norm(f.noteExact).split(/[^a-z0-9]+/).filter(Boolean);
    if(!noteTokens.length) return false;
    for(const t of noteTokens){ if(!noteWords.has(t)) return false; }
  }
  if(!isNumEq(f.batt,r.battCollettore)) return false;
  if(!isNumEq(f.asse,r.lunghezzaAsse)) return false;
  if(!isNumEq(f.pacco,r.lunghezzaPacco)) return false;
  if(!isNumEq(f.larg,r.larghezzaPacco)) return false;
  if(f.punta && norm(f.punta)!==norm(r.punta)) return false;
  if(!isNumEq(f.np,r.numPunte)) return false;
  return true;
}
function doSearch(){
  const f=getSearchFilters();
  const rows=(window.state.all||[]).filter(r=>matchRow(r,f)).sort(byHomeOrder);
  const tb=document.getElementById('searchRows'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');

    const tdFoto=document.createElement('td'); tdFoto.className='thumb-cell';
    const img=document.createElement('img'); img.className='thumb thumb-home'; img.alt='';
    tdFoto.appendChild(img); tr.appendChild(tdFoto);

    const tdData=document.createElement('td'); tdData.textContent=fmtIT(r.dataApertura); tr.appendChild(tdData);
    const tdCassetto=document.createElement('td'); tdCassetto.textContent=r.cassetto??''; tr.appendChild(tdCassetto);

    const tdCliente=document.createElement('td');
    tdCliente.textContent=r.cliente??'';
    tdCliente.appendChild(buildQuoteBadge(r));
    tr.appendChild(tdCliente);

    const tdDesc=document.createElement('td'); tdDesc.textContent=r.descrizione??''; tr.appendChild(tdDesc);
    const tdMod=document.createElement('td'); tdMod.textContent=r.modello??''; tr.appendChild(tdMod);

    const tdStato=document.createElement('td');
    const closed=norm(r.statoPratica).includes('completata');
    const statoTxt=document.createElement('span'); statoTxt.textContent=(r.statoPratica??'');
    tdStato.appendChild(statoTxt);
    if(closed) appendClosedStatusDetails(tdStato, r);
    tr.appendChild(tdStato);

    const tdAz=document.createElement('td'); tdAz.className='text-end';
    const btn=document.createElement('button'); btn.className='btn btn-sm btn-outline-primary'; btn.type='button'; btn.textContent='Apri';
    btn.addEventListener('click',()=>openEdit(r.id)); tdAz.appendChild(btn); tr.appendChild(tdAz);

    tb.appendChild(tr);

    // Miniatura: lazy + queue (anti 429)
    mountLazyThumb(img, r.id);
  });
  if(!rows.length){ tb.innerHTML='<tr><td colspan="8" class="text-center text-muted py-4">Nessun risultato</td></tr>'; }
}

// ----------------- Gallery (Edit) -----------------
async function uploadFiles(recordId, files, mainName){
  const prefix=`records/${recordId}/`;
  const uploadedPaths=[];
  return (async ()=>{
    for (const f of files){
      const safe = Date.now()+'_'+f.name.replace(/[^a-z0-9_.-]+/gi,'_');
      const path = prefix+safe;
      const { error } = await sb.storage.from(bucket).upload(path, f, { upsert:false });
      if(error){ alert('Errore upload: '+error.message); return false; }
      uploadedPaths.push(path);
    }
    FIRST_PHOTO_CACHE.delete(recordId);
    try{
      if(mainName){
        const cleaned = mainName.replace(/[^a-z0-9_.-]+/gi,'_').toLowerCase();
        const cand = uploadedPaths.find(p => p.toLowerCase().endswith(cleaned)) || uploadedPaths[0];
        if(cand){
          const url = publicUrlCached(cand);
          await sb.from('records').update({ image_url: url }).eq('id', recordId);
        }
      }
    }catch(e){ console.warn('Impostazione image_url fallita', e); }
    return true;
  })();
}

async function setMainPhoto(recordId, path){
  try{
    const url = publicUrlCached(path);
    const { error } = await sb.from('records').update({ image_url: url }).eq('id', recordId);
    if(error){ alert('Errore impostazione foto principale: '+error.message); return; }
    try{
      if(window.state && window.state.editing && window.state.editing.id===recordId){
        window.state.editing.image_url = url;
      }
    }catch{}
    const stars = document.querySelectorAll('.btn-main-photo');
    stars.forEach(btn=>{
      const p = btn.getAttribute('data-path');
      btn.textContent = (p === path) ? '★' : '☆';
      btn.classList.toggle('active', p === path);
    });
  }catch(e){ console.warn('setMainPhoto failed', e); }
}

async function refreshGallery(recordId){
  const gallery=document.getElementById('gallery');
  const prev=document.querySelector('.img-preview');
  if(gallery) gallery.innerHTML=''; if(prev) prev.innerHTML='';

  // per non stressare lo storage, usa la stessa getThumbUrl (queue + cache) per la prima
  const firstUrl = await getThumbUrl(recordId);
  if(prev){
    if(firstUrl){
      const img0=new Image();
      img0.alt='Anteprima'; img0.decoding='async'; img0.loading='eager'; img0.fetchPriority='high';
      img0.src=firstUrl; prev.appendChild(img0);
      img0.addEventListener('click',()=>openLightbox(firstUrl));
    } else {
      prev.textContent='Nessuna immagine disponibile';
    }
  }

  // carica l’elenco completo (qui una sola richiesta, già con retry/backoff)
  let paths = await listPhotosFromPrefix(`records/${recordId}/`);
  if (!paths.length) paths = await listPhotosFromPrefix(`${recordId}/`);
  if (!paths.length){
    try{
      const { data } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at',{ascending:true});
      if (data?.length) paths = data.map(r=>r.path);
    }catch{}
  }

  if(gallery){
    const currentUrl = (window.state && window.state.editing && window.state.editing.image_url) ? window.state.editing.image_url : null;
    paths.forEach(p=>{
      const url=publicUrlCached(p);
      const col=document.createElement('div'); col.className='col-4';
      const wrap=document.createElement('div'); wrap.className='position-relative';
      const star=document.createElement('button'); star.type='button'; star.className='btn btn-sm btn-warning position-absolute btn-main-photo'; star.style.top='6px'; star.style.left='6px'; star.title='Imposta come principale'; star.textContent='☆'; star.setAttribute('data-path', p);
      star.addEventListener('click', ()=> setMainPhoto(recordId, p));
      const img=new Image(); img.alt='';
      if(currentUrl){ try{ if(publicUrlCached(p)===currentUrl){ star.textContent='★'; star.classList.add('active'); } }catch{} } img.className='img-fluid rounded'; img.style.height='144px'; img.style.objectFit='cover'; img.src=url;
      img.addEventListener('click',()=>openLightbox(url));
      const del=document.createElement('button'); del.type='button'; del.className='btn btn-sm btn-danger position-absolute top-0 end-0 m-1'; del.textContent='×'; del.title='Elimina immagine';
      del.addEventListener('click', async ev=>{ ev.stopPropagation(); if(!confirm('Sei sicuro di voler eliminare questa immagine?')) return;
        const { error } = await sb.storage.from(bucket).remove([p]);
        if(error){ alert('Errore eliminazione: '+error.message); return; }
        await refreshGallery(recordId);
      });
      wrap.appendChild(star); wrap.appendChild(img); wrap.appendChild(del); col.appendChild(wrap); gallery.appendChild(col);
    });
  }
}

// ----------------- Edit page -----------------
function setV(id,v){ const el=document.getElementById(id); if(!el) return;
  if(el.tagName==='SELECT'){ let f=false; for(const opt of el.options){ if(norm(opt.value)===norm(v)){ el.value=opt.value; f=true; break; } } if(!f) el.value=''; }
  else { el.value = v??''; }
}
function val(id){ const el=document.getElementById(id); return el?el.value.trim():''; }

function openEdit(id){
  // === ID + Link pubblico (scheda_url) ===
  try {
    var url = (window.state && window.state.editing && window.state.editing.scheda_url)
      ? window.state.editing.scheda_url
      : ('https://grafiume.github.io/schedaofficina/record.html?id=' + id);
    var idEl  = document.getElementById('recIdTxt');
    var urlEl = document.getElementById('recUrlTxt');
    if (idEl)  idEl.textContent  = id;
    if (urlEl) { urlEl.textContent = url; urlEl.href = url; }
  } catch (e) {}

  // === Anteprima prima immagine (se disponibile) ===
  try {
    if (typeof getThumbUrl === 'function') {
      getThumbUrl(id).then(function(url){
        var box = document.querySelector('.img-preview') || document.getElementById('imgPreview');
        if (!box) return;
        if (url) {
          if (box.tagName === 'IMG') {
            box.src = url; box.classList.remove('d-none');
          } else {
            box.innerHTML = '<img src=\"'+url+'\" alt=\"Anteprima\" class=\"thumb\" style=\"width:100%;height:auto;border-radius:.5rem;\">';
          }
        } else {
          if (box.tagName === 'IMG') {
            box.removeAttribute('src'); box.classList.add('d-none');
          } else {
            box.innerHTML = '<div class=\"text-muted\">Nessuna immagine disponibile</div>';
          }
        }
      });
    }
  } catch(e) {}

  const r=window.state.all.find(x=>x.id===id); if(!r) return; window.state.editing=r;
  const closed=norm(r.statoPratica).includes('completata'); const cb=document.getElementById('closedBanner'); if(cb) cb.classList.toggle('d-none',!closed);

  setV('eDescrizione',r.descrizione); setV('eModello',r.modello);
  setV('eApertura',r.dataApertura); setV('eAcc',r.dataAccettazione); setV('eScad',r.dataScadenza);
  setV('eStato',r.statoPratica); setV('eDDT',r.docTrasporto);
  setV('eCliente',r.cliente); setV('eTel',r.telefono); setV('eEmail',r.email); setV('eCassetto',r.cassetto); setV('eImportoConcordato',r.importoConcordato);
  setV('eBatt',r.battCollettore); setV('eAsse',r.lunghezzaAsse); setV('ePacco',r.lunghezzaPacco); setV('eLarg',r.larghezzaPacco); setV('ePunta',r.punta); setV('eNP',r.numPunte); setV('eNote',r.note);

  show('page-edit');
  refreshGallery(r.id);

  // Preventivo collegato al record
  const qBtn=document.getElementById('btnQuoteOpen');
  if(qBtn){
    qBtn.onclick=async ()=>{
      try{
        const forced = document.getElementById('eImportoConcordato')?.value || r.importoConcordato || null;
        await syncAutoQuoteForRecord(Object.assign({}, r, { importoConcordato: forced }), forced);
        await refreshQuoteCache();
        const q = getQuoteInfo(r.id);
        if (q && q.quoteId) location.href = 'preventivo.html?id=' + encodeURIComponent(q.quoteId);
        else location.href = 'preventivo.html?record_id=' + encodeURIComponent(r.id);
      }
      catch(e){}
    };
  }

  // “Carica su cloud” -> salva i dati, poi carica i file, aggiorna galleria
  const upBtn=document.getElementById('btnUpload');
  if(upBtn){
    upBtn.onclick=async ()=>{
      await saveEdit(false); // false = non chiudere
      const files=document.getElementById('eFiles').files;
      if(files?.length){
        const ok=await uploadFiles(r.id, files);
        if(ok){ await refreshGallery(r.id); document.getElementById('eFiles').value=''; }
      }
    };
  }
}

// Salva + chiudi richiesta: dopo salvataggio torniamo in Home
async function saveEdit(closeAfter=true){
  const r=window.state.editing; if(!r) return;
  const localImportoConcordato = val('eImportoConcordato');
  const wasClosed = norm(r.statoPratica).includes('completata');
  const willClose = norm(val('eStato')).includes('completata');
  const cassettoDaLiberare = sanitizeCassettoInput(val('eCassetto'));
  const releaseCassettoOnClose = !wasClosed && willClose && !!cassettoDaLiberare;
  if(releaseCassettoOnClose){
    setV('eNote', noteWithReleasedCassetto(val('eNote'), cassettoDaLiberare));
    setV('eCassetto', '');
  }
  const payload={
    descrizione:val('eDescrizione'), modello:val('eModello'),
    dataApertura:val('eApertura')||null, dataAccettazione:val('eAcc')||null, dataScadenza:val('eScad')||null, dataChiusura:val('eChiusura')||null,
    statoPratica:val('eStato'), docTrasporto:val('eDDT'), cassetto:sanitizeCassettoInput(val('eCassetto')),
    cliente:val('eCliente'), telefono:val('eTel'), email:val('eEmail'), importoConcordato:val('eImportoConcordato')||null,
    battCollettore:val('eBatt')||null, lunghezzaAsse:val('eAsse')||null, lunghezzaPacco:val('ePacco')||null, larghezzaPacco:val('eLarg')||null,
    punta:val('ePunta'), numPunte:val('eNP')||null, note:val('eNote'),
  };
  let { data, error } = await sb.from('records').update(payload).eq('id', r.id).select().single();
  if(error && String(error.message || '').includes('importoConcordato')){
    const retryPayload = Object.assign({}, payload);
    delete retryPayload.importoConcordato;
    const retry = await sb.from('records').update(retryPayload).eq('id', r.id).select().single();
    data = retry.data; error = retry.error;
  }
  if(error && String(error.message || '').includes('dataChiusura')){
    const retryPayload = Object.assign({}, payload);
    delete retryPayload.dataChiusura;
    const retry = await sb.from('records').update(retryPayload).eq('id', r.id).select().single();
    data = retry.data; error = retry.error;
  }
  if(error){ alert('Errore salvataggio: '+error.message); return; }
  const createdQuoteId = await syncAutoQuoteForRecord(Object.assign({}, data, { importoConcordato: localImportoConcordato }), localImportoConcordato);
  await refreshQuoteCache();
  Object.assign(r, data, { importoConcordato: localImportoConcordato }, enrichPriority(Object.assign({}, r, data, { importoConcordato: localImportoConcordato }), getQuoteInfo(r.id)));
  await window.loadAll();
  if (closeAfter){
    // torna alla Home come richiesto
    show('page-home');
  }
  alert('Salvato!');
}

// ----------------- NUOVA SCHEDA -----------------
let _newModal;
function todayISO(){ const d=new Date(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${dd}`; }
function getV(id){ const el=document.getElementById(id); return el?el.value.trim():''; }
function toNull(s){ return s===''?null:s; }
function sanitizeCassettoInput(v){
  const x = String(v || '').trim().toUpperCase().replace(/\s*❌.*$/, '');
  return x || null;
}

function noteWithReleasedCassetto(note, cassetto){
  const cass = sanitizeCassettoInput(cassetto);
  const base = String(note || '').trim();
  if(!cass) return base;
  const marker = 'Cassetto liberato alla chiusura';
  const already = norm(base).includes(norm(marker)) && norm(base).includes(norm(cass));
  if(already) return base;
  const line = `${marker} (${fmtIT(todayISO())}): ${cass}`;
  return base ? `${base}\n${line}` : line;
}

function previewNewFiles(){
  const box=document.getElementById('nPreview');
  const inp=document.getElementById('nFiles');
  if(!box||!inp){ return; }
  box.innerHTML='';
  const files=inp.files;
  if(!files||!files.length){ box.textContent='Nessuna immagine'; return; }

  const grid=document.createElement('div'); grid.className='row g-2';
  box.appendChild(grid);
  [...files].forEach((f,idx)=>{
    const col=document.createElement('div'); col.className='col-4';
    const wrap=document.createElement('div'); wrap.className='position-relative';
    const url=URL.createObjectURL(f);
    const img=new Image(); img.src=url; img.alt=f.name; img.className='img-fluid rounded border'; img.onload=()=>URL.revokeObjectURL(url);
    img.style.width='100%'; img.style.height='120px'; img.style.objectFit='cover';
    const star=document.createElement('button'); star.type='button'; star.className='btn btn-sm btn-warning position-absolute'; star.style.top='6px'; star.style.right='6px'; star.title='Imposta come principale'; star.textContent='☆';
    star.addEventListener('click', ()=>{
      _newMainName=f.name;
      grid.querySelectorAll('button').forEach(b=>b.textContent='☆');
      star.textContent='★';
    });
    if(idx===0 && !_newMainName){ _newMainName=f.name; star.textContent='★'; }
    wrap.appendChild(img); wrap.appendChild(star); col.appendChild(wrap); grid.appendChild(col);
  });
}

async function createNewRecord(){
  const dtAper=getV('nApertura')||todayISO();
  const localImportoConcordato = getV('nImportoConcordato');
  const payload={
    descrizione:getV('nDescrizione'),
    modello:getV('nModello'),
    dataApertura:dtAper,
    dataAccettazione:toNull(getV('nAcc')),
    dataScadenza:toNull(getV('nScad')),
    statoPratica:getV('nStato')||'In attesa',
    docTrasporto:getV('nDDT'), cassetto:sanitizeCassettoInput(getV('nCassetto')),
    cliente:getV('nCliente'), telefono:getV('nTel'), email:getV('nEmail'), importoConcordato:toNull(getV('nImportoConcordato')),
    battCollettore:toNull(getV('nBatt')),
    lunghezzaAsse:toNull(getV('nAsse')),
    lunghezzaPacco:toNull(getV('nPacco')),
    larghezzaPacco:toNull(getV('nLarg')),
    punta:getV('nPunta'), numPunte:toNull(getV('nNP')),
    note:getV('nNote'),
  };
  if(!payload.descrizione){ alert('Inserisci la descrizione.'); return; }

  // anti doppio click & idempotenza
  if(_creatingNew){ return; }
  _creatingNew = true;
  const saveBtn=document.getElementById('btnNewSave'); if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent='Salvo…'; }
  let rid = _newGeneratedId || (sessionStorage.getItem('ELIP_NEW_ID')||null);
  if(!rid){ rid = crypto?.randomUUID?.() || (Date.now().toString(16)+'-'+Math.random().toString(16).slice(2,10)); _newGeneratedId=rid; try{ sessionStorage.setItem('ELIP_NEW_ID', rid); }catch{} }
  const body = Object.assign({ id: rid }, payload);
  let { data, error } = await sb.from('records').upsert(body, { onConflict: 'id' }).select().single();
  if(error && String(error.message || '').includes('importoConcordato')){
    const retryBody = Object.assign({}, body);
    delete retryBody.importoConcordato;
    const retry = await sb.from('records').upsert(retryBody, { onConflict: 'id' }).select().single();
    data = retry.data; error = retry.error;
  }
  if(error){ if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent='Salva'; } _creatingNew=false; alert('Errore creazione: '+error.message); return; }
  if(error){ alert('Errore creazione: '+error.message); return; }

  // upload immagini se presenti
  const files=document.getElementById('nFiles')?.files;
  if(files && files.length){
    const ok = await uploadFiles(data.id, files);
    if(!ok){ alert('Attenzione: alcune immagini potrebbero non essere state caricate.'); }
    document.getElementById('nFiles').value='';
    const pv=document.getElementById('nPreview'); if(pv){ pv.innerHTML='Nessuna immagine'; }
  }

  const createdQuoteId = await syncAutoQuoteForRecord(Object.assign({}, data, { importoConcordato: localImportoConcordato }), localImportoConcordato);
  await refreshQuoteCache();

  // aggiorna cache & UI
  const enrichedNew = Object.assign({}, data, { importoConcordato: localImportoConcordato }, enrichPriority(Object.assign({}, data, { importoConcordato: localImportoConcordato }), getQuoteInfo(data.id)));
  window.state.all.unshift(enrichedNew);
  await window.loadAll();

  try{ _newModal?.hide(); }catch{}
  try{ sessionStorage.removeItem('ELIP_NEW_ID'); }catch{}
  _creatingNew=false;
  if(document.getElementById('btnNewSave')){ const b=document.getElementById('btnNewSave'); b.disabled=false; b.textContent='Salva'; }
  alert('Creato!');
}

// ----------------- Boot -----------------
function showError(msg){ try{ const el=document.getElementById('errBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); } }catch{} console.error(msg); }

window.loadAll=async function(){
  try{
    const session = await getCurrentSessionSafe();
    updateAuthButtons(session);
    if(!session){
      const tb=document.getElementById('homeRows'); if(tb) tb.innerHTML='<tr><td colspan="8" class="text-center py-4 text-muted">Accesso richiesto</td></tr>';
      return;
    }
    if(!sb){ showError('Supabase non inizializzato'); return; }
    let { data, error } = await sb
      .from('records')
      .select('id,descrizione,modello,cliente,telefono,statoPratica,note,dataApertura,dataAccettazione,dataScadenza,dataChiusura,docTrasporto,cassetto,battCollettore,lunghezzaAsse,lunghezzaPacco,larghezzaPacco,punta,numPunte,email,importoConcordato')
      .order('dataApertura',{ascending:false});
    if(error){
      const msg = String(error.message || '');
      if (msg.includes('importoConcordato')){
        const retry = await sb
          .from('records')
          .select('id,descrizione,modello,cliente,telefono,statoPratica,note,dataApertura,dataAccettazione,dataScadenza,dataChiusura,docTrasporto,cassetto,battCollettore,lunghezzaAsse,lunghezzaPacco,larghezzaPacco,punta,numPunte,email')
          .order('dataApertura',{ascending:false});
        data = retry.data || [];
        error = retry.error;
      }
    }
    if(error){
      const fb=await sb.from('records_view').select('*').order('dataApertura',{ascending:false}).limit(1000);
      if(fb.error){ showError('Errore lettura records: '+error.message+' / '+fb.error.message); renderHome([]); return; }
      data=fb.data;
    }
    window.state.all=data||[];
    await refreshQuoteCache();
    window.state.all = window.state.all.map(r => Object.assign({}, r, enrichPriority(r, getQuoteInfo(r.id))));
    renderHome(window.state.all);
  }catch(e){ showError('Eccezione loadAll: '+(e?.message||e)); renderHome([]); }
};

document.addEventListener('DOMContentLoaded', ()=>{
  const H=(id,fn)=>{ const el=document.getElementById(id); if(el) el.addEventListener('click',fn); };

  H('btnHome', ()=>show('page-home'));
  H('btnAuthOpen', ()=>openAuthModal(true));
  H('btnAuthLogin', ()=>doAuthLogin());
  H('btnLogout', async ()=>{
    try{ await sb.auth.signOut(); }catch(_e){}
    updateAuthButtons(null);
    openAuthModal(true);
    const tb=document.getElementById('homeRows'); if(tb) tb.innerHTML='<tr><td colspan="8" class="text-center py-4 text-muted">Accesso richiesto</td></tr>';
  });
  H('btnRicerca', ()=>show('page-search'));
  H('btnPreventivi', ()=>{ try{ location.href='preventivi.html'; }catch(e){} });
  H('btnPrioritaReport', ()=>{ alert('Report priorità in preparazione'); });
  H('btnApply', doSearch);
  H('btnDoSearch', doSearch);
  H('btnReset', ()=>{
    ['q','cassettoSearch','fCassetto','noteExact','fBatt','fAsse','fPacco','fLarg','fPunta','fNP'].forEach(id=>{
      const el=document.getElementById(id); if(!el) return;
      if(el.tagName==='SELECT') el.selectedIndex=0; else el.value='';
    });
    document.getElementById('searchRows').innerHTML='';
  });

  H('kpiTotBtn', ()=>renderHome(window.state.all));
  H('kpiAttesaBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('attesa'))));
  H('kpiLavBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('lavorazione'))));
  H('kpiCompBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('completata'))));
  H('btnAtteseAll', ()=>filterAtteseByBucket(null));
  H('atteseTotBox', ()=>filterAtteseByBucket(null));
  H('attese07Box', ()=>filterAtteseByBucket('0_7'));
  H('attese815Box', ()=>filterAtteseByBucket('8_15'));
  H('atteseOver15Box', ()=>filterAtteseByBucket('over15'));

  // Salva scheda: chiudi dopo il salvataggio (come richiesto)
  const btnSave=document.getElementById('btnSave');
  if(btnSave){ btnSave.addEventListener('click', ()=>saveEdit(true)); }

  const btnCancel=document.getElementById('btnCancel');
  if(btnCancel){ btnCancel.addEventListener('click', ()=>show('page-home')); }

  // Nuova scheda
  const bNew=document.getElementById('btnNew');
  if(bNew){
    bNew.addEventListener('click', ()=>{
      _creatingNew=false;
      _newMainName=null;
      try{ sessionStorage.removeItem('ELIP_NEW_ID'); }catch{}
      _newGeneratedId = (crypto?.randomUUID?.() || (Date.now().toString(16)+'-'+Math.random().toString(16).slice(2,10)+'-'+Math.random().toString(16).slice(2,6)+'-'+Math.random().toString(16).slice(2,6)+'-'+Math.random().toString(16).slice(2,12))).replace(/\.+$/,'');
      try{ sessionStorage.setItem('ELIP_NEW_ID', _newGeneratedId); }catch{}
      const el=document.getElementById('newRecordModal'); if(!el) return;
      if(!_newModal) _newModal=new bootstrap.Modal(el, { backdrop:'static' });
      const nApertura=document.getElementById('nApertura'); if(nApertura && !nApertura.value) nApertura.value=todayISO();
      _newModal.show();
    });
  }
  const bNewSave=document.getElementById('btnNewSave'); if(bNewSave) bNewSave.addEventListener('click', createNewRecord);

  // Preview live per "Nuova scheda"
  const nFiles=document.getElementById('nFiles'); if(nFiles) nFiles.addEventListener('change', previewNewFiles);

  try{
    sb?.auth?.onAuthStateChange?.((_event, session)=>{
      updateAuthButtons(session || null);
      if(session) window.loadAll();
    });
    requireAuthenticatedSession().then(session=>{ if(session) window.loadAll(); });
  }catch(e){ showError(e.message||String(e)); }
});
// ===== PREVENTIVO BADGE =====

async function getPreventiviMap(){
  const { data } = await sb
    .from('quotes')
    .select('record_id, stato');

  const map = {};

  (data || []).forEach(q => {
    const id = q.record_id;
    if (!map[id]) map[id] = [];

    map[id].push((q.stato || '').toLowerCase());
  });

  return map;
}

function getPClass(stati, statoLavoro){
  if (!stati || !stati.length) return 'p-gray';

  if (stati.some(s => s.includes('accettato'))) {
    if (statoLavoro === 'Completata') return 'p-green';
    if (statoLavoro === 'In lavorazione') return 'p-orange';
    return 'p-blue';
  }

  if (stati.some(s => s.includes('inviato'))) return 'p-yellow';

  return 'p-gray';
}

function getPTitle(stati, statoLavoro){
  if (!stati || !stati.length) return 'Nessun preventivo';

  if (stati.some(s => s.includes('accettato'))) {
    if (statoLavoro === 'Completata') return 'Accettato • chiuso';
    if (statoLavoro === 'In lavorazione') return 'Accettato • in lavorazione';
    return 'Accettato';
  }

  if (stati.some(s => s.includes('inviato'))) return 'Preventivo inviato';

  return 'Bozza';
}
