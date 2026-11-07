import "./eval-env";
import { dataTools } from "@/lib/chat/data-tools";
import { getDb } from "@/lib/supabase/server";
(async () => {
  const r: any = await (dataTools.getFreezer as any).execute({ search: "hamrol" }, {});
  console.log(JSON.stringify(r.potjes ?? r, null, 1).slice(0, 1500));
  const h: any = await (dataTools.getFreezer as any).execute({ search: "hamburger" }, {});
  console.log(JSON.stringify(h.vleesjes, null, 1));
  const { data } = await getDb().from("freezer_portions").select("name, who, eaten_by_meal_id, source_meal_id, frozen_on").ilike("name", "%hamrol%");
  console.log(data);
  const { data: v } = await getDb().from("vleesjes").select("name, count, frozen_on").ilike("name", "%hamburger%");
  console.log(v);
  process.exit(0);
})();
