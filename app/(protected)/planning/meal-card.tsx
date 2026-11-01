"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Snowflake, Minus, Plus, Beef, Carrot, GripVertical, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Diner, PlanMealWithRecipe, TemplateGroente } from "@/lib/types";
import { mealStockStatus } from "@/lib/freezer/stock";
import { demandOf } from "./stock-picker";
import { formatDayShort } from "@/lib/date";
import type { Portion, Who } from "@/lib/freezer/potjes";
import { deleteMeal, setMealFreezer } from "./actions";
import { useFreezer } from "./freezer-context";
import { isVleesjeTemplate, vleesjeSummary } from "./config";
import { useMealDrag } from "./meal-drag";

function dinerLabels(meal: PlanMealWithRecipe, diners: Diner[]): string[] {
  const keys = meal.assignee === "both" ? ["amber", "robin"] : [meal.assignee];
  return keys.map((k) => diners.find((d) => d.key === k)?.label ?? k);
}

export function MealCard({
  meal,
  full,
  dayDate,
  diners,
  onView,
  onPickVleesje,
  onPickGroente,
}: {
  meal: PlanMealWithRecipe;
  full: boolean;
  /** The day this card is currently planned on — the drag's starting point. */
  dayDate: string;
  diners: Diner[];
  onView: () => void;
  onPickVleesje: () => void;
  onPickGroente: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { drag, begin } = useMealDrag();
  const potje = meal.from_freezer;
  const baseTitle = meal.recipe?.title ?? meal.freeform_title ?? meal.raw_text ?? "Maaltijd";
  const isTemplate = isVleesjeTemplate(meal.recipe);
  const vleesjeChosen = vleesjeSummary(meal.template_vleesjes);
  const beingDragged = drag?.meal.id === meal.id;
  const { portions, today, vleesjes, groenten } = useFreezer();
  const vleesjeShort = shortTotal(mealStockStatus(vleesjes.entries, vleesjes.reservations, meal.id, demandOf("vleesje", meal)));
  const groenteStatus = mealStockStatus(groenten.entries, groenten.reservations, meal.id, demandOf("groente", meal));
  const origin = potje ? freezerOrigin(portions.filter((p) => p.eatenByMealId === meal.id), today) : null;

  function run(fn: () => Promise<void>) {
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Mislukt.");
        console.error(e);
      }
    });
  }

  return (
    <div
      data-meal-card
      onClick={onView}
      className={cn(
        "h-full cursor-pointer rounded-lg border p-3 transition-colors",
        potje
          ? "border-sky-300 bg-sky-100/70 hover:border-sky-400 dark:border-sky-900 dark:bg-sky-950/30"
          : "border-amber-300 bg-amber-100/70 hover:border-amber-400 dark:border-amber-900/70 dark:bg-amber-950/30",
        pending && "opacity-60",
        beingDragged && "opacity-40",
        full ? "" : "min-h-[4.25rem]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onPointerDown={(e) =>
            begin(e, meal, { date: dayDate, assignee: meal.assignee }, baseTitle)
          }
          onClick={(e) => e.stopPropagation()}
          // touch-action:none stops the browser panning the page when the drag
          // starts from this handle.
          className="-ml-1 shrink-0 cursor-grab touch-none p-0.5 text-foreground/35 transition-colors hover:text-foreground/70 active:cursor-grabbing"
          aria-label={`Verplaats ${baseTitle} naar een andere dag`}
          title="Sleep naar een andere dag"
        >
          <GripVertical className="size-4" />
        </button>
        <p className="min-w-0 flex-1 font-medium leading-snug text-foreground">
          {isTemplate ? (
            <TemplateTitle
              title={baseTitle}
              chosen={vleesjeChosen}
              short={vleesjeShort}
              onPick={() => onPickVleesje()}
            />
          ) : (
            baseTitle
          )}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            run(() => deleteMeal(meal.id));
          }}
          className="shrink-0 text-foreground/40 transition-colors hover:text-destructive"
          aria-label="Maaltijd verwijderen"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {dinerLabels(meal, diners).map((l) => (
          <span
            key={l}
            className="rounded-full border border-foreground/15 bg-background/60 px-2 py-0.5 text-xs font-medium"
          >
            {l}
          </span>
        ))}
        {origin && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-300/70 bg-background/60 px-2 py-0.5 text-xs text-sky-800 dark:border-sky-900 dark:text-sky-300">
            <Snowflake className="size-3" />
            {origin}
          </span>
        )}
        {!potje && (
          <GroenteChip lines={meal.template_groenten ?? []} short={shortTotal(groenteStatus) > 0} onPick={onPickGroente} />
        )}
        {!potje && (
          <PotjesControl
            mealId={meal.id}
            robin={meal.freezer_robin}
            amber={meal.freezer_amber}
            robinLabel={diners.find((d) => d.key === "robin")?.label ?? "Robin"}
            amberLabel={diners.find((d) => d.key === "amber")?.label ?? "Amber"}
            pending={pending}
            onChange={(r, a) => run(() => setMealFreezer(meal.id, r, a))}
          />
        )}
      </div>
    </div>
  );
}

/** Where a planned "Potje diepvries" comes from: already frozen, or cooked
 *  earlier in the plan (then it says which day). */
function freezerOrigin(mine: Portion[], today: string): string | null {
  if (mine.length === 0) return "geen potje meer gekoppeld";
  const cooked = mine
    .filter((p) => p.sourceMealId && p.cookOn && p.cookOn >= today)
    .map((p) => p.cookOn!)
    .sort();
  return cooked.length ? `gemaakt ${formatDayShort(cooked[cooked.length - 1])}` : "uit de diepvries";
}

/** Render a recipe title, turning the "[vleesje]" token into a clickable chip
 *  (the chosen vleesjes, or "kies vleesje"). When the title has no token, the
 *  chip is appended so a template recipe always exposes the picker. */
function TemplateTitle({
  title,
  chosen,
  short,
  onPick,
}: {
  title: string;
  chosen: string;
  short: number;
  onPick: () => void;
}) {
  const parts = title.split(/\[vleesje\]/i);
  const chip = <VleesjeChip key="chip" chosen={chosen} short={short} onPick={onPick} />;
  if (parts.length === 1) {
    return (
      <>
        {title}{" "}
        {chip}
      </>
    );
  }
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 && chip}
        </React.Fragment>
      ))}
    </>
  );
}

function VleesjeChip({ chosen, short, onPick }: { chosen: string; short: number; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      className={cn(
        "mx-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 align-middle text-xs font-semibold transition-colors",
        chosen
          ? "border-rose-300 bg-rose-100 text-rose-700 hover:border-rose-400 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          : "border-dashed border-rose-400/60 text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30",
      )}
    >
      <Beef className="size-3" />
      {chosen || "kies vleesje"}
      {short > 0 && <ShortBadge>{short} tekort</ShortBadge>}
    </button>
  );
}

function ShortBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">
      <TriangleAlert className="size-2.5" />
      {children}
    </span>
  );
}

function shortTotal(status: { short: number }[]): number {
  return status.reduce((s, x) => s + x.short, 0);
}

/** Freezer vegetables this meal takes; dashed "groente" when none yet. */
function GroenteChip({
  lines,
  short,
  onPick,
}: {
  lines: TemplateGroente[];
  short: boolean;
  onPick: () => void;
}) {
  const label = lines.map((g) => g.name).join(" + ");
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
        lines.length
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-dashed border-foreground/25 text-muted-foreground hover:text-foreground",
      )}
      aria-label={lines.length ? `Groenten uit de diepvries: ${label}` : "Groente uit de diepvries kiezen"}
    >
      <Carrot className="size-3" />
      {lines.length ? label : "groente"}
      {short && <ShortBadge>tekort</ShortBadge>}
    </button>
  );
}

function PotjesControl({
  mealId,
  robin,
  amber,
  robinLabel,
  amberLabel,
  pending,
  onChange,
}: {
  mealId: string;
  robin: number;
  amber: number;
  robinLabel: string;
  amberLabel: string;
  pending: boolean;
  onChange: (robin: number, amber: number) => void;
}) {
  const { portions } = useFreezer();
  const r = robin || 0;
  const a = amber || 0;
  const total = r + a;
  const mine = portions.filter((p) => p.sourceMealId === mealId);
  const plannedFor = (who: Who) => mine.filter((p) => p.who === who && p.eatenByMealId);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              total > 0
                ? "border-foreground/15 bg-background/60"
                : "border-dashed border-foreground/25 text-muted-foreground hover:text-foreground",
            )}
          />
        }
      >
        <Snowflake className="size-3" />
        {total > 0 ? `+${total} ${total === 1 ? "potje" : "potjes"}` : "potje"}
        {mine.some((p) => p.eatenByMealId) && (
          <span className="text-muted-foreground">
            · {mine.filter((p) => p.eatenByMealId).length} ingepland
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-3" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2.5 text-sm font-medium">Extra porties invriezen</p>
        <div className="space-y-3">
          <PotjeRow
            label={robinLabel}
            value={r}
            planned={plannedFor("robin").map((p) => p.eatenOn ?? "")}
            pending={pending}
            onChange={(n) => onChange(n, a)}
          />
          <PotjeRow
            label={amberLabel}
            value={a}
            planned={plannedFor("amber").map((p) => p.eatenOn ?? "")}
            pending={pending}
            onChange={(n) => onChange(r, n)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One person's row inside the potjes popover: how many. */
function PotjeRow({
  label,
  value,
  planned,
  pending,
  onChange,
}: {
  label: string;
  value: number;
  /** Days that already plan to eat a portion of this — can't go below. */
  planned: string[];
  pending: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onChange(Math.max(0, value - 1))}
            disabled={value <= planned.length || pending}
            aria-label={`Minder potjes voor ${label}`}
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="min-w-6 text-center text-sm font-medium tabular-nums">{value}</span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onChange(value + 1)}
            disabled={pending}
            aria-label={`Meer potjes voor ${label}`}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>
      {planned.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {planned.length} ingepland: {planned.filter(Boolean).sort().map(formatDayShort).join(", ")}
        </p>
      )}
    </div>
  );
}
