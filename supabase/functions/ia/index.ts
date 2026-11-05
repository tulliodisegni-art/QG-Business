// Fonction « ia » partagée (Mijonote, QG Business…) : garde la clé de l'IA côté serveur.
// Uniquement Google Gemini (offre gratuite, secret GEMINI_API_KEY) : rien de payant.
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "apikey, authorization, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

async function gemini(key: string, prompt: string, images: string[], web: boolean) {
  const parts = [
    ...images.map((d) => ({ inline_data: { mime_type: "image/jpeg", data: String(d).replace(/^data:[^,]+,/, "") } })),
    { text: prompt },
  ];
  let last = "";
  for (const model of ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        ...(web ? { tools: [{ google_search: {} }, { url_context: {} }] } : {}),
      }),
    });
    const res = await r.json();
    if (r.ok) {
      const c = res.candidates?.[0];
      const text = (c?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || "").join("");
      console.log(JSON.stringify({ model, prompt: prompt.length, text: text.length, fin: c?.finishReason, block: res.promptFeedback?.blockReason }));
      if (text.trim()) return text;
      last = `réponse vide (${c?.finishReason || res.promptFeedback?.blockReason || "?"})`;
      continue;
    }
    last = res?.error?.message || `erreur ${r.status}`;
    if (![400, 404, 429, 500, 503].includes(r.status)) break;
  }
  throw new Error(last);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);
  try {
    const { prompt, images = [], web = false } = await req.json();
    if (typeof prompt !== "string" || !prompt || prompt.length > 30000 || !Array.isArray(images) || images.length > 6) {
      return json({ error: "requête invalide" }, 400);
    }
    const gkey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GEMINI_API_kEY");
    if (!gkey) return json({ error: "clé GEMINI_API_KEY absente", status: 503 }, 503);
    return json({ text: await gemini(gkey, prompt, images, web) });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
