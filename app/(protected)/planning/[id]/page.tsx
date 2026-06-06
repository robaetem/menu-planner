import { notFound } from "next/navigation";
import { getHousehold, getPeriodWithDays, listChecks, listExtras, listRecipes } from "@/lib/data";
import { PeriodDetail } from "./period-detail";

export const dynamic = "force-dynamic";

export default async function PeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [period, recipes, household, extras, checks] = await Promise.all([
    getPeriodWithDays(id),
    listRecipes(),
    getHousehold(),
    listExtras(id),
    listChecks(id),
  ]);
  if (!period) notFound();

  return (
    <PeriodDetail
      period={period}
      recipes={recipes}
      diners={household.diners}
      defaultPeople={household.default_people}
      extras={extras}
      checks={checks}
    />
  );
}
