// change_runs: the ONLY table the chat ever writes, and only through this file
// (never from lib/chat's data tools). Rows are created by request_change.
import { getDb } from "@/lib/supabase/server";
import { dispatchWorkflow } from "./github";
import { derivedFor, FINAL, type RunStatus } from "./status";
import { getWorkerInfo, liveMode, prNumberFromUrl, workerFetch } from "./live";

export type ChangeRun = {
  id: string;
  requested_by: string;
  request: string;
  status: RunStatus;
  summary: string | null;
  reason: string | null;
  pr_number: number | null;
  merge_sha: string | null;
  revert_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export const MAX_RUNS_PER_DAY = 10;
const maxRuns = () => (liveMode() ? 30 : MAX_RUNS_PER_DAY);
const WORKER_LOST_MS = 5 * 60 * 1000;
const COLS = "id, requested_by, request, status, summary, reason, pr_number, merge_sha, revert_run_id, created_at, updated_at";

export async function getRun(id: string): Promise<ChangeRun | null> {
  const { data } = await getDb().from("change_runs").select(COLS).eq("id", id).maybeSingle();
  return (data as ChangeRun | null) ?? null;
}

async function save(id: string, patch: Partial<ChangeRun>) {
  await getDb().from("change_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Bring a run up to date with GitHub; persists what changed. */
export async function refreshRun(row: ChangeRun): Promise<ChangeRun> {
  if (row.status === "undone") return row;
  try {
    if (liveMode()) return await refreshLive(row);
    // A run with an undo requested: follow the revert instead.
    if (row.revert_run_id) {
      const d = await derivedFor("revert", row.id, row.updated_at);
      if (d.status === "live") return await persist(row, { status: "undone", reason: null });
      if (d.status === "failed" || d.status === "blocked") {
        return await persist(row, { status: "live", revert_run_id: null, reason: `Ongedaan maken mislukt: ${d.reason ?? ""}`.trim() });
      }
      return await persist(row, { status: "undoing" });
    }
    if (FINAL.includes(row.status)) return row;
    const d = await derivedFor("change", row.id, row.created_at);
    return await persist(row, {
      status: d.status,
      summary: d.summary ?? row.summary,
      reason: d.reason ?? null,
      pr_number: d.prNumber ?? row.pr_number,
      merge_sha: d.mergeSha ?? row.merge_sha,
    });
  } catch (e) {
    console.error("[change] refresh failed", e);
    return row; // GitHub hiccup: keep the last known state
  }
}

/** Live mode: the worker is the source of truth. */
async function refreshLive(row: ChangeRun): Promise<ChangeRun> {
  if (!row.revert_run_id && FINAL.includes(row.status)) return row;
  const w = await getWorkerInfo(row.id);
  if (!w) {
    if (!row.revert_run_id && Date.now() - new Date(row.created_at).getTime() > WORKER_LOST_MS) {
      return persist(row, { status: "failed", reason: "De wijziging is onderbroken" });
    }
    return row;
  }
  if (row.revert_run_id) {
    if (w.status === "undone") return persist(row, { status: "undone", reason: null });
    if (w.status === "live" && w.reason) {
      return persist(row, { status: "live", revert_run_id: null, reason: `Ongedaan maken mislukt: ${w.reason}`.trim() });
    }
    return persist(row, { status: "undoing" });
  }
  return persist(row, {
    status: w.status,
    summary: w.summary ?? row.summary,
    reason: w.reason ?? null,
    pr_number: prNumberFromUrl(w.prUrl) ?? row.pr_number,
  });
}

async function persist(row: ChangeRun, patch: Partial<ChangeRun>): Promise<ChangeRun> {
  const next = { ...row, ...patch };
  const changed = (Object.keys(patch) as (keyof ChangeRun)[]).some((k) => patch[k] !== row[k]);
  if (changed) await save(row.id, patch);
  return next;
}

export function canUndo(r: ChangeRun): boolean {
  return r.status === "live" && !r.revert_run_id;
}

export type StartResult = { ok: true; runId: string } | { ok: false; error: string };

/** Create a run and start the app-change workflow. Enforces the rate limits. */
export async function startChange(email: string, request: string, images?: string[]): Promise<StartResult> {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent } = await db.from("change_runs").select(COLS).gte("created_at", since);
  const rows = (recent ?? []) as ChangeRun[];
  if (rows.length >= maxRuns()) return { ok: false, error: `Er zijn vandaag al ${maxRuns()} wijzigingen aangevraagd. Probeer het morgen opnieuw.` };
  for (const r of rows.filter((x) => !FINAL.includes(x.status) || x.status === "undoing")) {
    const fresh = await refreshRun(r);
    if (!FINAL.includes(fresh.status)) return { ok: false, error: "Er loopt nog een wijziging. Wacht tot die klaar is." };
  }
  const { data, error } = await db
    .from("change_runs")
    .insert({ requested_by: email, request: request.slice(0, 4000), status: "queued" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Kon de wijziging niet opslaan." };
  try {
    if (liveMode()) {
      const res = await workerFetch("/changes", {
        method: "POST",
        body: JSON.stringify({ id: data.id, request: request.slice(0, 4000), requestedBy: email, images }),
      });
      if (!res.ok) throw new Error(`worker ${res.status}`);
    } else {
      await dispatchWorkflow("app-change.yml", { request: request.slice(0, 4000), run_id: data.id });
    }
  } catch {
    await save(data.id, { status: "failed", reason: "Kon de wijziging niet starten" });
    return { ok: false, error: "Kon de wijziging niet starten." };
  }
  return { ok: true, runId: data.id };
}

/** Start app-revert.yml for a live run. Claims the run first so it runs once. */
export async function startUndo(row: ChangeRun): Promise<StartResult> {
  const db = getDb();
  const { data } = await db
    .from("change_runs")
    .update({ revert_run_id: row.id, status: "undoing", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "live")
    .is("revert_run_id", null)
    .select("id");
  if (!data?.length) return { ok: false, error: "Ongedaan maken kan nu niet." };
  try {
    if (liveMode()) {
      const res = await workerFetch(`/changes/${encodeURIComponent(row.id)}/undo`, { method: "POST" });
      if (!res.ok) throw new Error(`worker ${res.status}`);
    } else {
      await dispatchWorkflow("app-revert.yml", { run_id: row.id });
    }
  } catch {
    await save(row.id, { status: "live", revert_run_id: null });
    return { ok: false, error: "Kon het ongedaan maken niet starten." };
  }
  return { ok: true, runId: row.id };
}
