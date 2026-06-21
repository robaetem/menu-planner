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
import { Switch } from "@/components/ui/switch";
import { Plus, Check, Beef } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecipeTag, RecipeWithIngredients } from "@/lib/types";
import {
  IngredientListEditor,
  emptyRow,
  ingredientRowsFromEditor,
  rowsFromIngredients,
  type IngRow,
} from "./ingredient-list-editor";
import { createRecipe, updateRecipe, type RecipeInput } from "./actions";
import { createTag } from "./tag-actions";

export function RecipeEditorDialog({
  open,
  onOpenChange,
  recipe,
  allTags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: RecipeWithIngredients | null;
  allTags: RecipeTag[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [newTag, setNewTag] = React.useState("");
  const [addingTag, setAddingTag] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [ingRows, setIngRows] = React.useState<IngRow[]>([]);
  const [method, setMethod] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [hasVleesje, setHasVleesje] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(recipe?.title ?? "");
    setTags(recipe?.tags ?? []);
    setIngRows(recipe ? rowsFromIngredients(recipe.ingredients) : [emptyRow()]);
    setMethod(recipe?.method ?? "");
    setNotes(recipe?.notes ?? "");
    setHasVleesje(recipe?.has_vleesje ?? false);
    setNewTag("");
  }, [open, recipe]);

  // Typing "[vleesje]" in the name is itself a template declaration.
  const titleHasToken = /\[vleesje\]/i.test(title);
  React.useEffect(() => {
    if (titleHasToken) setHasVleesje(true);
  }, [titleHasToken]);

  function toggleTag(value: string) {
    setTags((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]));
  }

  async function addInlineTag() {
    const label = newTag.trim();
    if (!label || addingTag) return;
    const value = label.toLowerCase();
    setNewTag("");
    // Toggle it on immediately; create it server-side if it's new.
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
    if (!allTags.some((t) => t.value === value)) {
      setAddingTag(true);
      try {
        await createTag(label);
        router.refresh();
      } catch (e) {
        toast.error("Tag toevoegen mislukt.");
        console.error(e);
      } finally {
        setAddingTag(false);
      }
    }
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
      has_vleesje: hasVleesje,
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
              {allTags.map((t) => {
                const active = tags.includes(t.value);
                return (
                  <button
                    key={t.id}
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
            <div className="flex items-center gap-2 pt-1">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addInlineTag();
                  }
                }}
                placeholder="Nieuwe tag…"
                className="h-9 max-w-48"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addInlineTag}
                disabled={!newTag.trim() || addingTag}
              >
                {addingTag ? <Check className="size-4" /> : <Plus className="size-4" />} Tag
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Beef className="size-4 text-rose-500" />
                  <div>
                    <Label className="cursor-default">Vleesje-template</Label>
                    <p className="text-xs text-muted-foreground">
                      Het vlees wordt bij het plannen gekozen (uit de diepvries of te kopen).
                    </p>
                  </div>
                </div>
                <Switch checked={hasVleesje} onCheckedChange={(v) => setHasVleesje(!!v)} aria-label="Vleesje-template" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ingrediënten</Label>
            <p className="-mt-1 text-xs text-muted-foreground">
              {hasVleesje ? "Voeg hier alles behalve het vlees toe — dat kies je bij het plannen." : " "}
            </p>
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
