"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, MoreVertical, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDayLabel } from "@/lib/date";
import type { Diner, PlanDayWithMeals, RecipeWithIngredients } from "@/lib/types";
import { MealRow } from "./meal-row";
import { addMeal, removeDay, updateDay } from "../actions";

export function DayCard({
  periodId,
  day,
  recipes,
  diners,
}: {
  periodId: string;
  day: PlanDayWithMeals;
  recipes: RecipeWithIngredients[];
  diners: Diner[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [note, setNote] = React.useState(day.note ?? "");
  const [newMeal, setNewMeal] = React.useState("");

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error("Opslaan mislukt.");
        console.error(e);
      }
    });
  }

  function saveNote() {
    if ((note ?? "") === (day.note ?? "")) return;
    run(() => updateDay(periodId, day.id, { note }));
  }

  function addNewMeal() {
    const t = newMeal.trim();
    if (!t) return;
    setNewMeal("");
    run(() => addMeal(periodId, day.id, t));
  }

  return (
    <div className="rounded-xl border bg-card/60 p-3 md:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight md:text-lg">{formatDayLabel(day.day_date)}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Dag-acties" />
            }
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => run(() => removeDay(periodId, day.id))}>
              <Trash2 className="size-4" /> Dag verwijderen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        placeholder="Notitie — bv. Amber vrije middag, naar Cézar"
        className="mb-2.5 h-8 border-0 bg-transparent px-1.5 text-sm text-muted-foreground italic shadow-none placeholder:not-italic focus-visible:ring-0 dark:bg-transparent"
      />

      <div className="space-y-2">
        {day.meals.map((meal) => (
          <MealRow key={meal.id} periodId={periodId} meal={meal} recipes={recipes} diners={diners} />
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <Input
          value={newMeal}
          onChange={(e) => setNewMeal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addNewMeal();
            }
          }}
          placeholder="+ Maaltijd toevoegen…"
          className="h-9 border-dashed bg-transparent text-sm"
        />
        <Button variant="ghost" size="icon" onClick={addNewMeal} disabled={!newMeal.trim()} aria-label="Maaltijd toevoegen">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
