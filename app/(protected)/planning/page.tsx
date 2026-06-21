import {
  getHousehold,
  getPlanningDays,
  listModes,
  listPotjes,
  listRecipes,
  listVleesjeNames,
  listVleesjes,
} from "@/lib/data";
import { PlanningView } from "./planning-view";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const [{ days }, recipes, household, potjes, modes, vleesjes, vleesjeNames] = await Promise.all([
    getPlanningDays(),
    listRecipes(),
    getHousehold(),
    listPotjes(),
    listModes(),
    listVleesjes(),
    listVleesjeNames(),
  ]);
  return (
    <PlanningView
      days={days}
      recipes={recipes}
      diners={household.diners}
      potjes={potjes}
      modes={modes}
      vleesjes={vleesjes}
      vleesjeNames={vleesjeNames}
    />
  );
}
