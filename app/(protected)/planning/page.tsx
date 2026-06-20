import { getHousehold, getPlanningDays, listModes, listPotjes, listRecipes } from "@/lib/data";
import { PlanningView } from "./planning-view";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const [{ days }, recipes, household, potjes, modes] = await Promise.all([
    getPlanningDays(),
    listRecipes(),
    getHousehold(),
    listPotjes(),
    listModes(),
  ]);
  return (
    <PlanningView days={days} recipes={recipes} diners={household.diners} potjes={potjes} modes={modes} />
  );
}
