import {
  getHousehold,
  listGroenteNames,
  listGroenten,
  listPotjeNames,
  listPotjes,
  listVleesjeNames,
  listVleesjes,
} from "@/lib/data";
import { normalizeFreezerTab } from "@/lib/freezer/inventory";
import { DiepvriesView } from "./diepvries-view";

export const dynamic = "force-dynamic";

export default async function DiepvriesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const [potjes, household, potjeNames, vleesjes, vleesjeNames, groenten, groenteNames] = await Promise.all([
    listPotjes(),
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
      potjes={potjes}
      diners={household.diners}
      potjeNames={potjeNames}
      vleesjes={vleesjes}
      vleesjeNames={vleesjeNames}
      groenten={groenten}
      groenteNames={groenteNames}
    />
  );
}
