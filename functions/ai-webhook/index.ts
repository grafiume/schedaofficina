// supabase/functions/ai-webhook/index.ts

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestMode = "webhook" | "frontend";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Method not allowed" },
      405,
    );
  }

  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonResponse(
        { success: false, error: "Invalid JSON body" },
        400,
      );
    }

    const mode = getMode(req, body as Record<string, unknown>);

    if (mode === "webhook") {
      const authorized = verifyWebhookSecret(req);

      if (!authorized) {
        return jsonResponse(
          { success: false, error: "Invalid webhook secret" },
          401,
        );
      }
    }

    if (mode === "frontend") {
      const user = await verifySupabaseUser(req);

      if (!user) {
        return jsonResponse(
          { success: false, error: "Unauthorized frontend request" },
          401,
        );
      }
    }

    const inputText = extractInputText(body as Record<string, unknown>);

    const result = {
      receivedAt: new Date().toISOString(),
      mode,
      text: inputText,
      payload: body,
      message:
        mode === "webhook"
          ? "Webhook ricevuto correttamente."
          : "Richiesta frontend ricevuta correttamente.",
    };

    return jsonResponse({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Function error:", error);

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

function getMode(req: Request, body: Record<string, unknown>): RequestMode {
  const webhookSecret = req.headers.get("x-webhook-secret");

  if (webhookSecret) return "webhook";

  if (body.mode === "webhook") return "webhook";

  return "frontend";
}

function verifyWebhookSecret(req: Request): boolean {
  const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
  const receivedSecret = req.headers.get("x-webhook-secret");

  if (!expectedSecret || !receivedSecret) return false;

  return receivedSecret === expectedSecret;
}

async function verifySupabaseUser(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const jwt = authHeader.replace("Bearer ", "");

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: supabaseAnonKey,
    },
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

function extractInputText(body: Record<string, unknown>): string | null {
  if (typeof body.text === "string") return body.text;
  if (typeof body.message === "string") return body.message;

  const payload = body.payload;

  if (
    payload &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof payload.text === "string"
  ) {
    return payload.text;
  }

  return null;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
