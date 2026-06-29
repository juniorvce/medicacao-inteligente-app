import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || (typeof body.text !== "string" && typeof body.image !== "string")) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body. Expected JSON with 'text' or 'image' (base64 data URL).",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured (OPENAI_API_KEY)" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const systemPrompt = `You are a prescription parser. Extract medicines from the input text or image and return a single JSON object and nothing else with the exact shape:
{
  "medicamentos": [
    {
      "nome": "string",
      "dose": "string or number or null",
      "unidade": "string (e.g. mg, ml) or null",
      "frequencia": "string (e.g. 8/8h, 12/12h or 'once a day') or null",
      "duracao": "string (e.g. 7 dias, 5 dias, 1 semana) or null",
      "observacao": "string or null",
      "requires_confirmation": false,
      "esquema_variavel": false,
      "fases": null
    }
  ]
}

IMPORTANT RULES:
- Output MUST be valid JSON, with a top-level key "medicamentos" which is an array (possibly empty).
- Do not output any explanatory text, markdown, or extra fields.
- Normalize numbers: doses should be numbers when possible (but can be string if ambiguous). Units should be short strings (mg, g, ml, gotas, comprimidos).
- If a field is unknown, use null (not empty string).

VARIABLE SCHEME / PHASES:
- If the prescription describes a tapering/progressive schedule (e.g. "days 1-2: 3x/day, days 3-5: 2x/day, day 6+: 1x/day"), set "esquema_variavel": true and populate "fases" as an array:
  "fases": [
    { "dias_duracao": 2, "vezes_por_dia": 3, "descricao": "Dias 1-2: 3x ao dia" },
    { "dias_duracao": 3, "vezes_por_dia": 2, "descricao": "Dias 3-5: 2x ao dia" },
    { "dias_duracao": null, "vezes_por_dia": 1, "descricao": "Dia 6 em diante: 1x ao dia e parar" }
  ]
- When "esquema_variavel" is true, "frequencia" and "duracao" can be null (the phases contain the detail).
- If "esquema_variavel" is false, set "fases" to null.

CONFIRMATION FLAG:
- Set "requires_confirmation": true if any part of the prescription is ambiguous, unclear, or partially illegible. Otherwise set it to false.

Parse examples of free-form prescription text or images like:
- 'Amoxicilina 250 mg 8/8h por 7 dias'
- 'Paracetamol 500mg SOS até 5 dias'
- 'Koide D - Dias 1-2: 3x/dia, Dias 3-5: 2x/dia, Dia 6: 1x e parar'
`;

    let messages: any[] = [];
    if (body.image) {
      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analise esta imagem de receita médica e extraia todas as informações no formato JSON solicitado.",
            },
            {
              type: "image_url",
              image_url: {
                url: body.image,
              },
            },
          ],
        },
      ];
    } else {
      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Parse the following prescription text and return the JSON described above. Text:\n\n${body.text}`,
        },
      ];
    }

    const payload = {
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0,
      max_tokens: 1500,
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: "OpenAI API error", details: text }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const data = await res.json();
    const assistant = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;

    if (!assistant) {
      return new Response(JSON.stringify({ error: "No content from OpenAI" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Try to extract JSON from the model output.
    let jsonText = assistant;

    // If wrapped in Markdown code fences, strip them
    const fenceMatch = /```(?:json)?\n([\s\S]*?)```/.exec(jsonText);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    // If there's surrounding text, try to find the first { and the last }
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to parse JSON from OpenAI response", assistant }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Basic validation: ensure medicamentos is an array
    if (!parsed || !Array.isArray(parsed.medicamentos)) {
      return new Response(
        JSON.stringify({ error: "Parsed output missing medicamentos array", parsed }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
