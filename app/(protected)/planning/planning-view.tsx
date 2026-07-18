"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import type { Diner, PlanMealWithRecipe, PlanMode, PlanningDay, Potje, RecipeWithIngredients, Vleesje } from "@/lib/types";
import { DayCard } from "./day-card";
import { MealDetailDialog } from "./meal-detail-dialog";
import { ModeManagerDialog } from "./mode-manager-dialog";
import { VleesjePickerDialog } from "./vleesje-picker-dialog";
import { extendDays } from "./actions";
import { generateShoppingList } from "../boodschappenlijstje/actions";

export function PlanningView({
  days,
  recipes,
  diners,
  potjes,
  modes,
  vleesjes,
  vleesjeNames,
}: {
  days: PlanningDay[];
  recipes: RecipeWithIngredients[];
  diners: Diner[];
  potjes: Potje[];
  modes: PlanMode[];
  vleesjes: Vleesje[];
  vleesjeNames: string[];
}) {
  const router = useRouter();
  const [extending, startExtend] = useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmShop, setConfirmShop] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [managingModes, setManagingModes] = React.useState(false);
  const [viewing, setViewing] = React.useState<PlanMealWithRecipe | null>(null);
  const [picking, setPicking] = React.useState<PlanMealWithRecipe | null>(null);

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

  const selectedDates = [...selected].sort();
  const count = selected.size;

  function onGenerate() {
    setGenerating(true);
    generateShoppingList(selectedDates)
      .then(() => {
        setConfirmShop(false);
        router.push("/boodschappenlijstje");
      })
      .catch((e) => {
        toast.error("Boodschappenlijstje maken mislukt.");
        console.error(e);
      })
      .finally(() => setGenerating(false));
  }

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
          <ShopButton count={count} onClick={() => setConfirmShop(true)} />
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
            onPickVleesje={(m) => setPicking(m)}
          />
        ))}
      </div>

      <Button variant="outline" className="mt-3 w-full border-dashed" onClick={onExtend} disabled={extending}>
        <CalendarPlus className="size-4" /> {extending ? "Toevoegen…" : "Voeg dagen toe"}
      </Button>

      <AlertDialog open={confirmShop} onOpenChange={(o) => !generating && setConfirmShop(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Boodschappen bijwerken?</AlertDialogTitle>
            <AlertDialogDescription>
              De ingrediënten van {count} {count === 1 ? "geselecteerde dag" : "geselecteerde dagen"} worden per
              categorie ingedeeld. Alleen <strong>‘Uit je planning’ wordt vervangen.</strong> Alles onder
              <strong> ‘Zelf toegevoegd’ blijft staan.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onGenerate();
              }}
              disabled={generating}
            >
              {generating ? "Bijwerken…" : "Bijwerken"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        onPickVleesje={() => {
          const m = viewing;
          setViewing(null);
          if (m) setPicking(m);
        }}
      />

      <VleesjePickerDialog
        meal={picking}
        recipeTitle={picking?.recipe?.title ?? picking?.freeform_title ?? "Gerecht"}
        vleesjes={vleesjes}
        vleesjeNames={vleesjeNames}
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
      />
    </div>
  );
}

function ShopButton({ count, onClick }: { count: number; onClick: () => void }) {
  if (count > 0) {
    return (
      <Button onClick={onClick} className="shrink-0">
        <ShoppingCart className="size-4" /> Boodschappen bijwerken ({count})
      </Button>
    );
  }
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-block shrink-0" />}>
          <Button disabled className="pointer-events-none shrink-0">
            <ShoppingCart className="size-4" /> Boodschappen bijwerken
          </Button>
        </TooltipTrigger>
        <TooltipContent>Selecteer minstens 1 dag</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
