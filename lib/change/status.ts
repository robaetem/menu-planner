// Derives a change run's status live from GitHub. `derive` is pure (tested with
// fixtures); `fetchFacts` gathers the facts.
import { gh, repo } from "./github";

export type RunStatus =
  | "queued" | "running" | "checking" | "blocked" | "failed" | "deploying" | "live" | "undoing" | "undone";
export const FINAL: RunStatus[] = ["live", "failed", "blocked", "undone"];

export type Facts = {
  workflow: { status: string; conclusion: string | null } | null;
  pr: {
    number: number;
    html_url: string;
    body: string | null;
    state: string;
    merged_at: string | null;
    merge_commit_sha: string | null;
    head_sha: string;
  } | null;
  checks: { name: string; status: string; conclusion: string | null; output?: { title?: string | null; summary?: string | null } }[];
  deploy: "success" | "pending" | "failure" | null;
  ageMs: number;
};

export type Derived = {
  status: Exclude<RunStatus, "undoing" | "undone">;
  summary?: string;
  reason?: string;
  prUrl?: string;
  prNumber?: number;
  mergeSha?: string;
};

const BAD = ["failure", "timed_out", "cancelled", "action_required", "startup_failure"];
const STALE_MS = 2 * 60 * 60 * 1000;
const NO_RUN_MS = 5 * 60 * 1000;

export function firstParagraph(body: string | null | undefined): string | undefined {
  const p = (body ?? "").split(/\n\s*\n/).map((s) => s.replace(/^#+\s*/gm, "").trim()).find(Boolean);
  return p ? p.slice(0, 500) : undefined;
}

export function derive(f: Facts): Derived {
  const pr = f.pr;
  const base: Derived = { status: "queued" };
  if (pr) {
    Object.assign(base, { prUrl: pr.html_url, prNumber: pr.number, summary: firstParagraph(pr.body) });
    if (pr.merged_at) {
      const mergeSha = pr.merge_commit_sha ?? undefined;
      if (f.deploy === "success") return { ...base, status: "live", mergeSha };
      if (f.deploy === "failure") return { ...base, status: "failed", mergeSha, reason: "De publicatie is mislukt" };
      if (f.ageMs > STALE_MS) return { ...base, status: "failed", mergeSha, reason: "Publicatie duurde te lang" };
      return { ...base, status: "deploying", mergeSha };
    }
    if (pr.state === "closed") return { ...base, status: "failed", reason: "De wijziging is niet doorgevoerd" };
    const guard = f.checks.find((c) => /guardrail/i.test(c.name));
    if (guard && guard.status === "completed" && guard.conclusion && BAD.includes(guard.conclusion)) {
      const reason = (guard.output?.summary || guard.output?.title || "De veiligheidscontrole heeft dit geblokkeerd").slice(0, 500);
      return { ...base, status: "blocked", reason };
    }
    const failed = f.checks.find((c) => c.status === "completed" && c.conclusion && BAD.includes(c.conclusion));
    if (failed) return { ...base, status: "failed", reason: `Controle "${failed.name}" is mislukt` };
    return { ...base, status: "checking" };
  }
  const w = f.workflow;
  if (!w) {
    return f.ageMs > NO_RUN_MS ? { status: "failed", reason: "De wijziging is nooit gestart" } : { status: "queued" };
  }
  if (w.status === "completed") {
    if (w.conclusion && BAD.includes(w.conclusion)) return { status: "failed", reason: "De wijziging kon niet gemaakt worden" };
    return { status: "failed", reason: "Er is geen wijziging gemaakt" };
  }
  if (f.ageMs > STALE_MS) return { status: "failed", reason: "De wijziging duurde te lang" };
  return { status: w.status === "queued" || w.status === "waiting" || w.status === "pending" ? "queued" : "running" };
}

const cache = new Map<string, { at: number; value: Derived }>();
const TTL = 3000;

/** kind: "change" (workflow app-change.yml, branch change/<id>) or "revert". */
export async function derivedFor(kind: "change" | "revert", runId: string, createdAt: string): Promise<Derived> {
  const key = `${kind}:${runId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = derive(await fetchFacts(kind, runId, createdAt));
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.clear();
  return value;
}

export async function fetchFacts(kind: "change" | "revert", runId: string, createdAt: string): Promise<Facts> {
  const file = kind === "change" ? "app-change.yml" : "app-revert.yml";
  const owner = repo().split("/")[0];
  const [runs, prs] = await Promise.all([
    gh<{ workflow_runs: any[] }>(`/actions/workflows/${file}/runs?per_page=30`),
    gh<any[]>(`/pulls?state=all&head=${encodeURIComponent(`${owner}:${kind}/${runId}`)}&per_page=1`),
  ]);
  const wanted = `${kind} ${runId}`;
  const run = runs.workflow_runs.find((r) => (r.display_title ?? r.name) === wanted) ?? null;
  const pr = prs[0] ?? null;
  let checks: Facts["checks"] = [];
  let deploy: Facts["deploy"] = null;
  if (pr && !pr.merged_at) {
    checks = (await gh<{ check_runs: any[] }>(`/commits/${pr.head.sha}/check-runs?per_page=50`)).check_runs;
    // The guardrail prints its reason as an annotation; surface it as the check summary.
    for (const c of checks) {
      if (/guardrail/i.test(c.name) && c.conclusion === "failure") {
        try {
          const ann = await gh<{ message?: string }[]>(`/check-runs/${c.id}/annotations`);
          const msg = ann.find((a) => a.message)?.message;
          if (msg) c.output = { ...c.output, summary: msg };
        } catch {}
      }
    }
  } else if (pr?.merge_commit_sha) {
    const s = await gh<{ statuses: { context: string; state: string }[] }>(`/commits/${pr.merge_commit_sha}/status`);
    const v = s.statuses.filter((x) => /vercel/i.test(x.context));
    if (v.length) deploy = v.some((x) => x.state === "failure" || x.state === "error") ? "failure" : v.every((x) => x.state === "success") ? "success" : "pending";
  }
  return {
    workflow: run ? { status: run.status, conclusion: run.conclusion } : null,
    pr: pr && {
      number: pr.number,
      html_url: pr.html_url,
      body: pr.body,
      state: pr.state,
      merged_at: pr.merged_at,
      merge_commit_sha: pr.merge_commit_sha,
      head_sha: pr.head.sha,
    },
    checks,
    deploy,
    ageMs: Date.now() - new Date(createdAt).getTime(),
  };
}
