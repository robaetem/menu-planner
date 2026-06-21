import { getShoppingDoc, listCategories, listCategoryMap } from "@/lib/data";
import type { DocJSON } from "./editor";
import { BoodschappenlijstjeView } from "./boodschappenlijstje-view";

export const dynamic = "force-dynamic";

export default async function BoodschappenlijstjePage() {
  const [content, categories, mapEntries] = await Promise.all([
    getShoppingDoc(),
    listCategories(),
    listCategoryMap(),
  ]);
  return (
    <BoodschappenlijstjeView
      content={(content as DocJSON | null) ?? null}
      categories={categories}
      mapEntries={mapEntries}
    />
  );
}
