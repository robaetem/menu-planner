"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, ChartLine, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import type { Diner, PlanMealWithRecipe, PlanMode, PlanningDay, RecipeWithIngredients, Vleesje } from "@/lib/types";
import type { Portion } from "@/lib/freezer/potjes";
import { FreezerProvider } from "./freezer-context";
import { DayCard } from "./day-card";
import { MealDetailDialog } from "./meal-detail-dialog";
import { FreezerChart } from "./freezer-chart";
import { VleesjePickerDialog } from "./vleesje-picker-dialog";
import { MealDragProvider, type DropTarget } from "./meal-drag";
import { extendDays, moveMeal } from "./actions";
import { assigneeLabel } from "./config";
import { formatDayLabel } from "@/lib/date";
import { generateShoppingList } from "../boodschappenlijstje/actions";

export function PlanningView({
  days,
  recipes,
  diners,
  freezer,
  modes,
  vleesjes,
}: {
  days: PlanningDay[];
  recipes: RecipeWithIngredients[];
  diners: Diner[];
  freezer: { portions: Portion[]; today: string };
  modes: PlanMode[];
  vleesjes: Vleesje[];
}) {
  const router = useRouter();
  const [extending, startExtend] = useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmShop, setConfirmShop] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [showChart, setShowChart] = useStoredFlag("planning.freezerChart");
  const [viewing, setViewing] = React.useState<PlanMealWithRecipe | null>(null);
  const [picking, setPicking] = React.useState<PlanMealWithRecipe | null>(null);

  const amberLabel = diners.find((d) => d.key === "amber")?.label ?? "Amber";
  const robinLabel = diners.find((d) => d.key === "robin")?.label ?? "Robin";
  const amberModes = modes.filter((m) => m.who === "amber");
  const robinModes = modes.filter((m) => m.who === "robin");
  const dayDates = React.useMemo(() => days.map((d) => d.day_date), [days]);

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

  /** A meal was dropped on another day / another person. The server refuses the
   *  move when a potje switch cannot be covered by the freezer, so surface that
   *  reason rather than a generic failure. */
  const onDropMeal = React.useCallback(
    (meal: PlanMealWithRecipe, _from: DropTarget, to: DropTarget) => {
      const title = meal.recipe?.title ?? meal.freeform_title ?? "Maaltijd";
      moveMeal(meal.id, to.date, to.assignee)
        .then(() => {
          toast.success(`${title} → ${formatDayLabel(to.date)} (${assigneeLabel(to.assignee)})`);
          router.refresh();
        })
        .catch((e: unknown) => {
          toast.error(e instanceof Error ? e.message : "Verplaatsen mislukt.");
          console.error(e);
        });
    },
    [router],
  );

  return (
    <FreezerProvider value={freezer}>
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Planning</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowChart(!showChart)}
            aria-pressed={showChart}
            className={cn("shrink-0", showChart && "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15")}
          >
            <ChartLine className="size-4" /> Potjesverloop
          </Button>
          <ShopButton count={count} onClick={() => setConfirmShop(true)} />
        </div>
      </div>

      {showChart && (
        <div className="mt-5">
          <FreezerChart
            days={dayDates}
            robinLabel={robinLabel}
            amberLabel={amberLabel}
            onClose={() => setShowChart(false)}
          />
        </div>
      )}

      <MealDragProvider onDrop={onDropMeal}>
        <div className="mt-6 space-y-3">
          {days.map((d) => (
            <DayCard
              key={d.day_date}
              planningDay={d}
              diners={diners}
              amberModes={amberModes}
              robinModes={robinModes}
              selected={selected.has(d.day_date)}
              onToggleSelect={() => toggle(d.day_date)}
              onViewMeal={(m) => setViewing(m)}
              onPickVleesje={(m) => setPicking(m)}
            />
          ))}
        </div>
      </MealDragProvider>

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
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
      />
    </div>
    </FreezerProvider>
  );
}

/** A boolean remembered in this browser (best effort: storage may be blocked). */
function useStoredFlag(key: string): [boolean, (v: boolean) => void] {
  const [value, setValue] = React.useState(false);
  React.useEffect(() => {
    try {
      setValue(localStorage.getItem(key) === "1");
    } catch {}
  }, [key]);
  const set = React.useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {}
    },
    [key],
  );
  return [value, set];
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
