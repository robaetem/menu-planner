// Thin server-side wrapper around OpenRouter's OpenAI-compatible chat API.
// The key (OPENROUTER_API_KEY) lives only in env and never reaches the browser —
// every caller is a server action / route. Model is a single swappable constant.

export const AI_MODEL = "deepseek/deepseek-v4-flash";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function aiConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Call the model and return the raw assistant text. Throws on transport/HTTP
 *  errors so callers can decide how to fall back. */
export async function chat(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; jsonObject?: boolean } = {},
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY ontbreekt");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://menu-planner.vercel.app",
      "X-Title": "Menu Planner",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0,
      ...(opts.jsonObject ? { response_format: { type: "json_object" } } : {}),
    }),
    // Never let a slow model hang a server action indefinitely.
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

/** Pull the first JSON value out of a model response, tolerating ```json fences
 *  and leading/trailing prose. Returns null if nothing parses. */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // Try the whole candidate first, then the widest {...} / [...] slice.
  const tries = [candidate];
  const obj = candidate.match(/[{[][\s\S]*[}\]]/);
  if (obj) tries.push(obj[0]);
  for (const t of tries) {
    try {
      return JSON.parse(t.trim()) as T;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

/** Convenience: chat + JSON parse in one call. Returns null on any failure. */
export async function chatJson<T = unknown>(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<T | null> {
  try {
    const text = await chat(messages, { ...opts, jsonObject: true });
    return extractJson<T>(text);
  } catch (e) {
    console.error("[ai] chatJson failed:", e);
    return null;
  }
}
