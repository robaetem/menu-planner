"use client";

import * as React from "react";
import { toast } from "sonner";
import { SlidersHorizontal, Check, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IngredientCategory, IngredientCategoryEntry } from "@/lib/types";
import { ShoppingEditor, type DocJSON } from "./editor";
import { CategoryManagerDialog } from "./category-manager-dialog";
import { saveShoppingDoc } from "./actions";

export function BoodschappenlijstjeView({
  content,
  categories,
  mapEntries,
}: {
  content: DocJSON | null;
  categories: IngredientCategory[];
  mapEntries: IngredientCategoryEntry[];
}) {
  const [managing, setManaging] = React.useState(false);
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved">("idle");
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = React.useCallback((doc: DocJSON) => {
    setSaved("saving");
    saveShoppingDoc(doc)
      .then(() => {
        setSaved("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved("idle"), 1500);
      })
      .catch((e) => {
        toast.error("Opslaan mislukt.");
        console.error(e);
        setSaved("idle");
      });
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Boodschappenlijstje</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            Je vrije, deelbare lijst
            {saved === "saving" && (
              <span className="inline-flex items-center gap-1 text-muted-foreground/80">
                · <Cloud className="size-3.5" /> opslaan…
              </span>
            )}
            {saved === "saved" && (
              <span className="inline-flex items-center gap-1 text-primary">
                · <Check className="size-3.5" /> bewaard
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => setManaging(true)} className="shrink-0">
          <SlidersHorizontal className="size-4" /> Categorieën
        </Button>
      </div>

      <div className="mt-6">
        <ShoppingEditor content={content} onChange={onChange} />
      </div>

      <CategoryManagerDialog
        open={managing}
        onOpenChange={setManaging}
        categories={categories}
        mapEntries={mapEntries}
      />
    </div>
  );
}
