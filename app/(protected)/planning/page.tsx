import {
  getHousehold,
  getPlanningDays,
  listModes,
  listPortions,
  listRecipes,
  listVleesjes,
} from "@/lib/data";
import { todayIso } from "@/lib/date";
import { PlanningView } from "./planning-view";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const [{ days }, recipes, household, portions, modes, vleesjes] = await Promise.all([
    getPlanningDays(),
    listRecipes(),
    getHousehold(),
    listPortions(),
    listModes(),
    listVleesjes(),
  ]);
  return (
    <PlanningView
      days={days}
      recipes={recipes}
      diners={household.diners}
      freezer={{ portions, today: todayIso() }}
      modes={modes}
      vleesjes={vleesjes}
    />
  );
}
