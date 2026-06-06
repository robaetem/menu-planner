import { getHousehold, listPotjes } from "@/lib/data";
import { PotjesView } from "./potjes-view";

export const dynamic = "force-dynamic";

export default async function PotjesPage() {
  const [potjes, household] = await Promise.all([listPotjes(), getHousehold()]);
  return <PotjesView potjes={potjes} diners={household.diners} />;
}
