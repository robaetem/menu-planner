import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { imageError, latestImages, stripOldImages } from "@/lib/chat/images";
import { runStatuses } from "@/lib/change/runs";
import { requireHousehold } from "@/lib/chat/auth";
import { chatModel, chatSettings } from "@/lib/chat/model";
import { systemPrompt } from "@/lib/chat/system-prompt";
import { buildChatTools } from "@/lib/chat/tools";
import { todayIso } from "@/lib/date";

export const maxDuration = 60;

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

  // Validate the raw last-user images first; older images are dropped, never trusted.
  const bad = imageError(messages.slice(-MAX_MESSAGES).filter((m) => m.role === "user").slice(-1));
  if (bad) return Response.json({ error: bad }, { status: 400 });
  const images = latestImages(messages);
  messages = stripOldImages(messages);
  messages = await withChangeStatus(messages);

  const result = streamText({
    model: chatModel(process.env.OPENROUTER_API_KEY),
    system: systemPrompt(todayIso()),
    messages: await convertToModelMessages(messages),
    tools: buildChatTools(a.email, { images }),
    ...chatSettings,
  });
  return result.toUIMessageStreamResponse();
}

type Part = { type: string; output?: { runId?: string; status?: string } };

/** Earlier request_change results carry only a runId; add what became of each run
 *  (live, undone, failed...) so the model never treats an undone change as pending. */
async function withChangeStatus(messages: UIMessage[]): Promise<UIMessage[]> {
  const ids = messages.flatMap((m) =>
    (m.parts as Part[]).filter((p) => p.type === "tool-request_change" && p.output?.runId).map((p) => p.output!.runId!),
  );
  const status = await runStatuses(ids).catch(() => new Map<string, string>());
  if (!status.size) return messages;
  return messages.map((m) => ({
    ...m,
    parts: (m.parts as Part[]).map((p) =>
      p.type === "tool-request_change" && p.output?.runId && status.has(p.output.runId)
        ? { ...p, output: { ...p.output, status: status.get(p.output.runId) } }
        : p,
    ) as UIMessage["parts"],
  }));
}
