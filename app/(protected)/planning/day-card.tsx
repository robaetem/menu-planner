"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatDayLabel } from "@/lib/date";
import type { Diner, PlanMealWithRecipe, PlanningDay, Potje } from "@/lib/types";
import { ModePill } from "./mode-pill";
import { MealCard } from "./meal-card";
import { AddMealButton } from "./add-meal-buttons";
import { DayNote } from "./day-note";

type ModeOption = { value: string; label: string };

export function DayCard({
  planningDay,
  diners,
  potjes,
  amberModes,
  robinModes,
  selected,
  onToggleSelect,
  onViewMeal,
  onPickVleesje,
}: {
  planningDay: PlanningDay;
  diners: Diner[];
  potjes: Potje[];
  amberModes: ModeOption[];
  robinModes: ModeOption[];
  selected: boolean;
  onToggleSelect: () => void;
  onViewMeal: (meal: PlanMealWithRecipe) => void;
  onPickVleesje: (meal: PlanMealWithRecipe) => void;
}) {
  const { day_date, row } = planningDay;
  const meals = row?.meals ?? [];
  const both = meals.filter((m) => m.assignee === "both");
  const amber = meals.filter((m) => m.assignee === "amber");
  const robin = meals.filter((m) => m.assignee === "robin");
  const empty = meals.length === 0;

  const amberLabel = diners.find((d) => d.key === "amber")?.label ?? "Amber";
  const robinLabel = diners.find((d) => d.key === "robin")?.label ?? "Robin";

  return (
    <div className="rounded-xl border bg-card p-3 md:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h3 className="text-base font-semibold tracking-tight md:text-lg">{formatDayLabel(day_date)}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <ModePill dayDate={day_date} who="amber" label={amberLabel} value={row?.amber_mode ?? null} options={amberModes} />
            <ModePill dayDate={day_date} who="robin" label={robinLabel} value={row?.robin_mode ?? null} options={robinModes} />
          </div>
        </div>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Selecteer ${formatDayLabel(day_date)} voor boodschappen`}
          className="mt-1 size-5"
        />
      </div>

      <DayNote dayDate={day_date} note={row?.note ?? null} />

      <div className="mt-2 space-y-2">
        {both.map((m) => (
          <MealCard key={m.id} meal={m} full diners={diners} onView={() => onViewMeal(m)} onPickVleesje={() => onPickVleesje(m)} />
        ))}

        {both.length === 0 && (
          <div className="grid grid-cols-2 items-stretch gap-2">
            {amber.length ? (
              <div className="space-y-2">
                {amber.map((m) => (
                  <MealCard key={m.id} meal={m} full={false} diners={diners} onView={() => onViewMeal(m)} onPickVleesje={() => onPickVleesje(m)} />
                ))}
              </div>
            ) : (
              <AddMealButton dayDate={day_date} who="amber" potjes={potjes} />
            )}
            {robin.length ? (
              <div className="space-y-2">
                {robin.map((m) => (
                  <MealCard key={m.id} meal={m} full={false} diners={diners} onView={() => onViewMeal(m)} onPickVleesje={() => onPickVleesje(m)} />
                ))}
              </div>
            ) : (
              <AddMealButton dayDate={day_date} who="robin" potjes={potjes} />
            )}
          </div>
        )}

        {empty && <AddMealButton dayDate={day_date} who="both" full potjes={potjes} />}
      </div>
    </div>
  );
}
