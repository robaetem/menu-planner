"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Snowflake, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Diner, PlanMealWithRecipe } from "@/lib/types";
import { deleteMeal, setMealPotjes } from "./actions";

function dinerLabels(meal: PlanMealWithRecipe, diners: Diner[]): string[] {
  const keys = meal.assignee === "both" ? ["amber", "robin"] : [meal.assignee];
  return keys.map((k) => diners.find((d) => d.key === k)?.label ?? k);
}

export function MealCard({
  meal,
  full,
  diners,
}: {
  meal: PlanMealWithRecipe;
  full: boolean;
  diners: Diner[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const potje = meal.from_freezer;
  const title = meal.recipe?.title ?? meal.freeform_title ?? meal.raw_text ?? "Maaltijd";

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
      className={cn(
        "h-full rounded-lg border p-3 transition-colors",
        potje
          ? "border-sky-300 bg-sky-100/70 dark:border-sky-900 dark:bg-sky-950/30"
          : "border-amber-300 bg-amber-100/70 dark:border-amber-900/70 dark:bg-amber-950/30",
        pending && "opacity-60",
        full ? "" : "min-h-[4.25rem]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug text-foreground">{title}</p>
        <button
          onClick={() => run(() => deleteMeal(meal.id))}
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
          <PotjesControl value={meal.freezer_servings} onChange={(n) => run(() => setMealPotjes(meal.id, n))} />
        )}
      </div>
    </div>
  );
}

function PotjesControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const n = value || 0;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              n > 0
                ? "border-foreground/15 bg-background/60"
                : "border-dashed border-foreground/25 text-muted-foreground hover:text-foreground",
            )}
          />
        }
      >
        <Snowflake className="size-3" />
        {n > 0 ? `+${n} ${n === 1 ? "potje" : "potjes"}` : "potje"}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => onChange(Math.max(0, n - 1))} disabled={n <= 0} aria-label="Minder">
            <Minus className="size-3.5" />
          </Button>
          <span className="min-w-8 text-center text-sm font-medium tabular-nums">{n}</span>
          <Button variant="outline" size="icon-sm" onClick={() => onChange(n + 1)} aria-label="Meer">
            <Plus className="size-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">extra potjes invriezen</p>
      </PopoverContent>
    </Popover>
  );
}
