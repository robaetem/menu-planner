"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Leaf, Snowflake, Sparkles, Info } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { TagsInput } from "@/components/tags-input";
import { parseIngredientsText, ingredientsToText, type ParsedIngredient } from "@/lib/recipes/ingredient-parser";
import { createRecipe, updateRecipe, type RecipeInput } from "./actions";
import type { RecipeWithIngredients } from "@/lib/types";

const TAG_SUGGESTIONS = ["snel", "vegetarisch", "oven", "pasta", "comfort", "zomer", "klassieker", "vis", "kip"];

function modeLabel(p: ParsedIngredient): { label: string; tone: string } {
  if (p.scaling === "per_person") return { label: "per persoon", tone: "text-violet-600 dark:text-violet-400" };
  if (p.scaling === "fixed") return { label: "vast", tone: "text-amber-600 dark:text-amber-400" };
  return { label: "per portie", tone: "text-muted-foreground" };
}

function qtyLabel(p: ParsedIngredient): string {
  if (p.scaling === "per_person") {
    const parts = Object.entries(p.amounts_per_person).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v}`);
    return [parts.join(" / "), p.unit].filter(Boolean).join(" ");
  }
  if (p.amount == null) return "—";
  const a = p.amount_max != null ? `${p.amount}–${p.amount_max}` : `${p.amount}`;
  return [a, p.unit].filter(Boolean).join(" ");
}

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
  const [prep, setPrep] = React.useState<string>("");
  const [baseServings, setBaseServings] = React.useState<string>("2");
  const [usesFresh, setUsesFresh] = React.useState(false);
  const [freezer, setFreezer] = React.useState(false);
  const [ingredientsText, setIngredientsText] = React.useState("");
  const [method, setMethod] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // (Re)initialize when opening
  React.useEffect(() => {
    if (!open) return;
    setTitle(recipe?.title ?? "");
    setTags(recipe?.tags ?? []);
    setPrep(recipe?.prep_minutes != null ? String(recipe.prep_minutes) : "");
    setBaseServings(String(recipe?.base_servings ?? 2));
    setUsesFresh(recipe?.uses_fresh_veg ?? false);
    setFreezer(recipe?.freezer_friendly ?? false);
    setIngredientsText(recipe ? ingredientsToText(recipe.ingredients, recipe.base_servings) : "");
    setMethod(recipe?.method ?? "");
    setNotes(recipe?.notes ?? "");
  }, [open, recipe]);

  const parsed = React.useMemo(() => parseIngredientsText(ingredientsText), [ingredientsText]);
  const baseNum = Math.max(1, parseInt(baseServings || "2", 10) || 2);

  async function onSave() {
    if (!title.trim()) {
      toast.error("Geef het recept een naam.");
      return;
    }
    const input: RecipeInput = {
      title: title.trim(),
      tags,
      prep_minutes: prep.trim() ? parseInt(prep, 10) : null,
      uses_fresh_veg: usesFresh,
      freezer_friendly: freezer,
      base_servings: baseNum,
      method: method.trim() || null,
      notes: notes.trim() || null,
      ingredientsText,
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r-prep">Bereidingstijd (min)</Label>
              <Input
                id="r-prep"
                type="number"
                inputMode="numeric"
                min={0}
                value={prep}
                onChange={(e) => setPrep(e.target.value)}
                placeholder="bv. 20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-base">Basis porties</Label>
              <Input
                id="r-base"
                type="number"
                inputMode="numeric"
                min={1}
                value={baseServings}
                onChange={(e) => setBaseServings(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3.5 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <Leaf className="size-4 text-primary" /> Verse groenten
              </span>
              <Switch checked={usesFresh} onCheckedChange={setUsesFresh} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3.5 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <Snowflake className="size-4 text-sky-500" /> Diepvriesvriendelijk
              </span>
              <Switch checked={freezer} onCheckedChange={setFreezer} />
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-tags">Tags</Label>
            <TagsInput id="r-tags" value={tags} onChange={setTags} suggestions={TAG_SUGGESTIONS} />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="r-ing">Ingrediënten</Label>
              <span className="text-xs text-muted-foreground">hoeveelheden voor {baseNum} personen</span>
            </div>
            <Textarea
              id="r-ing"
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder={"Eén ingrediënt per lijn, bv.:\n700 g wortels\nRobin 2 / Amber 1 stuk hamburger\nvast: 1 blik tomatenstukjes\n2 stuk paprika *"}
              className="min-h-32 font-mono text-[0.8rem] leading-relaxed"
            />
            <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Gewoon typen werkt (<span className="font-medium text-foreground">700 g wortels</span>). Voor vlees dat
                Robin/Amber anders eten: <span className="font-medium text-foreground">Robin 2 / Amber 1 stuk hamburger</span>.
                Eénmalig per gerecht: <span className="font-medium text-foreground">vast: 1 blik …</span>. Verse groente:
                zet een <span className="font-medium text-foreground">*</span> achteraan. Bereik kan ook:{" "}
                <span className="font-medium text-foreground">800-1000 g gehakt</span>.
              </p>
            </div>

            {parsed.length > 0 && (
              <div className="rounded-lg border bg-card">
                <div className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  Zo lezen we het ({parsed.length} {parsed.length === 1 ? "ingrediënt" : "ingrediënten"})
                </div>
                <ul className="divide-y">
                  {parsed.map((p, i) => {
                    const m = modeLabel(p);
                    return (
                      <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{p.name || <em className="text-muted-foreground">?</em>}</span>
                          {p.is_fresh && <Leaf className="size-3 text-primary" />}
                        </span>
                        <span className="flex items-center gap-2 text-right">
                          <span className="tabular-nums text-muted-foreground">{qtyLabel(p)}</span>
                          <Badge variant="outline" className={`shrink-0 ${m.tone}`}>
                            {m.label}
                          </Badge>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-method">Bereiding (optioneel)</Label>
            <Textarea
              id="r-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Korte beschrijving of stappen…"
              className="min-h-20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-notes">Notities (optioneel)</Label>
            <Input
              id="r-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="bv. lekker met een frisse salade"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button onClick={onSave} disabled={pending}>
            {pending ? "Opslaan…" : recipe ? "Wijzigingen opslaan" : "Recept toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
