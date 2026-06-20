"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PlanMode } from "@/lib/types";
import { createMode, deleteMode, updateMode } from "./mode-actions";

type Who = "amber" | "robin";

export function ModeManagerDialog({
  open,
  onOpenChange,
  modes,
  amberLabel,
  robinLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  modes: PlanMode[];
  amberLabel: string;
  robinLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  function run(fn: () => Promise<void>, failMsg = "Mislukt.") {
    setBusy(true);
    fn()
      .then(() => router.refresh())
      .catch((e) => {
        toast.error(failMsg);
        console.error(e);
      })
      .finally(() => setBusy(false));
  }

  const amber = modes.filter((m) => m.who === "amber");
  const robin = modes.filter((m) => m.who === "robin");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle>Situaties beheren</DialogTitle>
          <DialogDescription>
            Maak per persoon je eigen situaties aan, hernoem of verwijder ze. Ze verschijnen in de keuzelijst bij elke dag.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <ModeSection who="amber" title={amberLabel} modes={amber} busy={busy} run={run} />
          <ModeSection who="robin" title={robinLabel} modes={robin} busy={busy} run={run} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeSection({
  who,
  title,
  modes,
  busy,
  run,
}: {
  who: Who;
  title: string;
  modes: PlanMode[];
  busy: boolean;
  run: (fn: () => Promise<void>, failMsg?: string) => void;
}) {
  const [draft, setDraft] = React.useState("");

  function onAdd() {
    const l = draft.trim();
    if (!l) return;
    if (modes.some((m) => m.label.toLowerCase() === l.toLowerCase())) {
      toast.error("Die situatie bestaat al.");
      return;
    }
    setDraft("");
    run(() => createMode(who, l), "Toevoegen mislukt.");
  }

  return (
    <section>
      <h4 className="mb-2 text-sm font-semibold tracking-tight">{title}</h4>
      <div className="mb-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="bv. Thuiswerk"
        />
        <Button onClick={onAdd} disabled={busy || !draft.trim()} className="shrink-0">
          <Plus className="size-4" /> Toevoegen
        </Button>
      </div>
      {modes.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Nog geen situaties.</p>
      ) : (
        <ul className="space-y-2">
          {modes.map((m) => (
            <ModeRow
              key={m.id}
              mode={m}
              busy={busy}
              onRename={(label) => run(() => updateMode(m.id, label), "Hernoemen mislukt.")}
              onDelete={() => run(() => deleteMode(m.id), "Verwijderen mislukt.")}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ModeRow({
  mode,
  busy,
  onRename,
  onDelete,
}: {
  mode: PlanMode;
  busy: boolean;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = React.useState(mode.label);
  const [confirming, setConfirming] = React.useState(false);

  // Keep the local field in sync if the mode list refreshes from the server.
  React.useEffect(() => setLabel(mode.label), [mode.label]);

  function commit() {
    const l = label.trim();
    if (!l) {
      setLabel(mode.label);
      return;
    }
    if (l !== mode.label) onRename(l);
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 border-transparent bg-transparent px-2 shadow-none focus-visible:border-input focus-visible:bg-background"
      />
      {/* The toggle button stays mounted across the confirm step — unmounting the
          clicked element makes Base UI treat the trailing pointer event as an
          outside-press and dismiss the whole dialog. */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          key="toggle"
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirming) {
              setConfirming(false);
              onDelete();
            } else {
              setConfirming(true);
            }
          }}
          className={cn(
            "shrink-0 rounded-md p-1.5 transition-colors",
            confirming
              ? "text-destructive hover:bg-destructive/10"
              : "text-muted-foreground hover:text-destructive",
          )}
          aria-label={confirming ? `Bevestig verwijderen ${mode.label}` : `Verwijder ${mode.label}`}
        >
          {confirming ? <Check className="size-4" /> : <Trash2 className="size-4" />}
        </button>
        {confirming && (
          <button
            key="cancel"
            type="button"
            onClick={() => setConfirming(false)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Annuleren"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}
