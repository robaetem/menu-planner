"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// App-code changes go through the server tool request_change and ChangeRunCard, not through this card.
export const APPLY_ROUTE = "/api/chat/apply";

type ToolName = "proposeChange";

export type AddToolResult = (args: {
  tool: string;
  toolCallId: string;
  output: unknown;
}) => void | Promise<void>;

type Props = {
  tool: ToolName;
  toolCallId: string;
  state?: string;
  input?: { title?: string; ops?: unknown[]; request?: string };
  output?: { declined?: boolean; undoId?: string; error?: string } | undefined;
  addToolResult: AddToolResult;
};

/** A failure the server explained ({ ok:false, error } with a non-200 status) is returned as data; anything else throws. */
async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok && typeof json.error !== "string") throw new Error(String(res.status));
  return json;
}

const NETWORK_ERROR = "Er is geen verbinding met de app. Controleer je internet en probeer het opnieuw.";
const SERVER_ERROR = "Er ging iets mis aan onze kant. Er is niets veranderd; probeer het straks opnieuw.";

export function ApprovalCard({ tool, toolCallId, state, input, output, addToolResult }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [undone, setUndone] = React.useState(false);
  const title = input?.title ?? "Wijziging";
  const answered = state === "output-available";
  const declined = answered && output?.declined === true;
  const failed = answered && !!output?.error;
  const done = answered && !declined && !failed;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await post(APPLY_ROUTE, { ops: input?.ops ?? [] });
      await addToolResult({ tool, toolCallId, output: res });
      // Show the change in the planning behind the chat right away.
      router.refresh();
    } catch (e) {
      setError(e instanceof TypeError ? NETWORK_ERROR : SERVER_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    await addToolResult({ tool, toolCallId, output: { declined: true } });
  }

  async function undo() {
    if (!output?.undoId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post(`${APPLY_ROUTE}/${encodeURIComponent(output.undoId)}/undo`);
      if (r.ok === false) {
        setError(typeof r.error === "string" ? r.error : "Ongedaan maken lukte niet.");
        return;
      }
      setUndone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof TypeError ? NETWORK_ERROR : "Ongedaan maken lukte niet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-3.5 text-sm">
      <p className="font-medium leading-snug">{title}</p>
      {!answered ? (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={approve} className="bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">
            Doen
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={decline}>
            Niet doen
          </Button>
        </div>
      ) : declined ? (
        <p className="text-xs text-muted-foreground">Niet gedaan</p>
      ) : failed ? (
        <p className="text-xs text-destructive">{output?.error || "Dat lukte niet."}</p>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{undone ? "Ongedaan gemaakt" : "Gedaan"}</span>
          {done && !undone && output?.undoId && (
            <button
              type="button"
              disabled={busy}
              onClick={undo}
              className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              Ongedaan maken
            </button>
          )}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
