// POST /api/change  { request }  ->  { runId } | { error }
// Starts an app (code) change after the user approved a proposeCodeChange card.
import { z } from "zod";
import { requireHousehold } from "@/lib/chat/auth";
import { startChange } from "@/lib/change/runs";

const Body = z.object({ request: z.string().min(10).max(2000) });

export async function POST(req: Request) {
  const a = await requireHousehold();
  if (!a.ok) return a.response;
  let request: string;
  try {
    request = Body.parse(await req.json()).request;
  } catch {
    return Response.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }
  const r = await startChange(a.email, request);
  // 200 + { error }: the chat card hands it to the model, which explains it.
  return r.ok ? Response.json({ runId: r.runId }) : Response.json({ error: r.error });
}
