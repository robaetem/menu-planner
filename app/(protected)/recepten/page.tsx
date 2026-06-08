import { listRecipes, listTags } from "@/lib/data";
import type { Assignee } from "@/lib/types";
import { RecipesView, type AssignTarget } from "./recipes-view";

export const dynamic = "force-dynamic";

const ASSIGNEES = ["both", "amber", "robin"];

export default async function ReceptenPage({
  searchParams,
}: {
  searchParams: Promise<{ assignDate?: string; who?: string }>;
}) {
  const sp = await searchParams;
  const [recipes, tags] = await Promise.all([listRecipes(), listTags()]);

  const assign: AssignTarget | null =
    sp.assignDate && sp.who && ASSIGNEES.includes(sp.who)
      ? { date: sp.assignDate, who: sp.who as Assignee }
      : null;

  return <RecipesView recipes={recipes} tags={tags} assign={assign} />;
}
