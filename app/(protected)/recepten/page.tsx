import { listRecipes } from "@/lib/data";
import { RecipesView } from "./recipes-view";

export const dynamic = "force-dynamic";

export default async function ReceptenPage() {
  const recipes = await listRecipes();
  return <RecipesView recipes={recipes} />;
}
