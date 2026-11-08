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
import { cn } from "@/lib/utils";
import {
  formatGroenteQuantity,
  GROENTE_UNITS,
  normalizeGroenteUnit,
  type GroenteUnit,
} from "@/lib/freezer/inventory";
import type { Groente } from "@/lib/types";
import { entryStatus, type FreezerStock } from "@/lib/freezer/stock";
import { HiddenPlanned, NoneFree, OnlyFreeBar, StockPlanned } from "@/components/stock-status";
import { createGroente, deleteGroente, updateGroente } from "./actions";

export function GroentenView({
  groenten,
  groenteNames,
  stock,
  adding,
  onAddingChange,
}: {
  groenten: Groente[];
  /** Reservations by upcoming meals ("ingepland op …") and shortages. */
  stock: FreezerStock;
  groenteNames: string[];
  /** The "new" dialog, opened from the button beside the tab picker. */
  adding: boolean;
  onAddingChange: (open: boolean) => void;
}) {
  const [editing, setEditing] = React.useState<Groente | null>(null);
  const [deleting, setDeleting] = React.useState<Groente | null>(null);
  const [onlyFree, setOnlyFree] = React.useState(true);
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

  const qty = (g: Groente, n: number) => formatGroenteQuantity(n, normalizeGroenteUnit(g.unit));
  const rows = groenten.map((g) => {
    const entry = stock.entries.find((e) => e.id === g.id);
    const total = Number(g.amount ?? g.count);
    return { g, total, free: entry ? entryStatus(entry, stock.reservations).free : total };
  });
  // Free totals per unit ("300 gram · 2 stuks"): units can't be added together.
  const freeByUnit = new Map<GroenteUnit, number>();
  for (const r of rows) {
    const unit = normalizeGroenteUnit(r.g.unit);
    freeByUnit.set(unit, (freeByUnit.get(unit) ?? 0) + Math.max(0, r.free));
  }
  const freeSummary = [...freeByUnit.entries()].filter(([, n]) => n > 0).map(([u, n]) => formatGroenteQuantity(n, u));
  const shown = onlyFree ? rows.filter((r) => r.free > 0) : rows;

  return (
    <div>

      {groenten.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <Carrot className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Nog geen groenten in de diepvries</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Voeg een groente toe telkens je groenten invriest. Daarna kan je ze kiezen bij het plannen.
          </p>
          <Button className="mt-5" onClick={() => onAddingChange(true)}>
            <Plus className="size-4" /> Eerste groente toevoegen
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <OnlyFreeBar
              onlyFree={onlyFree}
              onChange={setOnlyFree}
              summary={
                <span>
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    {freeSummary.length ? freeSummary.join(" · ") : "0"}
                  </span>{" "}
                  vrij
                </span>
              }
            />
          </div>
          {shown.length === 0 ? (
            <NoneFree>Alles in de diepvries is al ingepland.</NoneFree>
          ) : (
            <div className="mt-4 space-y-3">
              {shown.map(({ g: groente, free, total }) => (
                <div
                  key={groente.id}
                  className={cn("rounded-xl border p-4", free <= 0 ? "border-dashed bg-muted/30" : "bg-card")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <p className={cn("font-medium", free <= 0 && "text-muted-foreground")}>{groente.name}</p>
                      <span className="text-xs text-muted-foreground">{formatMonthDay(groente.created_at)}</span>
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
                  <div className="mt-2 space-y-1.5">
                    <p className={cn("tabular-nums", free <= 0 ? "text-base text-muted-foreground" : "text-xl font-semibold")}>
                      {qty(groente, Math.max(0, free))} <span className="text-sm font-normal text-muted-foreground">vrij</span>
                    </p>
                    <StockPlanned
                      entry={stock.entries.find((e) => e.id === groente.id)}
                      stock={stock}
                      format={(n) => qty(groente, n)}
                    />
                    {free > 0 && total - free > 0 && (
                      <p className="text-xs text-muted-foreground">{qty(groente, total)} in de diepvries</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <HiddenPlanned count={onlyFree ? rows.length - shown.length : 0} onShow={() => setOnlyFree(false)} />
        </>
      )}

      <GroenteDialog open={adding} onOpenChange={onAddingChange} groente={null} groenteNames={groenteNames} />
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
