import {
  getHousehold,
  listGroenteNames,
  listGroenten,
  listPortions,
  listPotjeNames,
  listVleesjeNames,
  listVleesjes,
} from "@/lib/data";
import { normalizeFreezerTab } from "@/lib/freezer/inventory";
import { todayIso } from "@/lib/date";
import { DiepvriesView } from "./diepvries-view";

export const dynamic = "force-dynamic";

export default async function DiepvriesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const [portions, household, potjeNames, vleesjes, vleesjeNames, groenten, groenteNames] = await Promise.all([
    listPortions(),
    getHousehold(),
    listPotjeNames(),
    listVleesjes(),
    listVleesjeNames(),
    listGroenten(),
    listGroenteNames(),
  ]);

  return (
    <DiepvriesView
      initialTab={normalizeFreezerTab(params.tab)}
      portions={portions}
      today={todayIso()}
      diners={household.diners}
      potjeNames={potjeNames}
      vleesjes={vleesjes}
      vleesjeNames={vleesjeNames}
      groenten={groenten}
      groenteNames={groenteNames}
    />
  );
}
