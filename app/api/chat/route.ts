import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { requireHousehold } from "@/lib/chat/auth";
import { systemPrompt } from "@/lib/chat/system-prompt";
import { buildChatTools } from "@/lib/chat/tools";
import { todayIso } from "@/lib/date";

export const maxDuration = 60;

const MODEL = "z-ai/glm-5.3-flash";
const MAX_MESSAGES = 40;

export async function POST(req: Request) {
  const a = await requireHousehold();
  if (!a.ok) return a.response;
  if (!process.env.OPENROUTER_API_KEY) return Response.json({ error: "Chat is niet ingesteld" }, { status: 503 });

  let messages: UIMessage[];
  try {
    const body = await req.json();
    if (!Array.isArray(body?.messages)) throw new Error("messages");
    messages = body.messages.slice(-MAX_MESSAGES);
  } catch {
    return Response.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const result = streamText({
    model: openrouter.chat(MODEL),
    system: systemPrompt(todayIso()),
    messages: await convertToModelMessages(messages),
    tools: buildChatTools(a.email),
    stopWhen: stepCountIs(8),
  });
  return result.toUIMessageStreamResponse();
}
