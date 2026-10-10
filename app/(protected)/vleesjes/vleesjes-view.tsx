"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Minus, Trash2, Beef } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NameAutocomplete } from "@/components/name-autocomplete";
import { formatMonthDay } from "@/lib/date";
import type { Vleesje } from "@/lib/types";
import { createVleesje, deleteVleesje, setVleesjeCount } from "./actions";

export function VleesjesView({
  vleesjes: allVleesjes,
  vleesjeNames,
  adding,
  onAddingChange,
}: {
  vleesjes: Vleesje[];
  vleesjeNames: string[];
  /** The "new" dialog, opened from the button beside the tab picker. */
  adding: boolean;
  onAddingChange: (open: boolean) => void;
}) {
  const [deleting, setDeleting] = React.useState<Vleesje | null>(null);
  const router = useRouter();
  const [, start] = useTransition();

  function run(fn: () => Promise<void>) {
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error("Mislukt.");
        console.error(e);
      }
    });
  }

  // A batch at 0 is out of the freezer. Its row stays so a meal that gets
  // unplanned can put its vleesjes back onto it, but it isn't listed.
  const vleesjes = allVleesjes.filter((v) => v.count > 0);
  const total = vleesjes.reduce((s, v) => s + v.count, 0);

  return (
    <div>

      {vleesjes.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
            <Beef className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Nog geen vlees in de diepvries</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Voeg een vleesje toe telkens je vlees invriest. Daarna kan je het kiezen bij het plannen.
          </p>
          <Button className="mt-5" onClick={() => onAddingChange(true)}>
            <Plus className="size-4" /> Eerste vleesje toevoegen
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {vleesjes.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <p className="font-medium">{v.name}</p>
                  <span className="text-xs text-muted-foreground">{formatMonthDay(v.created_at)}</span>
                </div>
                <div className="mt-2">
                  <CountStepper value={v.count} onChange={(n) => run(() => setVleesjeCount(v.id, n))} />
                </div>
              </div>
              <button
                onClick={() => setDeleting(v)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                aria-label={`${v.name} verwijderen`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <NewVleesjeDialog open={adding} onOpenChange={onAddingChange} vleesjeNames={vleesjeNames} />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vleesje verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>“{deleting?.name}” wordt uit de diepvries verwijderd.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const v = deleting;
                setDeleting(null);
                if (v) run(() => deleteVleesje(v.id));
              }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CountStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border px-2 py-1">
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label="Minder">
        <Minus className="size-3.5" />
      </Button>
      <span className="min-w-8 text-center text-sm font-medium tabular-nums">{value}</span>
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(value + 1)} aria-label="Meer">
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

function NewVleesjeDialog({
  open,
  onOpenChange,
  vleesjeNames,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vleesjeNames: string[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [count, setCount] = React.useState("1");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setCount("1");
    }
  }, [open]);

  async function onCreate() {
    if (!name.trim()) {
      toast.error("Geef het vleesje een naam.");
      return;
    }
    setPending(true);
    try {
      await createVleesje(name, parseInt(count, 10) || 0);
      toast.success("Vleesje toegevoegd");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error("Toevoegen mislukt.");
      console.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuw vleesje</DialogTitle>
          <DialogDescription>Welk vlees heb je ingevroren, en hoeveel stuks?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="nv-name">Naam</Label>
            <NameAutocomplete
              id="nv-name"
              value={name}
              onChange={setName}
              names={vleesjeNames}
              placeholder="bv. Krokante kipfilet"
              autoFocus
              onCommit={onCreate}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nv-count">Aantal</Label>
            <Input id="nv-count" type="number" inputMode="numeric" min={0} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 pb-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button onClick={onCreate} disabled={pending}>
            {pending ? "Toevoegen…" : "Vleesje toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
