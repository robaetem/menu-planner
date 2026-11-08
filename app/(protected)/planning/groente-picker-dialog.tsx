"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Carrot, Snowflake } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PlanMealWithRecipe, RecipeWithIngredients, TemplateGroente } from "@/lib/types";
import { formatGroenteQuantity, normalizeGroenteUnit } from "@/lib/freezer/inventory";
import { guessReplacedIngredient, round3, stockKey } from "@/lib/freezer/stock";
import { setMealGroenten } from "./actions";
import { useFreezer } from "./freezer-context";
import { ChosenLine, findOption, leftOf, stepFor, StockChips, useStockOptions, type StockOption } from "./stock-picker";

const NOTHING = "__niets__";

function qty(amount: number, unit: string): string {
  return formatGroenteQuantity(amount, normalizeGroenteUnit(unit));
}

/** Pick vegetables from the freezer for a planned meal. They are reserved
 *  (oldest first), leave the freezer on the meal's day, and the recipe
 *  ingredient they replace stays off the boodschappenlijstje. */
export function GroentePickerDialog({
  meal,
  recipe,
  open,
  onOpenChange,
}: {
  meal: PlanMealWithRecipe | null;
  recipe: RecipeWithIngredients | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [lines, setLines] = React.useState<TemplateGroente[]>([]);
  const [saving, setSaving] = React.useState(false);
  const options = useStockOptions(useFreezer().groenten, meal?.id ?? null);
  const ingredientNames = React.useMemo(
    () => (recipe?.ingredients ?? []).filter((i) => i.include_in_shopping !== false).map((i) => i.name),
    [recipe],
  );
  const title = recipe?.title ?? meal?.freeform_title ?? meal?.raw_text ?? "Maaltijd";

  React.useEffect(() => {
    if (open) setLines((meal?.template_groenten ?? []).map((g) => ({ ...g })));
  }, [open, meal]);

  function selected(name: string, unit: string): number {
    const key = stockKey(name, unit);
    return round3(lines.filter((l) => stockKey(l.name, l.unit) === key).reduce((s, l) => s + l.amount, 0));
  }

  function add(o: StockOption) {
    const left = leftOf(o, selected(o.name, o.unit));
    if (left <= 0) return;
    const amount = Math.min(stepFor(o.unit), left);
    setLines((prev) => {
      const i = prev.findIndex((l) => stockKey(l.name, l.unit) === o.key);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], amount: round3(next[i].amount + amount) };
        return next;
      }
      return [...prev, { name: o.name, unit: o.unit, amount, replaces: guessReplacedIngredient(o.name, ingredientNames) }];
    });
  }

  function step(idx: number, direction: 1 | -1) {
    setLines((prev) => {
      const line = prev[idx];
      const left = leftOf(findOption(options, line.name, line.unit), selected(line.name, line.unit));
      const delta = direction > 0 ? Math.min(stepFor(line.unit), left) : -stepFor(line.unit);
      if (direction > 0 && delta <= 0) return prev;
      const amount = round3(line.amount + delta);
      if (amount <= 0) return prev.filter((_, i) => i !== idx);
      const next = [...prev];
      next[idx] = { ...line, amount };
      return next;
    });
  }

  function onSave() {
    if (!meal) return;
    setSaving(true);
    setMealGroenten(meal.id, lines)
      .then(() => {
        router.refresh();
        onOpenChange(false);
      })
      .catch((e) => {
        toast.error(e instanceof Error && e.message ? e.message : "Opslaan mislukt.");
        console.error(e);
      })
      .finally(() => setSaving(false));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Carrot className="size-4 text-emerald-600" /> Groenten uit de diepvries
          </DialogTitle>
          <DialogDescription>Voor “{title}”. Wat je hier kiest, komt niet op je boodschappenlijstje.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <section>
            <h4 className="mb-2 text-sm font-semibold tracking-tight">Gekozen</h4>
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Nog niets gekozen.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((l, i) => {
                  const option = findOption(options, l.name, l.unit);
                  const short = Math.max(0, round3(l.amount - (option?.free ?? 0)));
                  return (
                    <ChosenLine
                      key={`${l.name}-${l.unit}-${i}`}
                      icon={<Snowflake className="size-4 shrink-0 text-sky-500" />}
                      name={l.name}
                      label="diepvries"
                      amount={qty(l.amount, l.unit)}
                      canIncrease={leftOf(option, selected(l.name, l.unit)) > 0}
                      short={short}
                      shortLabel={`${qty(short, l.unit)} tekort`}
                      onStep={(d) => step(i, d)}
                      onRemove={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      {ingredientNames.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="shrink-0">Niet kopen:</span>
                          <Select
                            value={l.replaces ?? NOTHING}
                            onValueChange={(v) =>
                              setLines((prev) =>
                                prev.map((x, idx) => (idx === i ? { ...x, replaces: v === NOTHING ? null : String(v) } : x)),
                              )
                            }
                          >
                            <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 text-xs" aria-label="Ingrediënt dat je niet koopt">
                              <SelectValue>{(v: string) => (v === NOTHING || !v ? "niets" : v)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NOTHING}>niets</SelectItem>
                              {ingredientNames.map((n) => (
                                <SelectItem key={n} value={n}>
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </ChosenLine>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <Snowflake className="size-3.5 text-sky-500" /> Uit de diepvries
            </h4>
            <StockChips
              options={options}
              selectedOf={(o) => selected(o.name, o.unit)}
              format={(o, left) => qty(left, o.unit)}
              onAdd={add}
              empty="Geen groenten in de diepvries."
            />
          </section>
        </div>

        <DialogFooter className="m-0 shrink-0 gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Opslaan…" : "Bewaren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
