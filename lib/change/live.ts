// Live mode: app changes go to the local worker instead of GitHub Actions.
// Set LIVE_WORKER_URL (+ LIVE_WORKER_TOKEN) on the live app only; unset on Vercel.
import type { RunStatus } from "./status";

export const liveMode = () => !!process.env.LIVE_WORKER_URL;

export type WorkerInfo = {
  status: RunStatus;
  step?: string;
  summary?: string;
  reason?: string;
  prUrl?: string;
  canUndo?: boolean;
  timings?: { totalMs?: number; undoMs?: number; [k: string]: number | undefined };
};

/** Fetch the worker. Throws on network errors/timeouts; returns the Response otherwise. */
export function workerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${process.env.LIVE_WORKER_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.LIVE_WORKER_TOKEN ?? ""}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

// Last worker answer per run, so the status route can pass step/timings through.
const last = new Map<string, WorkerInfo>();
export const lastWorkerInfo = (id: string) => last.get(id);

/** null = worker 404; throws when unreachable or broken. */
export async function getWorkerInfo(id: string): Promise<WorkerInfo | null> {
  const res = await workerFetch(`/changes/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`worker ${res.status}`);
  const info = (await res.json()) as WorkerInfo;
  last.set(id, info);
  if (last.size > 200) last.clear();
  return info;
}

export function prNumberFromUrl(url?: string): number | undefined {
  const n = url?.match(/\/pull\/(\d+)/)?.[1];
  return n ? Number(n) : undefined;
}
