import { listVleesjeNames, listVleesjes } from "@/lib/data";
import { VleesjesView } from "./vleesjes-view";

export const dynamic = "force-dynamic";

export default async function VleesjesPage() {
  const [vleesjes, vleesjeNames] = await Promise.all([listVleesjes(), listVleesjeNames()]);
  return <VleesjesView vleesjes={vleesjes} vleesjeNames={vleesjeNames} />;
}
