import { requireHousehold } from "@/lib/chat/auth";
import { lastWorkerInfo, liveMode } from "@/lib/change/live";
import { canUndo, getRun, refreshRun } from "@/lib/change/runs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const a = await requireHousehold();
  if (!a.ok) return a.response;
  const { runId } = await params;
  if (!UUID.test(runId)) return Response.json({ error: "Ongeldig id" }, { status: 400 });
  const row = await getRun(runId);
  if (!row) return Response.json({ error: "Niet gevonden" }, { status: 404 });
  const r = await refreshRun(row);
  const live = liveMode();
  const w = live ? lastWorkerInfo(r.id) : undefined;
  return Response.json({
    live,
    step: w?.step,
    timings: w?.timings,
    status: r.status,
    summary: r.summary ?? undefined,
    reason: r.reason ?? undefined,
    prUrl: r.pr_number ? `https://github.com/${process.env.GITHUB_REPO || "robaetem/menu-planner"}/pull/${r.pr_number}` : undefined,
    canUndo: canUndo(r),
  });
}
