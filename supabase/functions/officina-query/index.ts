// ELIP TAGLIENTE • officina-query
// Edge Function Supabase per interrogare in modo controllato il database Scheda Officina.
// Richiede chiamata autenticata con JWT Supabase: Authorization: Bearer <access_token>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RecordRow = {
  id?: string;
  cliente?: string | null;
  descrizione?: string | null;
  modello?: string | null;
  telefono?: string | null;
  email?: string | null;
  statoPratica?: string | null;
  preventivoStato?: string | null;
  docTrasporto?: string | null;
  cassetto?: string | null;
  dataApertura?: string | null;
  dataArrivo?: string | null;
  dataAccettazione?: string | null;
  dataScadenza?: string | null;
  dataCompletamento?: string | null;
  importoConcordato?: number | string | null;
  note?: string | null;
  battCollettore?: string | null;
  lunghezzaAsse?: string | null;
  lunghezzaPacco?: string | null;
  larghezzaPacco?: string | null;
  punta?: string | null;
  numPunte?: string | null;
};

type ParsedQuery = {
  action: string;
  text: string;
  cliente?: string;
  cassetto?: string;
  days?: number;
  search?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ success: false, error: "Metodo non consentito" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ success: false, error: "Accesso richiesto" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !anonKey) {
      return json({ success: false, error: "Variabili Supabase mancanti" }, 500);
    }

    const jwt = authHeader.replace("Bearer ", "").trim();

    // Verifica utente con anon key.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return json({ success: false, error: "Sessione non valida" }, 401);
    }

    // Usa service role se disponibile, altrimenti usa il JWT utente.
    const db = createClient(supabaseUrl, serviceRoleKey || anonKey, serviceRoleKey
      ? undefined
      : { global: { headers: { Authorization: `Bearer ${jwt}` } } });

    const body = await req.json().catch(() => ({}));
    const parsed = parseQuery(String(body?.text || body?.message || ""), String(body?.action || ""));

    const bodyMax = Number(body?.maxResults || body?.limit || 10000);
    const maxResults = Number.isFinite(bodyMax) ? Math.max(1, Math.min(bodyMax, 50000)) : 10000;

    const allRows = await fetchAllRecords(db, maxResults);
    const filteredRows = applyParsedQuery(allRows, parsed);
    const responseRows = filteredRows.map(formatRow);

    return json({
      success: true,
      receivedAt: new Date().toISOString(),
      query: parsed,
      count: responseRows.length,
      totalCount: filteredRows.length,
      loadedRecords: allRows.length,
      maxResults,
      limited: allRows.length >= maxResults,
      summary: buildSummary(parsed, responseRows),
      rows: responseRows,
      // Compatibilità con il vecchio telecomando.html
      results: responseRows.map((row) => ({
        table_name: "records",
        row_data: { new_row: row },
      })),
    });
  } catch (error) {
    console.error("officina-query error", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    }, 500);
  }
});

async function fetchAllRecords(db: ReturnType<typeof createClient>, maxResults: number): Promise<RecordRow[]> {
  const pageSize = 1000;
  const out: RecordRow[] = [];

  for (let from = 0; from < maxResults; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxResults - 1);
    const { data, error } = await db
      .from("records")
      .select("id,cliente,descrizione,modello,telefono,email,statoPratica,preventivoStato,docTrasporto,cassetto,dataApertura,dataArrivo,dataAccettazione,dataScadenza,dataCompletamento,importoConcordato,note,battCollettore,lunghezzaAsse,lunghezzaPacco,larghezzaPacco,punta,numPunte")
      .order("dataApertura", { ascending: false })
      .range(from, to);

    if (error) throw error;
    const page = (data || []) as RecordRow[];
    out.push(...page);
    if (page.length < pageSize) break;
  }

  return out;
}

function parseQuery(text: string, forcedAction: string): ParsedQuery {
  const original = text.trim();
  const q = norm(original);
  const action = norm(forcedAction);

  if (action) return { action, text: original, search: cleanFreeText(original) };

  const cassetto = extractCassetto(original);
  if (cassetto) return { action: "cerca_cassetto", text: original, cassetto };

  const cliente = extractCliente(original);
  if (cliente) return { action: "cerca_cliente", text: original, cliente };

  if (q.includes("oltre 15") || q.includes("piu di 15") || q.includes("più di 15") || q.includes(">15")) {
    return { action: "attese_oltre_giorni", text: original, days: 15 };
  }

  if (q.includes("8-15") || q.includes("8 a 15") || q.includes("otto") || q.includes("quindici")) {
    return { action: "attese_8_15", text: original };
  }

  if (q.includes("0-7") || q.includes("0 a 7") || q.includes("sette") || q.includes("entro 7")) {
    return { action: "attese_0_7", text: original };
  }

  if (q.includes("attesa") || q.includes("in attesa")) return { action: "in_attesa", text: original };
  if (q.includes("lavorazione")) return { action: "in_lavorazione", text: original };
  if (q.includes("completat") || q.includes("chius")) return { action: "completate", text: original };
  if (q.includes("apert")) return { action: "aperte", text: original };
  if (q.includes("preventiv")) return { action: "preventivi", text: original };
  if (q.includes("scadut") || q.includes("ritard")) return { action: "scadute", text: original };

  return { action: "ricerca", text: original, search: cleanFreeText(original) };
}

function applyParsedQuery(rows: RecordRow[], parsed: ParsedQuery): RecordRow[] {
  switch (parsed.action) {
    case "in_attesa":
      return rows.filter(isAttesa);
    case "attese_0_7":
      return rows.filter((r) => isAttesa(r) && inAgeRange(r, 0, 7));
    case "attese_8_15":
      return rows.filter((r) => isAttesa(r) && inAgeRange(r, 8, 15));
    case "attese_oltre_giorni":
      return rows.filter((r) => isAttesa(r) && ageDays(r) > (parsed.days || 15));
    case "in_lavorazione":
      return rows.filter((r) => norm(r.statoPratica).includes("lavorazione"));
    case "completate":
      return rows.filter(isCompleted);
    case "aperte":
      return rows.filter((r) => !isCompleted(r));
    case "preventivi":
      return rows.filter((r) => !!String(r.preventivoStato || "").trim() || Number(r.importoConcordato || 0) > 0);
    case "scadute":
      return rows.filter((r) => !isCompleted(r) && isExpired(r.dataScadenza));
    case "cerca_cliente":
      return rows.filter((r) => norm(r.cliente).includes(norm(parsed.cliente)));
    case "cerca_cassetto":
      return rows.filter((r) => norm(r.cassetto) === norm(parsed.cassetto));
    default:
      return searchRows(rows, parsed.search || parsed.text);
  }
}

function formatRow(r: RecordRow) {
  return {
    id: r.id || "",
    cliente: r.cliente || "",
    descrizione: r.descrizione || "",
    modello: r.modello || "",
    telefono: r.telefono || "",
    email: r.email || "",
    statoPratica: r.statoPratica || "",
    stato: r.statoPratica || "",
    preventivoStato: r.preventivoStato || "",
    preventivo: r.preventivoStato || "",
    docTrasporto: r.docTrasporto || "",
    ddt: r.docTrasporto || "",
    cassetto: r.cassetto || "",
    dataApertura: r.dataApertura || "",
    dataArrivo: r.dataArrivo || "",
    dataAccettazione: r.dataAccettazione || "",
    dataScadenza: r.dataScadenza || "",
    dataCompletamento: r.dataCompletamento || "",
    importoConcordato: r.importoConcordato || "",
    importo: r.importoConcordato || "",
    note: r.note || "",
    giorniAttesa: ageDays(r),
    scheda_url: r.id ? `https://grafiume.github.io/schedaofficina/record.html?id=${encodeURIComponent(r.id)}` : "",
  };
}

function buildSummary(parsed: ParsedQuery, rows: ReturnType<typeof formatRow>[]) {
  const labels: Record<string, string> = {
    in_attesa: "Motori in attesa",
    attese_0_7: "Motori in attesa da 0 a 7 giorni",
    attese_8_15: "Motori in attesa da 8 a 15 giorni",
    attese_oltre_giorni: `Motori in attesa da oltre ${parsed.days || 15} giorni`,
    in_lavorazione: "Motori in lavorazione",
    completate: "Schede completate",
    aperte: "Schede aperte",
    preventivi: "Schede con preventivo/importo",
    scadute: "Schede scadute non completate",
    cerca_cliente: `Ricerca cliente: ${parsed.cliente || ""}`,
    cerca_cassetto: `Ricerca cassetto: ${parsed.cassetto || ""}`,
    ricerca: `Ricerca: ${parsed.search || parsed.text}`,
  };
  return `${labels[parsed.action] || "Risultati"}: ${rows.length}`;
}

function searchRows(rows: RecordRow[], text: string) {
  const tokens = norm(text).split(/\s+/).filter(Boolean);
  if (!tokens.length) return rows.slice(0, 200);
  return rows.filter((r) => {
    const hay = norm([
      r.cliente,
      r.descrizione,
      r.modello,
      r.telefono,
      r.email,
      r.statoPratica,
      r.preventivoStato,
      r.docTrasporto,
      r.cassetto,
      r.note,
      r.battCollettore,
      r.lunghezzaAsse,
      r.lunghezzaPacco,
      r.larghezzaPacco,
      r.punta,
      r.numPunte,
    ].join(" "));
    return tokens.every((t) => hay.includes(t));
  });
}

function extractCliente(text: string) {
  const m = text.match(/cliente\s+(.+?)(?:\s+(?:in attesa|attesa|lavorazione|completat[aeio]|aperte|aperti|scadut[aei]|preventiv[oi]|cassetto)|$)/i);
  return m?.[1]?.trim() || "";
}

function extractCassetto(text: string) {
  const m = text.match(/cassetto\s+([a-zA-Z]{0,3}\s*\d{1,3}[a-zA-Z]?|[a-zA-Z]\d{1,3})/i);
  return m?.[1]?.replace(/\s+/g, "").toUpperCase() || "";
}

function cleanFreeText(text: string) {
  return text
    .replace(/mostra(mi)?/gi, "")
    .replace(/cerca/gi, "")
    .replace(/trova/gi, "")
    .replace(/schede/gi, "")
    .replace(/motori/gi, "")
    .replace(/motore/gi, "")
    .replace(/cliente/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAttesa(r: RecordRow) {
  return norm(r.statoPratica).includes("attesa");
}

function isCompleted(r: RecordRow) {
  const s = norm(r.statoPratica);
  return s.includes("completata") || s.includes("completato") || s.includes("chiusa") || s.includes("chiuso");
}

function inAgeRange(r: RecordRow, min: number, max: number) {
  const d = ageDays(r);
  return Number.isFinite(d) && d >= min && d <= max;
}

function ageDays(r: RecordRow) {
  const raw = r.dataArrivo || r.dataApertura || "";
  if (!raw) return 0;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86400000));
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function norm(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
