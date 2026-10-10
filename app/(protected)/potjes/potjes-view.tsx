"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Minus, Trash2, Snowflake, CalendarCheck, CookingPot } from "lucide-react";
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
import { formatDayShort, formatMonthDay } from "@/lib/date";
import { isInFreezer, nameKey, readyOn, type Portion, type Who } from "@/lib/freezer/potjes";
import type { Diner } from "@/lib/types";
import { PERSON_BADGE, PersonDot } from "@/components/person-badge";
import { adjustPotje, createPotje, deletePotje } from "./actions";

type Filter = "robin" | "amber" | "samen";

type Group = {
  key: string;
  name: string;
  portions: Portion[];
  inFreezer: Record<Who, number>;
  /** Oldest day something of this went in (for the "sinds" label). */
  since: string | null;
  /** Still to be cooked, per person. */
  coming: Record<Who, number>;
  /** Meals that cook some of this, and meals that eat some of it, soonest first. */
  cooking: MealRef[];
  planned: MealRef[];
};

type MealRef = { mealId: string; on: string; whos: Who[] };

function mealRefs(list: Portion[], meal: (p: Portion) => { id: string | null; on: string | null }): MealRef[] {
  const byMeal = new Map<string, MealRef>();
  for (const p of list) {
    const { id, on } = meal(p);
    if (!id || !on) continue;
    const m = byMeal.get(id) ?? { mealId: id, on, whos: [] };
    if (!m.whos.includes(p.who)) m.whos.push(p.who);
    byMeal.set(id, m);
  }
  return [...byMeal.values()].sort((a, b) => a.on.localeCompare(b.on));
}

function buildGroups(portions: Portion[], today: string): Group[] {
  const byName = new Map<string, Portion[]>();
  for (const p of portions) byName.set(nameKey(p.name), [...(byName.get(nameKey(p.name)) ?? []), p]);

  const groups = [...byName.entries()].map(([key, list]): Group => {
    const inFreezer = list.filter((p) => isInFreezer(p, today));
    const notYet = list.filter((p) => !isInFreezer(p, today));
    const since = inFreezer
      .map((p) => (p.sourceMealId ? p.cookOn : p.frozenOn))
      .filter((d): d is string => !!d)
      .sort()[0] ?? null;
    return {
      key,
      name: list[0].name,
      portions: list,
      inFreezer: {
        robin: inFreezer.filter((p) => p.who === "robin").length,
        amber: inFreezer.filter((p) => p.who === "amber").length,
      },
      since,
      coming: {
        robin: notYet.filter((p) => p.who === "robin").length,
        amber: notYet.filter((p) => p.who === "amber").length,
      },
      cooking: mealRefs(notYet, (p) => ({ id: p.sourceMealId, on: p.cookOn })),
      planned: mealRefs(list, (p) => ({ id: p.eatenByMealId, on: p.eatenOn })),
    };
  });

  // What is in the freezer first (oldest first), then what is still to be made.
  const firstReady = (g: Group) =>
    g.portions.map((p) => readyOn(p) ?? "").sort()[0] ?? "";
  return groups.sort((a, b) => {
    const fa = a.inFreezer.robin + a.inFreezer.amber > 0;
    const fb = b.inFreezer.robin + b.inFreezer.amber > 0;
    if (fa !== fb) return fa ? -1 : 1;
    if (fa) return (a.since ?? "").localeCompare(b.since ?? "") || a.name.localeCompare(b.name, "nl");
    return firstReady(a).localeCompare(firstReady(b));
  });
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
  const [deleting, setDeleting] = React.useState<Group | null>(null);
  const [filter, setFilter] = React.useState<Filter | null>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const robinLabel = diners.find((d) => d.key === "robin")?.label ?? "Robin";
  const amberLabel = diners.find((d) => d.key === "amber")?.label ?? "Amber";
  const whoLabel = (w: Who) => (w === "robin" ? robinLabel : amberLabel);

  const groups = React.useMemo(() => buildGroups(portions, today), [portions, today]);

  // Badge totals count what is in the freezer today; Samen counts the dishes
  // there is one of for BOTH (min per dish), so a shared dish shows in all three.
  const robinTotal = groups.reduce((s, g) => s + g.inFreezer.robin, 0);
  const amberTotal = groups.reduce((s, g) => s + g.inFreezer.amber, 0);
  const samenTotal = groups.reduce((s, g) => s + Math.min(g.inFreezer.robin, g.inFreezer.amber), 0);

  function matches(g: Group, f: Filter): boolean {
    if (f === "robin") return g.inFreezer.robin > 0;
    if (f === "amber") return g.inFreezer.amber > 0;
    return g.inFreezer.robin > 0 && g.inFreezer.amber > 0;
  }
  const shown = filter ? groups.filter((g) => matches(g, filter)) : groups;

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

      {groups.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <FilterBadge who="robin" label={robinLabel} count={robinTotal} active={filter === "robin"} onClick={() => setFilter((f) => (f === "robin" ? null : "robin"))} />
          <FilterBadge who="amber" label={amberLabel} count={amberTotal} active={filter === "amber"} onClick={() => setFilter((f) => (f === "amber" ? null : "amber"))} />
          <FilterBadge label="Samen" count={samenTotal} active={filter === "samen"} onClick={() => setFilter((f) => (f === "samen" ? null : "samen"))} />
        </div>
      )}

      {groups.length === 0 ? (
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
        <div className="mt-6 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Geen potjes voor deze filter.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {shown.map((g) => (
            <div key={g.key} data-potje-group={g.name} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <p className="font-medium">{g.name}</p>
                    {g.since && <span className="text-xs text-muted-foreground">sinds {formatMonthDay(g.since)}</span>}
                  </div>
                  {g.inFreezer.robin + g.inFreezer.amber === 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["robin", "amber"] as Who[]).map((w) => (
                        <span
                          key={w}
                          className={cn(
                            "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium",
                            g.coming[w] > 0 ? PERSON_BADGE[w] : "border-dashed text-muted-foreground",
                          )}
                        >
                          {whoLabel(w)} {g.coming[w]}
                        </span>
                      ))}
                    </div>
                  ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["robin", "amber"] as Who[]).map((w) => (
                      <CountPill
                        key={w}
                        who={w}
                        label={whoLabel(w)}
                        value={g.inFreezer[w]}
                        pending={pending}
                        onAdd={() => run(() => adjustPotje(g.name, w, 1))}
                        onRemove={() => run(() => adjustPotje(g.name, w, -1))}
                      />
                    ))}
                  </div>
                  )}
                  {g.cooking.length + g.planned.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {g.cooking.map((m) => (
                        <span
                          key={`cook-${m.mealId}`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        >
                          <CookingPot className="size-3" />
                          Wordt gemaakt {formatDayShort(m.on)} ·
                          <WhoTag whos={m.whos} label={whoLabel} />
                        </span>
                      ))}
                      {g.planned.map((m) => (
                        <span
                          key={m.mealId}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        >
                          <CalendarCheck className="size-3" />
                          Ingepland {formatDayShort(m.on)} ·
                          <WhoTag whos={m.whos} label={whoLabel} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setDeleting(g)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`${g.name} verwijderen`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

/** Who a planned/cooking line is for: a dot per person, then the name (or Samen). */
function WhoTag({ whos, label }: { whos: Who[]; label: (w: Who) => string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[...whos].sort().map((w) => (
        <PersonDot key={w} who={w} className="size-1.5" />
      ))}
      {whos.length === 2 ? "Samen" : label(whos[0])}
    </span>
  );
}

function FilterBadge({
  who,
  label,
  count,
  active,
  onClick,
}: {
  who?: Who;
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
          ? who
            ? cn(PERSON_BADGE[who], "border-current")
            : "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary/40",
      )}
    >
      {who && <PersonDot who={who} />}
      {label}
      <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

/** In-the-freezer count for one person, with +/- for hand corrections. */
function CountPill({
  who,
  label,
  value,
  pending,
  onAdd,
  onRemove,
}: {
  who: Who;
  label: string;
  value: number;
  pending: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              value > 0 ? PERSON_BADGE[who] : "border-dashed border-border text-muted-foreground",
            )}
          />
        }
      >
        {label} {value}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={onRemove} disabled={value <= 0 || pending} aria-label="Minder">
            <Minus className="size-3.5" />
          </Button>
          <span className="min-w-8 text-center text-sm font-medium tabular-nums">{value}</span>
          <Button variant="outline" size="icon-sm" onClick={onAdd} disabled={pending} aria-label="Meer">
            <Plus className="size-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">in de diepvries voor {label}</p>
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
