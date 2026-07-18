import { getShoppingDocs, listCategories, listCategoryMap } from "@/lib/data";
import type { DocJSON } from "./editor";
import { BoodschappenlijstjeView } from "./boodschappenlijstje-view";

export const dynamic = "force-dynamic";

export default async function BoodschappenlijstjePage() {
  const [documents, categories, mapEntries] = await Promise.all([
    getShoppingDocs(),
    listCategories(),
    listCategoryMap(),
  ]);
  return (
    <BoodschappenlijstjeView
      manualContent={(documents.manual as DocJSON | null) ?? null}
      generatedContent={(documents.generated as DocJSON | null) ?? null}
      categories={categories}
      mapEntries={mapEntries}
    />
  );
}
