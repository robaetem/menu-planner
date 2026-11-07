"use client";

import * as React from "react";
import { Check, ExternalLink, RotateCw, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";

export type RunStatus =
  | "queued"
  | "running"
  | "checking"
  | "deploying"
  | "live"
  | "blocked"
  | "failed"
  | "undone";

type RunInfo = {
  status: RunStatus;
  summary?: string;
  reason?: string;
  prUrl?: string;
  canUndo: boolean;
};

const LABELS: Record<RunStatus, string> = {
  queued: "In de wachtrij",
  running: "Code aanpassen",
  checking: "Controleren",
  deploying: "Live zetten",
  live: "Live ✓",
  blocked: "Geblokkeerd",
  failed: "Mislukt",
  undone: "Ongedaan gemaakt",
};

const FINAL: RunStatus[] = ["live", "blocked", "failed", "undone"];
const POLL_MS = 4000;

export function ChangeRunCard({ runId }: { runId: string }) {
  const [info, setInfo] = React.useState<RunInfo | null>(null);
  const [error, setError] = React.useState(false);
  const [undoing, setUndoing] = React.useState(false);
  // Bumped after an undo so polling restarts even if the last status was final.
  const [pollKey, setPollKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const res = await fetch(`/api/change/${encodeURIComponent(runId)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as RunInfo;
        if (cancelled) return;
        setInfo(data);
        setError(false);
        if (FINAL.includes(data.status) && !undoing) return;
      } catch {
        if (cancelled) return;
        setError(true);
      }
      timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, pollKey, undoing]);

  async function undo() {
    setUndoing(true);
    try {
      await fetch(`/api/change/${encodeURIComponent(runId)}/undo`, { method: "POST" });
    } catch {
      setError(true);
    }
    setUndoing(false);
    setPollKey((k) => k + 1);
  }

  const status = info?.status ?? "queued";
  const label = info ? LABELS[status] : error ? "Status ophalen lukt even niet…" : "Status ophalen…";
  const busy = !FINAL.includes(status);
  const bad = status === "blocked" || status === "failed";
  const detail = bad ? (info?.reason ?? info?.summary) : info?.summary;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-3 py-2.5 text-sm",
        bad && "border-destructive/40",
      )}
      data-run-status={status}
    >
      <div className="flex items-center gap-2 font-medium">
        {busy ? (
          <Loader variant="circular" size="sm" />
        ) : status === "live" ? (
          <Check className="size-4 text-emerald-600" />
        ) : bad ? (
          <TriangleAlert className="size-4 text-destructive" />
        ) : (
          <Undo2 className="size-4 text-muted-foreground" />
        )}
        <span>{label}</span>
      </div>
      {detail && <p className="mt-1.5 text-muted-foreground">{detail}</p>}
      {(info?.canUndo || status === "live" || info?.prUrl) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {status === "live" && (
            <Button size="sm" onClick={() => window.location.reload()}>
              <RotateCw className="size-3.5" />
              Ververs om te zien
            </Button>
          )}
          {info?.canUndo && (
            <Button size="sm" variant="outline" onClick={undo} disabled={undoing}>
              <Undo2 className="size-3.5" />
              Maak ongedaan
            </Button>
          )}
          {info?.prUrl && (
            <a
              href={info.prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Bekijk wijziging <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
