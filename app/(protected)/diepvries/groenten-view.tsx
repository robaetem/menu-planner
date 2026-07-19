"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Carrot, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NameAutocomplete } from "@/components/name-autocomplete";
import { formatMonthDay } from "@/lib/date";
import type { Groente } from "@/lib/types";
import { createGroente, deleteGroente, setGroenteCount } from "./actions";

export function GroentenView({
  groenten,
  groenteNames,
}: {
  groenten: Groente[];
  groenteNames: string[];
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Groente | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const total = groenten.reduce((sum, groente) => sum + groente.count, 0);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (error) {
        toast.error("Mislukt.");
        console.error(error);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Groenten</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Welke groenten liggen er in de diepvries?{total > 0 && ` · ${total} in voorraad`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="size-4" /> Nieuwe groente
        </Button>
      </div>

      {groenten.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <Carrot className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Nog geen groenten in de diepvries</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Houd hier zelf bij welke groenten je hebt ingevroren en pas de aantallen handmatig aan.
          </p>
          <Button className="mt-5" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Eerste groente toevoegen
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {groenten.map((groente) => (
            <div key={groente.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <p className="font-medium">{groente.name}</p>
                  <span className="text-xs text-muted-foreground">{formatMonthDay(groente.created_at)}</span>
                </div>
                <div className="mt-2">
                  <CountStepper
                    name={groente.name}
                    value={groente.count}
                    onChange={(value) => run(() => setGroenteCount(groente.id, value))}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleting(groente)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                aria-label={`${groente.name} verwijderen`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <NewGroenteDialog open={dialogOpen} onOpenChange={setDialogOpen} groenteNames={groenteNames} />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Groente verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>“{deleting?.name}” wordt uit de diepvrieslijst verwijderd.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                const groente = deleting;
                setDeleting(null);
                if (groente) run(() => deleteGroente(groente.id));
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

function CountStepper({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border px-2 py-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label={`Minder ${name}`}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="min-w-8 text-center text-sm font-medium tabular-nums">{value}</span>
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(value + 1)} aria-label={`Meer ${name}`}>
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

function NewGroenteDialog({
  open,
  onOpenChange,
  groenteNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groenteNames: string[];
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
      toast.error("Geef de groente een naam.");
      return;
    }
    setPending(true);
    try {
      await createGroente(name, Number.parseInt(count, 10) || 0);
      toast.success("Groente toegevoegd");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error("Toevoegen mislukt.");
      console.error(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe groente</DialogTitle>
          <DialogDescription>Welke groente heb je ingevroren, en hoeveel porties of verpakkingen?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="ng-name">Naam</Label>
            <NameAutocomplete
              id="ng-name"
              value={name}
              onChange={setName}
              names={groenteNames}
              placeholder="bv. Spitskool"
              autoFocus
              onCommit={onCreate}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ng-count">Aantal</Label>
            <Input
              id="ng-count"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 pb-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button onClick={onCreate} disabled={pending}>
            {pending ? "Toevoegen…" : "Groente toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
