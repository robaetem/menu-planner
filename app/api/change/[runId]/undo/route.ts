import { requireHousehold } from "@/lib/chat/auth";
import { getRun, refreshRun, startUndo } from "@/lib/change/runs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const a = await requireHousehold();
  if (!a.ok) return a.response;
  const { runId } = await params;
  if (!UUID.test(runId)) return Response.json({ error: "Ongeldig id" }, { status: 400 });
  const row = await getRun(runId);
  if (!row) return Response.json({ error: "Niet gevonden" }, { status: 404 });
  const fresh = await refreshRun(row);
  if (fresh.status !== "live" || fresh.revert_run_id) {
    return Response.json({ error: "Ongedaan maken kan nu niet" }, { status: 409 });
  }
  const r = await startUndo(fresh);
  if (!r.ok) return Response.json({ error: r.error }, { status: 409 });
  return Response.json({ status: "undoing" });
}
