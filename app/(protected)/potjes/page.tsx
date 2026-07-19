import { redirect } from "next/navigation";

export default async function PotjesPage() {
  redirect("/diepvries?tab=potjes");
}
