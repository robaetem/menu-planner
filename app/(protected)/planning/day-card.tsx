"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatDayLabel } from "@/lib/date";
import type { Assignee, Diner, PlanMealWithRecipe, PlanningDay, Potje } from "@/lib/types";
import { ModePill } from "./mode-pill";
import { MealCard } from "./meal-card";
import { AddMealButton } from "./add-meal-buttons";
import { DayNote } from "./day-note";
import { DropZone, useMealDrag } from "./meal-drag";

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
  const { day_date, day_date: date, row } = planningDay;
  const meals = row?.meals ?? [];
  const both = meals.filter((m) => m.assignee === "both");
  const amber = meals.filter((m) => m.assignee === "amber");
  const robin = meals.filter((m) => m.assignee === "robin");
  const dragging = useMealDrag().drag !== null;

  // At rest the card looks exactly as it always has: a Samen meal takes the
  // full width and hides the split, a split day hides the Samen box. While a
  // meal is being dragged every box is revealed, so all three are droppable.
  const showSamen = both.length > 0 || (amber.length === 0 && robin.length === 0) || dragging;
  const showSplit = both.length === 0 || amber.length > 0 || robin.length > 0 || dragging;

  const amberLabel = diners.find((d) => d.key === "amber")?.label ?? "Amber";
  const robinLabel = diners.find((d) => d.key === "robin")?.label ?? "Robin";

  const slot = (who: Assignee, list: PlanMealWithRecipe[], full: boolean) => (
    <MealSlot
      date={date}
      who={who}
      meals={list}
      full={full}
      potjes={potjes}
      diners={diners}
      onViewMeal={onViewMeal}
      onPickVleesje={onPickVleesje}
    />
  );

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
        {showSamen && slot("both", both, true)}
        {showSplit && (
          <div className="grid grid-cols-2 items-stretch gap-2">
            {slot("amber", amber, false)}
            {slot("robin", robin, false)}
          </div>
        )}
      </div>
    </div>
  );
}

/** One droppable box: the meals planned for that person, plus a way to add
 *  another. A box holds any number of meals, which is what makes swapping two
 *  days possible — drop the first meal across, then drag the second one back. */
function MealSlot({
  date,
  who,
  meals,
  full,
  potjes,
  diners,
  onViewMeal,
  onPickVleesje,
}: {
  date: string;
  who: Assignee;
  meals: PlanMealWithRecipe[];
  full: boolean;
  potjes: Potje[];
  diners: Diner[];
  onViewMeal: (meal: PlanMealWithRecipe) => void;
  onPickVleesje: (meal: PlanMealWithRecipe) => void;
}) {
  return (
    <DropZone date={date} assignee={who} className={full ? "" : "h-full"}>
      {meals.length === 0 ? (
        <AddMealButton dayDate={date} who={who} full={full} potjes={potjes} />
      ) : (
        <div className="space-y-1.5">
          {meals.map((m) => (
            <MealCard
              key={m.id}
              meal={m}
              full={full}
              dayDate={date}
              diners={diners}
              onView={() => onViewMeal(m)}
              onPickVleesje={() => onPickVleesje(m)}
            />
          ))}
          <AddMealButton dayDate={date} who={who} slim potjes={potjes} />
        </div>
      )}
    </DropZone>
  );
}
