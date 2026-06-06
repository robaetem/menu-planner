"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RECIPE_TAGS } from "@/lib/recipes/tags";
import type { RecipeWithIngredients } from "@/lib/types";
import {
  IngredientListEditor,
  emptyRow,
  ingredientRowsFromEditor,
  rowsFromIngredients,
  type IngRow,
} from "./ingredient-list-editor";
import { createRecipe, updateRecipe, type RecipeInput } from "./actions";

export function RecipeEditorDialog({
  open,
  onOpenChange,
  recipe,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: RecipeWithIngredients | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [ingRows, setIngRows] = React.useState<IngRow[]>([]);
  const [method, setMethod] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setTitle(recipe?.title ?? "");
    setTags(recipe?.tags ?? []);
    setIngRows(recipe ? rowsFromIngredients(recipe.ingredients) : [emptyRow()]);
    setMethod(recipe?.method ?? "");
    setNotes(recipe?.notes ?? "");
  }, [open, recipe]);

  function toggleTag(value: string) {
    setTags((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]));
  }

  async function onSave() {
    if (!title.trim()) {
      toast.error("Geef het recept een naam.");
      return;
    }
    const input: RecipeInput = {
      title: title.trim(),
      tags,
      method: method.trim() || null,
      notes: notes.trim() || null,
      ingredients: ingredientRowsFromEditor(ingRows),
    };
    setPending(true);
    try {
      if (recipe) {
        await updateRecipe(recipe.id, input);
        toast.success("Recept bijgewerkt");
      } else {
        await createRecipe(input);
        toast.success("Recept toegevoegd");
      }
      router.refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error("Opslaan mislukt. Probeer opnieuw.");
      console.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle>{recipe ? "Recept bewerken" : "Nieuw recept"}</DialogTitle>
          <DialogDescription>
            Bewaar wat jullie graag eten, zodat de boodschappenlijst zichzelf kan samenstellen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="r-title">Naam</Label>
            <Input
              id="r-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="bv. Wraps met ratatouille en ei"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2">
              {RECIPE_TAGS.map((t) => {
                const active = tags.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleTag(t.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ingrediënten</Label>
            <IngredientListEditor rows={ingRows} onChange={setIngRows} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-method">Recept</Label>
            <Textarea
              id="r-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Korte beschrijving of stappen…"
              className="min-h-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-notes">Notities (optioneel)</Label>
            <Textarea
              id="r-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="bv. lekker met een frisse salade"
              className="min-h-20"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 pt-4 pb-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button onClick={onSave} disabled={pending}>
            {pending ? "Opslaan…" : recipe ? "Pas recept aan" : "Maken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
