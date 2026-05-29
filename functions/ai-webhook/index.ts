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

    if (!body) {
      return jsonResponse(
        { success: false, error: "Invalid JSON body" },
        400,
      );
    }

    const mode = getMode(req, body);

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

    const inputText = extractInputText(body);

    if (!inputText) {
      return jsonResponse(
        {
          success: false,
          error: "Missing text. Send `text`, `message`, or `payload.text`.",
        },
        400,
      );
    }

    const aiResult = await runOpenAI(inputText, body);

    return jsonResponse({
      success: true,
      mode,
      result: aiResult,
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

async function runOpenAI(
  inputText: string,
  originalPayload: Record<string, unknown>,
): Promise<string> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You process incoming webhook or frontend payloads. Return a concise and useful result in Italian.",
        },
        {
          role: "user",
          content: JSON.stringify({
            text: inputText,
            payload: originalPayload,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${errorText}`);
  }

  const data = await response.json();

  return extractOpenAIText(data);
}

function extractOpenAIText(data: any): string {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const textParts =
    data.output
      ?.flatMap((item: any) => item.content ?? [])
      ?.filter((content: any) => content.type === "output_text")
      ?.map((content: any) => content.text) ?? [];

  return textParts.join("\n").trim();
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
