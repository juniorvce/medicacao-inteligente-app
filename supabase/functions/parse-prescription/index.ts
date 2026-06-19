import { serve } from "https://deno.land/std@0.201.0/http/server.ts";

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== "string") {
      return new Response(JSON.stringify({ error: "Invalid request body. Expected JSON { \"text\": string }" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured (OPENAI_API_KEY)" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const prescriptionText = body.text;

    const systemPrompt = `You are a prescription parser. Extract medicines from the input text and return a single JSON object and nothing else with the exact shape:
{
  "medicamentos": [
    {
      "nome": "string",
      "dose": "string or number",
      "unidade": "string (e.g. mg, ml)",
      "frequencia": "string (e.g. 8/8h, 12/12h or 'once a day')",
      "duracao": "string (e.g. 7 dias, 5 dias, 1 semana) or null",
      "observacao": "string or null"
    }
  ]
}

Important constraints:
- Output MUST be valid JSON, with a top-level key `medicamentos` which is an array (possibly empty).
- Do not output any explanatory text, markdown, or extra fields.
- Normalize numbers: doses should be numbers when possible (but can be string if ambiguous). Units should be short strings (mg, g, ml, gotas, comprimidos).
- If a field is unknown, use null (not empty string).

Parse examples of free-form prescription text like: 'Amoxicilina 250 mg 8/8h por 7 dias' or 'Paracetamol 500mg SOS até 5 dias'.
`;

    const userPrompt = `Parse the following prescription text and return the JSON described above. Text:\n\n${prescriptionText}`;

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 800,
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
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const assistant = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;

    if (!assistant) {
      return new Response(JSON.stringify({ error: "No content from OpenAI" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Try to extract JSON from the model output. The model should return pure JSON but we'll be defensive.
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
      // If parsing failed, return raw assistant content for debugging
      return new Response(JSON.stringify({ error: "Failed to parse JSON from OpenAI response", assistant }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Basic validation: ensure medicamentos is an array
    if (!parsed || !Array.isArray(parsed.medicamentos)) {
      return new Response(JSON.stringify({ error: "Parsed output missing medicamentos array", parsed }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
