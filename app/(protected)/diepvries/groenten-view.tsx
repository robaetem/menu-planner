"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Carrot, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMonthDay } from "@/lib/date";
import {
  formatGroenteQuantity,
  GROENTE_UNITS,
  normalizeGroenteUnit,
  type GroenteUnit,
} from "@/lib/freezer/inventory";
import type { Groente } from "@/lib/types";
import { createGroente, deleteGroente, updateGroente } from "./actions";

export function GroentenView({
  groenten,
  groenteNames,
}: {
  groenten: Groente[];
  groenteNames: string[];
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Groente | null>(null);
  const [deleting, setDeleting] = React.useState<Groente | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

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
            Welke groenten liggen er in de diepvries?{groenten.length > 0 && ` · ${groenten.length} ${groenten.length === 1 ? "soort" : "soorten"}`}
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
            <div key={groente.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <p className="font-medium">{groente.name}</p>
                  <span className="text-xs text-muted-foreground">{formatMonthDay(groente.created_at)}</span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {formatGroenteQuantity(Number(groente.amount ?? groente.count), normalizeGroenteUnit(groente.unit))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(groente)} aria-label={`${groente.name} bewerken`}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleting(groente)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`${groente.name} verwijderen`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <GroenteDialog open={dialogOpen} onOpenChange={setDialogOpen} groente={null} groenteNames={groenteNames} />
      <GroenteDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        groente={editing}
        groenteNames={groenteNames}
      />

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

function GroenteDialog({
  open,
  onOpenChange,
  groente,
  groenteNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groente: Groente | null;
  groenteNames: string[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("1");
  const [unit, setUnit] = React.useState<GroenteUnit>("stuk");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(groente?.name ?? "");
      setAmount(formatInputAmount(Number(groente?.amount ?? groente?.count ?? 1)));
      setUnit(normalizeGroenteUnit(groente?.unit));
    }
  }, [open, groente]);

  async function onSave() {
    if (!name.trim()) {
      toast.error("Geef de groente een naam.");
      return;
    }
    const parsedAmount = Number.parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Geef een geldige hoeveelheid.");
      return;
    }
    setPending(true);
    try {
      if (groente) {
        await updateGroente(groente.id, name, parsedAmount, unit);
        toast.success("Groente bijgewerkt");
      } else {
        await createGroente(name, parsedAmount, unit);
        toast.success("Groente toegevoegd");
      }
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
          <DialogTitle>{groente ? "Groente bewerken" : "Nieuwe groente"}</DialogTitle>
          <DialogDescription>Vul de hoeveelheid in en kies de eenheid die bij je voorraad past.</DialogDescription>
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
              onCommit={onSave}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)] gap-3">
            <div className="space-y-2">
              <Label htmlFor="ng-amount">Hoeveelheid</Label>
              <Input
                id="ng-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ng-unit">Eenheid</Label>
              <Select value={unit} onValueChange={(value) => setUnit(normalizeGroenteUnit(value))}>
                <SelectTrigger id="ng-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROENTE_UNITS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 pb-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button onClick={onSave} disabled={pending}>
            {pending ? "Bewaren…" : groente ? "Wijzigingen bewaren" : "Groente toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatInputAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}
