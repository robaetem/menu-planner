"use client";

import * as React from "react";
import { toast } from "sonner";
import { SlidersHorizontal, Check, Cloud, ListPlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IngredientCategory, IngredientCategoryEntry } from "@/lib/types";
import type { ShoppingSection as ShoppingSectionKey } from "@/lib/shopping/document-sections";
import { ShoppingEditor, type DocJSON } from "./editor";
import { CategoryManagerDialog } from "./category-manager-dialog";
import { saveShoppingDoc } from "./actions";

export function BoodschappenlijstjeView({
  manualContent,
  generatedContent,
  categories,
  mapEntries,
}: {
  manualContent: DocJSON | null;
  generatedContent: DocJSON | null;
  categories: IngredientCategory[];
  mapEntries: IngredientCategoryEntry[];
}) {
  const [managing, setManaging] = React.useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Boodschappenlijstje</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            Je vaste en geplande boodschappen op één plek
          </p>
        </div>
        <Button variant="outline" onClick={() => setManaging(true)} className="shrink-0">
          <SlidersHorizontal className="size-4" /> Categorieën
        </Button>
      </div>

      <div className="mt-6 space-y-8">
        <ShoppingSection
          section="manual"
          title="Zelf toegevoegd"
          description="Blijft altijd staan, ook wanneer je boodschappen uit je planning bijwerkt."
          icon={<ListPlus className="size-4 text-primary" />}
          content={manualContent}
        />
        <ShoppingSection
          section="generated"
          title="Uit je planning"
          description="Wordt vervangen bij ‘Boodschappen bijwerken’. Kopieer blijvende aanpassingen naar ‘Zelf toegevoegd’."
          icon={<RefreshCw className="size-4 text-amber-600" />}
          content={generatedContent}
        />
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

function ShoppingSection({
  section,
  title,
  description,
  icon,
  content,
}: {
  section: ShoppingSectionKey;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: DocJSON | null;
}) {
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved">("idle");
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const onChange = React.useCallback((doc: DocJSON) => {
    setSaved("saving");
    saveShoppingDoc(section, doc)
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
  }, [section]);

  return (
    <section aria-labelledby={`shopping-${section}-title`}>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 id={`shopping-${section}-title`} className="flex items-center gap-2 text-base font-semibold">
            {icon} {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {saved === "saving" && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Cloud className="size-3.5" /> opslaan…
          </span>
        )}
        {saved === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <Check className="size-3.5" /> bewaard
          </span>
        )}
      </div>
      <ShoppingEditor content={content} onChange={onChange} minHeightClassName="min-h-[30vh]" />
    </section>
  );
}
