// POST /api/chat/apply  { title?, ops }  ->  { ok, summary, undoId } | { ok: false, error }
// Runs data changes the user approved in the chat. Every touched row is
// journaled (chat_data_changes) before anything is written; a failing op rolls
// the whole change back, so it is all or nothing.
import { z } from "zod";
import { requireHousehold } from "@/lib/chat/auth";
import { OpsSchema } from "@/lib/chat/ops";
import { getDb } from "@/lib/supabase/server";
import { settleFreezer } from "@/lib/freezer/stock-server";
import { runOp } from "./execute";
import { describe, diff, restore, snapshot } from "./journal";

export const maxDuration = 60;

const Body = z.object({ title: z.string().trim().max(160).optional(), ops: OpsSchema });

export async function POST(req: Request) {
  const a = await requireHousehold();
  if (!a.ok) return a.response;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "Ongeldig verzoek";
    // 200 + ok:false: the chat card hands this to the model, which explains it.
    return Response.json({ ok: false, error: `Ongeldige wijziging: ${msg}` });
  }

  const db = getDb();
  // Book off freezer stock of past days first (what every page load does), so
  // that bookkeeping never ends up inside this change's undo.
  await settleFreezer(db).catch(() => {});
  const before = await snapshot(db);
  const { data: entry, error: logError } = await db
    .from("chat_data_changes")
    .insert({ requested_by: a.email, title: body.title || "Wijziging via de chat", ops: body.ops, snapshot: before })
    .select("id")
    .single();
  if (logError || !entry) return Response.json({ ok: false, error: "Kon de wijziging niet vastleggen; er is niets veranderd." }, { status: 500 });
  const id = entry.id as string;

  const lines: string[] = [];
  try {
    for (const op of body.ops) lines.push(await runOp(db, op));
  } catch (e) {
    const error = e instanceof Error ? e.message : "Onbekende fout";
    const changes = diff(before, await snapshot(db));
    try {
      await restore(db, changes);
      await db.from("chat_data_changes").update({ status: "rolled_back", error, changes, snapshot: null, updated_at: new Date().toISOString() }).eq("id", id);
    } catch (re) {
      // Keep the full snapshot so the data can still be put back by hand.
      await db.from("chat_data_changes").update({ status: "failed", error: `${error} | terugzetten: ${re instanceof Error ? re.message : re}`, changes, updated_at: new Date().toISOString() }).eq("id", id);
      return Response.json({ ok: false, error: `${error} Terugzetten lukte niet volledig; alles is bewaard om te herstellen.` }, { status: 500 });
    }
    return Response.json({ ok: false, error: `${error} Er is niets veranderd.` });
  }

  const changes = diff(before, await snapshot(db));
  const summary = lines.join("\n");
  await db
    .from("chat_data_changes")
    .update({ status: "applied", summary, changes, snapshot: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  return Response.json({ ok: true, summary, undoId: id, changed: describe(changes) });
}
