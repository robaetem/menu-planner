import { redirect } from "next/navigation";

export default async function VleesjesPage() {
  redirect("/diepvries?tab=vleesjes");
}
