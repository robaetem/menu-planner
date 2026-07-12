"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Snowflake, Minus, Plus, Beef } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Diner, PlanMealWithRecipe } from "@/lib/types";
import { deleteMeal, setMealFreezer } from "./actions";
import { isVleesjeTemplate, vleesjeSummary } from "./config";

function dinerLabels(meal: PlanMealWithRecipe, diners: Diner[]): string[] {
  const keys = meal.assignee === "both" ? ["amber", "robin"] : [meal.assignee];
  return keys.map((k) => diners.find((d) => d.key === k)?.label ?? k);
}

export function MealCard({
  meal,
  full,
  diners,
  onView,
  onPickVleesje,
}: {
  meal: PlanMealWithRecipe;
  full: boolean;
  diners: Diner[];
  onView: () => void;
  onPickVleesje: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const potje = meal.from_freezer;
  const baseTitle = meal.recipe?.title ?? meal.freeform_title ?? meal.raw_text ?? "Maaltijd";
  const isTemplate = isVleesjeTemplate(meal.recipe);
  const vleesjeChosen = vleesjeSummary(meal.template_vleesjes);

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
    <div
      onClick={onView}
      className={cn(
        "h-full cursor-pointer rounded-lg border p-3 transition-colors",
        potje
          ? "border-sky-300 bg-sky-100/70 hover:border-sky-400 dark:border-sky-900 dark:bg-sky-950/30"
          : "border-amber-300 bg-amber-100/70 hover:border-amber-400 dark:border-amber-900/70 dark:bg-amber-950/30",
        pending && "opacity-60",
        full ? "" : "min-h-[4.25rem]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug text-foreground">
          {isTemplate ? (
            <TemplateTitle
              title={baseTitle}
              chosen={vleesjeChosen}
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
        {!potje && (
          <PotjesControl
            robin={meal.freezer_robin}
            amber={meal.freezer_amber}
            robinLabel={diners.find((d) => d.key === "robin")?.label ?? "Robin"}
            amberLabel={diners.find((d) => d.key === "amber")?.label ?? "Amber"}
            onChange={(r, a) => run(() => setMealFreezer(meal.id, r, a))}
          />
        )}
      </div>
    </div>
  );
}

/** Render a recipe title, turning the "[vleesje]" token into a clickable chip
 *  (the chosen vleesjes, or "kies vleesje"). When the title has no token, the
 *  chip is appended so a template recipe always exposes the picker. */
function TemplateTitle({
  title,
  chosen,
  onPick,
}: {
  title: string;
  chosen: string;
  onPick: () => void;
}) {
  const parts = title.split(/\[vleesje\]/i);
  const chip = <VleesjeChip key="chip" chosen={chosen} onPick={onPick} />;
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

function VleesjeChip({ chosen, onPick }: { chosen: string; onPick: () => void }) {
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
    </button>
  );
}

function PotjesControl({
  robin,
  amber,
  robinLabel,
  amberLabel,
  onChange,
}: {
  robin: number;
  amber: number;
  robinLabel: string;
  amberLabel: string;
  onChange: (robin: number, amber: number) => void;
}) {
  const r = robin || 0;
  const a = amber || 0;
  const total = r + a;
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
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <PotjeRow label={robinLabel} value={r} onChange={(n) => onChange(n, a)} />
          <PotjeRow label={amberLabel} value={a} onChange={(n) => onChange(r, n)} />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">extra potjes invriezen</p>
      </PopoverContent>
    </Popover>
  );
}

/** One person's stepper row inside the potjes popover. */
function PotjeRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <>
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          aria-label={`Minder potjes voor ${label}`}
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="min-w-8 text-center text-sm font-medium tabular-nums">{value}</span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(value + 1)}
          aria-label={`Meer potjes voor ${label}`}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </>
  );
}
