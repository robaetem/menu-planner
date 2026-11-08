"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Beef } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { Vleesje } from "@/lib/types";
import { entryStatus, type FreezerStock } from "@/lib/freezer/stock";
import { FreeCount, HiddenPlanned, NoneFree, OnlyFreeBar, StockPlanned } from "@/components/stock-status";
import { createVleesje, deleteVleesje, setVleesjeCount } from "./actions";

export function VleesjesView({
  vleesjes: allVleesjes,
  vleesjeNames,
  stock,
  adding,
  onAddingChange,
}: {
  vleesjes: Vleesje[];
  /** Reservations by upcoming meals ("ingepland op …") and shortages. */
  stock: FreezerStock;
  vleesjeNames: string[];
  /** The "new" dialog, opened from the button beside the tab picker. */
  adding: boolean;
  onAddingChange: (open: boolean) => void;
}) {
  const [deleting, setDeleting] = React.useState<Vleesje | null>(null);
  const [onlyFree, setOnlyFree] = React.useState(true);
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

  // A batch at 0 is out of the freezer; it isn't listed.
  const vleesjes = allVleesjes.filter((v) => v.count > 0);
  const pieces = (n: number) => String(n);
  const rows = vleesjes.map((v) => {
    const entry = stock.entries.find((e) => e.id === v.id);
    return { v, free: entry ? entryStatus(entry, stock.reservations).free : v.count };
  });
  const freeTotal = rows.reduce((sum, r) => sum + r.free, 0);
  const plannedTotal = rows.reduce((sum, r) => sum + r.v.count - r.free, 0);
  const shown = onlyFree ? rows.filter((r) => r.free > 0) : rows;

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
        <>
          <div className="mt-6">
            <OnlyFreeBar
              onlyFree={onlyFree}
              onChange={setOnlyFree}
              summary={
                <span>
                  <span className="text-2xl font-semibold tabular-nums text-foreground">{freeTotal}</span> vrij
                  {plannedTotal > 0 && <span> · {plannedTotal} ingepland</span>}
                </span>
              }
            />
          </div>
          {shown.length === 0 ? (
            <NoneFree>Alles in de diepvries is al ingepland.</NoneFree>
          ) : (
            <div className="mt-4 space-y-3">
              {shown.map(({ v, free }) => (
                <div
                  key={v.id}
                  className={cn("rounded-xl border p-4", free <= 0 ? "border-dashed bg-muted/30" : "bg-card")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <p className={cn("font-medium", free <= 0 && "text-muted-foreground")}>{v.name}</p>
                      <span className="text-xs text-muted-foreground">{formatMonthDay(v.created_at)}</span>
                    </div>
                    <button
                      onClick={() => setDeleting(v)}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                      aria-label={`${v.name} verwijderen`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <FreeCount
                      free={pieces(free)}
                      total={v.count}
                      caption="in de diepvries"
                      ariaLabel={`${v.name}: ${free} vrij, aanpassen`}
                      onAdd={() => run(() => setVleesjeCount(v.id, v.count + 1))}
                      onRemove={() => run(() => setVleesjeCount(v.id, Math.max(0, v.count - 1)))}
                    />
                    <StockPlanned entry={stock.entries.find((e) => e.id === v.id)} stock={stock} format={pieces} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <HiddenPlanned count={onlyFree ? rows.length - shown.length : 0} onShow={() => setOnlyFree(false)} />
        </>
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
