import { getHousehold, listPotjeNames, listPotjes } from "@/lib/data";
import { PotjesView } from "./potjes-view";

export const dynamic = "force-dynamic";

export default async function PotjesPage() {
  const [potjes, household, potjeNames] = await Promise.all([
    listPotjes(),
    getHousehold(),
    listPotjeNames(),
  ]);
  return <PotjesView potjes={potjes} diners={household.diners} potjeNames={potjeNames} />;
}
