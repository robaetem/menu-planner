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
import { formatMonthDay } from "@/lib/date";
import type { Diner, Potje } from "@/lib/types";
import { createPotje, deletePotje, setPotjeCount } from "./actions";

type Filter = "robin" | "amber" | "samen";

export function PotjesView({
  potjes,
  diners,
  potjeNames,
}: {
  potjes: Potje[];
  diners: Diner[];
  potjeNames: string[];
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Potje | null>(null);
  const [filter, setFilter] = React.useState<Filter | null>(null);
  const router = useRouter();
  const [, start] = useTransition();
  const robinLabel = diners.find((d) => d.key === "robin")?.label ?? "Robin";
  const amberLabel = diners.find((d) => d.key === "amber")?.label ?? "Amber";

  // Badge totals: Robin/Amber are sums of instances; Samen counts the jars that
  // exist for BOTH (min per potje), so a shared potje is counted in all three.
  const robinTotal = potjes.reduce((s, p) => s + p.robin_count, 0);
  const amberTotal = potjes.reduce((s, p) => s + p.amber_count, 0);
  const samenTotal = potjes.reduce((s, p) => s + Math.min(p.robin_count, p.amber_count), 0);

  function matches(p: Potje, f: Filter): boolean {
    if (f === "robin") return p.robin_count > 0;
    if (f === "amber") return p.amber_count > 0;
    return p.robin_count > 0 && p.amber_count > 0;
  }
  const shown = filter ? potjes.filter((p) => matches(p, filter)) : potjes;

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
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Potjes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Wat ligt er in de diepvries?</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="size-4" /> Nieuw potje
        </Button>
      </div>

      {potjes.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <FilterBadge label={robinLabel} count={robinTotal} active={filter === "robin"} onClick={() => setFilter((f) => (f === "robin" ? null : "robin"))} />
          <FilterBadge label={amberLabel} count={amberTotal} active={filter === "amber"} onClick={() => setFilter((f) => (f === "amber" ? null : "amber"))} />
          <FilterBadge label="Samen" count={samenTotal} active={filter === "samen"} onClick={() => setFilter((f) => (f === "samen" ? null : "samen"))} />
        </div>
      )}

      {potjes.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
            <Snowflake className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">De diepvries is leeg</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Voeg een potje toe telkens je een portie invriest. Daarna kan je het inplannen.
          </p>
          <Button className="mt-5" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Eerste potje toevoegen
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Geen potjes voor deze filter.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {shown.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <p className="font-medium">{p.name}</p>
                  <span className="text-xs text-muted-foreground">{formatMonthDay(p.created_at)}</span>
                </div>
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
        potjeNames={potjeNames}
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

function FilterBadge({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary/40",
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "text-primary-foreground/90" : "text-muted-foreground")}>{count}</span>
    </button>
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
  potjeNames,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  robinLabel: string;
  amberLabel: string;
  potjeNames: string[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [robin, setRobin] = React.useState("1");
  const [amber, setAmber] = React.useState("1");
  const [pending, setPending] = React.useState(false);
  const [showSuggest, setShowSuggest] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(-1);

  React.useEffect(() => {
    if (open) {
      setName("");
      setRobin("1");
      setAmber("1");
      setShowSuggest(false);
      setActiveIdx(-1);
    }
  }, [open]);

  // Prefix matches first, then any other substring match — capped, and never
  // suggesting the exact text already typed.
  const suggestions = React.useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const n of potjeNames) {
      const l = n.toLowerCase();
      if (l === q) continue;
      if (l.startsWith(q)) starts.push(n);
      else if (l.includes(q)) contains.push(n);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [name, potjeNames]);

  function choose(value: string) {
    setName(value);
    setShowSuggest(false);
    setActiveIdx(-1);
  }

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
            <div className="relative">
              <Input
                id="np-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setShowSuggest(true);
                  setActiveIdx(-1);
                }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                placeholder="bv. Gehaktballetjes in tomatensaus"
                autoComplete="off"
                autoFocus
                role="combobox"
                aria-expanded={showSuggest && suggestions.length > 0}
                aria-autocomplete="list"
                onKeyDown={(e) => {
                  const open = showSuggest && suggestions.length > 0;
                  if (e.key === "ArrowDown" && open) {
                    e.preventDefault();
                    setActiveIdx((i) => (i + 1) % suggestions.length);
                  } else if (e.key === "ArrowUp" && open) {
                    e.preventDefault();
                    setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
                  } else if (e.key === "Enter") {
                    if (open && activeIdx >= 0) {
                      e.preventDefault();
                      choose(suggestions[activeIdx]);
                    } else {
                      onCreate();
                    }
                  } else if (e.key === "Escape" && open) {
                    e.preventDefault();
                    setShowSuggest(false);
                  }
                }}
              />
              {showSuggest && suggestions.length > 0 && (
                <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
                  {suggestions.map((s, i) => (
                    <li key={s}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          choose(s);
                        }}
                        onMouseEnter={() => setActiveIdx(i)}
                        className={cn(
                          "w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm",
                          i === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                        )}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
