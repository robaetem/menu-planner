import { getHousehold, getPlanningDays, listRecipes } from "@/lib/data";
import { PlanningView } from "./planning-view";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const [{ days }, recipes, household] = await Promise.all([
    getPlanningDays(),
    listRecipes(),
    getHousehold(),
  ]);
  return <PlanningView days={days} recipes={recipes} diners={household.diners} />;
}
