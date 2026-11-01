import {
  getHousehold,
  getPlanningDays,
  listModes,
  listPortions,
  listRecipes,
  listFreezerStock,
} from "@/lib/data";
import { todayIso } from "@/lib/date";
import { PlanningView } from "./planning-view";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const [{ days }, recipes, household, portions, modes, stock] = await Promise.all([
    getPlanningDays(),
    listRecipes(),
    getHousehold(),
    listPortions(),
    listModes(),
    listFreezerStock(),
  ]);
  return (
    <PlanningView
      days={days}
      recipes={recipes}
      diners={household.diners}
      freezer={{ portions, today: todayIso(), vleesjes: stock.vleesjes, groenten: stock.groenten }}
      modes={modes}
    />
  );
}
