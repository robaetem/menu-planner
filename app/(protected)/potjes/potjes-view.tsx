"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Minus, Trash2, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";
import type { Diner, Potje } from "@/lib/types";
import { createPotje, deletePotje, setPotjeCount } from "./actions";

export function PotjesView({ potjes, diners }: { potjes: Potje[]; diners: Diner[] }) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Potje | null>(null);
  const router = useRouter();
  const [, start] = useTransition();
  const robinLabel = diners.find((d) => d.key === "robin")?.label ?? "Robin";
  const amberLabel = diners.find((d) => d.key === "amber")?.label ?? "Amber";

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

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Potjes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Wat ligt er in de diepvries?</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="size-4" /> Nieuw potje
        </Button>
      </div>

      {potjes.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
            <Snowflake className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">De diepvries is leeg</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Voeg een potje toe telkens je een portie invriest. Daarna kan je het inplannen.
          </p>
          <Button className="mt-5" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Eerste potje toevoegen
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {potjes.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CountPill
                    label={robinLabel}
                    value={p.robin_count}
                    onChange={(v) => run(() => setPotjeCount(p.id, "robin", v))}
                  />
                  <CountPill
                    label={amberLabel}
                    value={p.amber_count}
                    onChange={(v) => run(() => setPotjeCount(p.id, "amber", v))}
                  />
                </div>
              </div>
              <button
                onClick={() => setDeleting(p)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                aria-label={`${p.name} verwijderen`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <NewPotjeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        robinLabel={robinLabel}
        amberLabel={amberLabel}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Potje verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>“{deleting?.name}” wordt uit de diepvries verwijderd.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const p = deleting;
                setDeleting(null);
                if (p) run(() => deletePotje(p.id));
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

function CountPill({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              value > 0 ? "border-border bg-background" : "border-dashed border-border text-muted-foreground",
            )}
          />
        }
      >
        {label} {value}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label="Minder">
            <Minus className="size-3.5" />
          </Button>
          <span className="min-w-8 text-center text-sm font-medium tabular-nums">{value}</span>
          <Button variant="outline" size="icon-sm" onClick={() => onChange(value + 1)} aria-label="Meer">
            <Plus className="size-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">potjes voor {label}</p>
      </PopoverContent>
    </Popover>
  );
}

function NewPotjeDialog({
  open,
  onOpenChange,
  robinLabel,
  amberLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  robinLabel: string;
  amberLabel: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [robin, setRobin] = React.useState("1");
  const [amber, setAmber] = React.useState("1");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setRobin("1");
      setAmber("1");
    }
  }, [open]);

  async function onCreate() {
    if (!name.trim()) {
      toast.error("Geef het potje een naam.");
      return;
    }
    setPending(true);
    try {
      await createPotje(name, parseInt(robin, 10) || 0, parseInt(amber, 10) || 0);
      toast.success("Potje toegevoegd");
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
          <DialogTitle>Nieuw potje</DialogTitle>
          <DialogDescription>Wat heb je ingevroren, en hoeveel potjes voor elk?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="np-name">Naam</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="bv. Gehaktballetjes in tomatensaus"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && onCreate()}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="np-robin">{robinLabel}</Label>
              <Input id="np-robin" type="number" inputMode="numeric" min={0} value={robin} onChange={(e) => setRobin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="np-amber">{amberLabel}</Label>
              <Input id="np-amber" type="number" inputMode="numeric" min={0} value={amber} onChange={(e) => setAmber(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 pb-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button onClick={onCreate} disabled={pending}>
            {pending ? "Toevoegen…" : "Potje toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
