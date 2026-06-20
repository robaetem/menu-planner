"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Diner, PlanMealWithRecipe, PlanMode, PlanningDay, Potje, RecipeWithIngredients } from "@/lib/types";
import { DayCard } from "./day-card";
import { ShoppingSheet } from "./shopping-sheet";
import { MealDetailDialog } from "./meal-detail-dialog";
import { ModeManagerDialog } from "./mode-manager-dialog";
import { extendDays } from "./actions";

export function PlanningView({
  days,
  recipes,
  diners,
  potjes,
  modes,
}: {
  days: PlanningDay[];
  recipes: RecipeWithIngredients[];
  diners: Diner[];
  potjes: Potje[];
  modes: PlanMode[];
}) {
  const router = useRouter();
  const [extending, startExtend] = useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [shopOpen, setShopOpen] = React.useState(false);
  const [managingModes, setManagingModes] = React.useState(false);
  const [viewing, setViewing] = React.useState<PlanMealWithRecipe | null>(null);

  const amberLabel = diners.find((d) => d.key === "amber")?.label ?? "Amber";
  const robinLabel = diners.find((d) => d.key === "robin")?.label ?? "Robin";
  const amberModes = modes.filter((m) => m.who === "amber").map((m) => ({ value: m.value, label: m.label }));
  const robinModes = modes.filter((m) => m.who === "robin").map((m) => ({ value: m.value, label: m.label }));

  const viewingRecipe = viewing?.recipe_id
    ? recipes.find((r) => r.id === viewing.recipe_id) ?? null
    : null;

  function toggle(date: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const selectedDays = days.filter((d) => selected.has(d.day_date) && d.row).map((d) => d.row!);
  const count = selected.size;

  function onExtend() {
    startExtend(async () => {
      try {
        await extendDays(7);
        router.refresh();
      } catch (e) {
        toast.error("Toevoegen mislukt.");
        console.error(e);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Planning</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jullie weekmenu vanaf vandaag
            {count > 0 && ` · ${count} ${count === 1 ? "dag" : "dagen"} geselecteerd`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setManagingModes(true)} className="shrink-0">
            <SlidersHorizontal className="size-4" /> Situaties
          </Button>
          <ShopButton count={count} onClick={() => setShopOpen(true)} />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {days.map((d) => (
          <DayCard
            key={d.day_date}
            planningDay={d}
            diners={diners}
            potjes={potjes}
            amberModes={amberModes}
            robinModes={robinModes}
            selected={selected.has(d.day_date)}
            onToggleSelect={() => toggle(d.day_date)}
            onViewMeal={(m) => setViewing(m)}
          />
        ))}
      </div>

      <Button variant="outline" className="mt-3 w-full border-dashed" onClick={onExtend} disabled={extending}>
        <CalendarPlus className="size-4" /> {extending ? "Toevoegen…" : "Voeg dagen toe"}
      </Button>

      <ShoppingSheet open={shopOpen} onOpenChange={setShopOpen} days={selectedDays} recipes={recipes} />

      <ModeManagerDialog
        open={managingModes}
        onOpenChange={setManagingModes}
        modes={modes}
        amberLabel={amberLabel}
        robinLabel={robinLabel}
      />

      <MealDetailDialog
        meal={viewing}
        recipe={viewingRecipe}
        diners={diners}
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
      />
    </div>
  );
}

function ShopButton({ count, onClick }: { count: number; onClick: () => void }) {
  if (count > 0) {
    return (
      <Button onClick={onClick} className="shrink-0">
        <ShoppingCart className="size-4" /> Maak boodschappenlijstje ({count})
      </Button>
    );
  }
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-block shrink-0" />}>
          <Button disabled className="pointer-events-none shrink-0">
            <ShoppingCart className="size-4" /> Maak boodschappenlijstje
          </Button>
        </TooltipTrigger>
        <TooltipContent>Selecteer minstens 1 dag</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
