// POST /api/chat/apply/[undoId]/undo  ->  { ok, summary } | { ok: false, error, conflicts? }
// Puts every row a chat change touched back to how it was. Refuses (and writes
// nothing) when one of those rows was edited again since, so later work is
// never lost.
import { requireHousehold } from "@/lib/chat/auth";
import { getDb } from "@/lib/supabase/server";
import { conflicts, describe, diff, restore, snapshot, type RowChange } from "../../journal";

export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ undoId: string }> }) {
  const a = await requireHousehold();
  if (!a.ok) return a.response;
  const { undoId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(undoId)) return Response.json({ ok: false, error: "Onbekende wijziging" }, { status: 404 });

  const db = getDb();
  const { data: entry } = await db.from("chat_data_changes").select("id, status, changes, summary").eq("id", undoId).maybeSingle();
  if (!entry) return Response.json({ ok: false, error: "Onbekende wijziging" }, { status: 404 });
  if (entry.status === "undone") return Response.json({ ok: false, error: "Deze wijziging is al ongedaan gemaakt." }, { status: 409 });
  if (entry.status !== "applied") return Response.json({ ok: false, error: "Deze wijziging is nooit doorgevoerd." }, { status: 409 });

  const changes = (entry.changes ?? []) as RowChange[];
  const before = await snapshot(db);
  const clash = conflicts(changes, before);
  if (clash.length) {
    return Response.json(
      { ok: false, error: "Sindsdien is er iets anders aangepast aan dezelfde gegevens. Ongedaan maken zou dat wissen, dus er is niets veranderd.", conflicts: describe(clash) },
      { status: 409 },
    );
  }
  try {
    await restore(db, changes);
  } catch (e) {
    // Put back what the undo itself changed, so it stays all or nothing.
    await restore(db, diff(before, await snapshot(db))).catch(() => {});
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Ongedaan maken mislukt" }, { status: 500 });
  }
  const undoChanges = diff(before, await snapshot(db));
  await db
    .from("chat_data_changes")
    .update({ status: "undone", undone_at: new Date().toISOString(), undo_changes: undoChanges, updated_at: new Date().toISOString() })
    .eq("id", undoId);
  return Response.json({ ok: true, summary: `Ongedaan gemaakt: ${entry.summary ?? ""}`.trim() });
}
