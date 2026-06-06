"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatDayLabel } from "@/lib/date";
import type { Diner, PlanningDay } from "@/lib/types";
import { ModePill } from "./mode-pill";
import { MealCard } from "./meal-card";
import { AddMealButton } from "./add-meal-buttons";
import { AMBER_MODES, ROBIN_MODES } from "./config";

export function DayCard({
  planningDay,
  diners,
  selected,
  onToggleSelect,
}: {
  planningDay: PlanningDay;
  diners: Diner[];
  selected: boolean;
  onToggleSelect: () => void;
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
            <ModePill dayDate={day_date} who="amber" label={amberLabel} value={row?.amber_mode ?? null} options={AMBER_MODES} />
            <ModePill dayDate={day_date} who="robin" label={robinLabel} value={row?.robin_mode ?? null} options={ROBIN_MODES} />
          </div>
        </div>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Selecteer ${formatDayLabel(day_date)} voor boodschappen`}
          className="mt-1 size-5"
        />
      </div>

      <div className="space-y-2">
        {both.map((m) => (
          <MealCard key={m.id} meal={m} full diners={diners} />
        ))}

        {both.length === 0 && (
          <div className="grid grid-cols-2 items-stretch gap-2">
            {amber.length ? (
              <div className="space-y-2">
                {amber.map((m) => (
                  <MealCard key={m.id} meal={m} full={false} diners={diners} />
                ))}
              </div>
            ) : (
              <AddMealButton dayDate={day_date} who="amber" />
            )}
            {robin.length ? (
              <div className="space-y-2">
                {robin.map((m) => (
                  <MealCard key={m.id} meal={m} full={false} diners={diners} />
                ))}
              </div>
            ) : (
              <AddMealButton dayDate={day_date} who="robin" />
            )}
          </div>
        )}

        {empty && <AddMealButton dayDate={day_date} who="both" full />}
      </div>
    </div>
  );
}
