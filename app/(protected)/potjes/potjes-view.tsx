"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Snowflake } from "lucide-react";
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
import {
  potjeFreeTotals,
  potjeOverview,
  type Portion,
  type PotjeOverview,
  type PotjeWhoStatus,
  type Who,
} from "@/lib/freezer/potjes";
import type { Diner } from "@/lib/types";
import {
  FreeCount,
  HiddenPlanned,
  NoneFree,
  OnlyFreeBar,
  PlannedLines,
  formatDayNumeric,
} from "@/components/stock-status";
import { adjustPotje, createPotje, deletePotje } from "./actions";

type Filter = Who | "samen";

const totalFree = (o: PotjeOverview) => o.who.robin.free + o.who.amber.free;

/** "2× di 10/11" style: planned days, grouped when the same day repeats. */
function plannedItems(s: PotjeWhoStatus) {
  const byDay = new Map<string, number>();
  for (const p of s.planned) byDay.set(p.on, (byDay.get(p.on) ?? 0) + 1);
  return [...byDay.entries()].map(([on, n]) => ({
    key: on,
    text: `${n > 1 ? `${n}× ` : ""}ingepland ${formatDayNumeric(on)}`,
  }));
}

export function PotjesView({
  portions,
  today,
  diners,
  potjeNames,
  adding,
  onAddingChange,
}: {
  portions: Portion[];
  today: string;
  diners: Diner[];
  potjeNames: string[];
  /** The "new" dialog, opened from the button beside the tab picker. */
  adding: boolean;
  onAddingChange: (open: boolean) => void;
}) {
  const [deleting, setDeleting] = React.useState<PotjeOverview | null>(null);
  const [filter, setFilter] = React.useState<Filter | null>(null);
  const [onlyFree, setOnlyFree] = React.useState(true);
  const router = useRouter();
  const [pending, start] = useTransition();
  const robinLabel = diners.find((d) => d.key === "robin")?.label ?? "Robin";
  const amberLabel = diners.find((d) => d.key === "amber")?.label ?? "Amber";
  const whoLabel = (w: Who) => (w === "robin" ? robinLabel : amberLabel);

  // One source of truth for "vrij", shared with the chat.
  const overview = React.useMemo(() => potjeOverview(portions, today), [portions, today]);
  const totals = React.useMemo(() => potjeFreeTotals(overview), [overview]);

  function matches(o: PotjeOverview, f: Filter): boolean {
    return f === "samen" ? o.freeSamen > 0 : o.who[f].free > 0;
  }
  const visible = overview.filter((o) => (filter ? matches(o, filter) : true));
  const shown = onlyFree && !filter ? visible.filter((o) => totalFree(o) > 0) : visible;
  const hidden = onlyFree && !filter ? visible.length - shown.length : 0;

  function toggle(f: Filter) {
    setFilter((cur) => (cur === f ? null : f));
  }

  function run(fn: () => Promise<unknown>, done?: (result: unknown) => void) {
    start(async () => {
      try {
        const result = await fn();
        done?.(result);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Mislukt.");
        console.error(e);
      }
    });
  }

  return (
    <div>
      {overview.length > 0 && (
        <div className="mt-6">
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            <Stat label={robinLabel} value={totals.robin} active={filter === "robin"} onClick={() => toggle("robin")} />
            <Stat label={amberLabel} value={totals.amber} active={filter === "amber"} onClick={() => toggle("amber")} />
            <Stat label="Samen" value={totals.samen} active={filter === "samen"} onClick={() => toggle("samen")} />
          </div>
          <div className="mt-4">
            <OnlyFreeBar onlyFree={onlyFree} onChange={setOnlyFree} />
          </div>
        </div>
      )}

      {overview.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
            <Snowflake className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">De diepvries is leeg</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Plan bij een gerecht extra potjes in, of voeg hier toe wat al in de diepvries ligt.
          </p>
          <Button className="mt-5" onClick={() => onAddingChange(true)}>
            <Plus className="size-4" /> Eerste potje toevoegen
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <NoneFree>
          {filter ? "Geen vrije potjes voor deze selectie." : "Alles in de diepvries is al ingepland."}
        </NoneFree>
      ) : (
        <div className="mt-4 space-y-3">
          {shown.map((o) => (
            <PotjeCard
              key={o.key}
              o={o}
              whoLabel={whoLabel}
              pending={pending}
              onAdjust={(w, d) => run(() => adjustPotje(o.name, w, d))}
              onDelete={() => setDeleting(o)}
            />
          ))}
        </div>
      )}
      <HiddenPlanned count={hidden} onShow={() => setOnlyFree(false)} />

      <NewPotjeDialog
        open={adding}
        onOpenChange={onAddingChange}
        robinLabel={robinLabel}
        amberLabel={amberLabel}
        potjeNames={potjeNames}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Potje verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” wordt uit de diepvries verwijderd. Potjes die al ingepland zijn of nog gemaakt
              moeten worden, blijven staan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const g = deleting;
                setDeleting(null);
                if (g)
                  run(
                    () => deletePotje(g.name),
                    (kept) => {
                      if (typeof kept === "number" && kept > 0) {
                        toast.info(`${kept} ${kept === 1 ? "ingepland potje blijft" : "ingeplande potjes blijven"} staan.`);
                      }
                    },
                  );
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

function PotjeCard({
  o,
  whoLabel,
  pending,
  onAdjust,
  onDelete,
}: {
  o: PotjeOverview;
  whoLabel: (w: Who) => string;
  pending: boolean;
  onAdjust: (w: Who, delta: 1 | -1) => void;
  onDelete: () => void;
}) {
  const none = totalFree(o) === 0;
  return (
    <div
      data-potje-group={o.name}
      className={cn("rounded-xl border p-4", none ? "border-dashed bg-muted/30" : "bg-card")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <p className={cn("font-medium", none && "text-muted-foreground")}>{o.name}</p>
          {o.since && <span className="text-xs text-muted-foreground">sinds {formatMonthDay(o.since)}</span>}
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
          aria-label={`${o.name} verwijderen`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(["robin", "amber"] as Who[]).map((w) => {
          const s = o.who[w];
          const label = whoLabel(w);
          const later =
            s.freeLater > 0 && s.freeLaterOn
              ? s.freeNow > 0
                ? `${s.freeLater} vrij vanaf ${formatDayNumeric(s.freeLaterOn)}`
                : `vrij vanaf ${formatDayNumeric(s.freeLaterOn)}`
              : null;
          return (
            <div key={w} className="min-w-0 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <FreeCount
                free={String(s.free)}
                total={s.inFreezer}
                disabled={pending}
                caption={`in de diepvries voor ${label}`}
                ariaLabel={`${label}: ${s.free} vrij, aanpassen`}
                onAdd={() => onAdjust(w, 1)}
                onRemove={() => onAdjust(w, -1)}
              />
              {later && <p className="text-xs text-muted-foreground">{later}</p>}
              <PlannedLines items={plannedItems(s)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-left transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
      )}
    >
      <span className="block text-2xl font-semibold leading-none tabular-nums">{value}</span>
      <span className={cn("mt-1 block text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {label} vrij
      </span>
    </button>
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
