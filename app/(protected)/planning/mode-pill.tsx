"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, Plus, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PlanMode } from "@/lib/types";
import { PERSON_BADGE, PersonDot } from "@/components/person-badge";
import { DEFAULT_MODE } from "./config";
import { setMode } from "./actions";
import { createMode, deleteMode, updateMode } from "./mode-actions";

type Who = "amber" | "robin";

export function ModePill({
  dayDate,
  who,
  label,
  value,
  options,
}: {
  dayDate: string;
  who: Who;
  label: string;
  value: string | null;
  options: PlanMode[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [menuOpen, setMenuOpen] = React.useState(false);
  // The situation being edited, or "new" for the "+ Nieuw" dialog.
  const [editing, setEditing] = React.useState<PlanMode | "new" | null>(null);
  const active = !!value;
  // Show the option's label for the stored value; fall back to the raw value
  // (e.g. a mode deleted after it was set) so the pill never goes blank.
  const display = value ? options.find((o) => o.value === value)?.label ?? value : DEFAULT_MODE;

  function pick(mode: string | null) {
    start(async () => {
      try {
        await setMode(dayDate, who, mode);
        router.refresh();
      } catch (e) {
        toast.error("Opslaan mislukt.");
        console.error(e);
      }
    });
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                active
                  ? PERSON_BADGE[who]
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                pending && "opacity-60",
              )}
            />
          }
        >
          <PersonDot who={who} className="size-1.5" />
          <span>
            {label}: {display}
          </span>
          <ChevronDown className="size-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuItem onClick={() => pick(null)}>Thuis</DropdownMenuItem>
          <DropdownMenuSeparator />
          {options.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => pick(o.value)} className="pr-1">
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setMenuOpen(false);
                  setEditing(o);
                }}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                aria-label={`${o.label} bewerken`}
              >
                <Settings className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          {options.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => setEditing("new")} className="text-muted-foreground">
            <Plus className="size-3.5" /> Nieuw
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModeDialog
        who={who}
        personLabel={label}
        editing={editing}
        options={options}
        onClose={() => setEditing(null)}
        onCreated={(v) => pick(v)}
      />
    </>
  );
}

/** Create a situation, or rename / delete an existing one. */
function ModeDialog({
  who,
  personLabel,
  editing,
  options,
  onClose,
  onCreated,
}: {
  who: Who;
  personLabel: string;
  editing: PlanMode | "new" | null;
  options: PlanMode[];
  onClose: () => void;
  /** A new situation is set on the day it was created from. */
  onCreated: (value: string) => void;
}) {
  const router = useRouter();
  const isNew = editing === "new";
  const mode = editing && editing !== "new" ? editing : null;
  const [name, setName] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!editing) return;
    setName(mode?.label ?? "");
    setConfirmDelete(false);
  }, [editing, mode]);

  function run(fn: () => Promise<void>, failMsg: string, after?: () => void) {
    setBusy(true);
    fn()
      .then(() => {
        after?.();
        onClose();
        router.refresh();
      })
      .catch((e) => {
        toast.error(failMsg);
        console.error(e);
      })
      .finally(() => setBusy(false));
  }

  function onSave() {
    const l = name.trim();
    if (!l) {
      toast.error("Geef de situatie een naam.");
      return;
    }
    const taken = options.some((o) => o.id !== mode?.id && o.label.toLowerCase() === l.toLowerCase());
    if (taken) {
      toast.error("Die situatie bestaat al.");
      return;
    }
    if (isNew) run(() => createMode(who, l), "Toevoegen mislukt.", () => onCreated(l.toLowerCase()));
    else if (mode && l !== mode.label) run(() => updateMode(mode.id, l), "Hernoemen mislukt.");
    else onClose();
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nieuwe situatie" : "Situatie bewerken"}</DialogTitle>
          <DialogDescription>Voor {personLabel}.</DialogDescription>
        </DialogHeader>
        <form
          id="mode-dialog"
          className="space-y-2 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <Label htmlFor="mode-name">Naam</Label>
          <Input id="mode-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Thuiswerk" autoFocus />
        </form>
        {mode && confirmDelete && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Dagen met “{mode.label}” gaan terug naar Thuis.
          </p>
        )}
        <DialogFooter className="gap-2 pb-1 sm:justify-between">
          {mode ? (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() =>
                confirmDelete ? run(() => deleteMode(mode.id), "Verwijderen mislukt.") : setConfirmDelete(true)
              }
            >
              {confirmDelete ? "Ja, verwijderen" : "Verwijderen"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Annuleren
            </Button>
            <Button type="submit" form="mode-dialog" disabled={busy}>
              {busy ? "Opslaan…" : isNew ? "Toevoegen" : "Opslaan"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
