import { listPeriodsWithCounts } from "@/lib/data";
import { PeriodsView } from "./periods-view";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const periods = await listPeriodsWithCounts();
  return <PeriodsView periods={periods} />;
}
