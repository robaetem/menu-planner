"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Minus, X, Snowflake, ShoppingCart, Sparkles, Beef } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { PlanMealWithRecipe, TemplateVleesje, Vleesje } from "@/lib/types";
import { setMealVleesjes } from "./actions";
import { parseBuyVleesjes } from "./ai-actions";

export function VleesjePickerDialog({
  meal,
  recipeTitle,
  vleesjes,
  vleesjeNames,
  open,
  onOpenChange,
}: {
  meal: PlanMealWithRecipe | null;
  recipeTitle: string;
  vleesjes: Vleesje[];
  vleesjeNames: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [lines, setLines] = React.useState<TemplateVleesje[]>([]);
  const [buyText, setBuyText] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setLines((meal?.template_vleesjes ?? []).map((v) => ({ ...v })));
      setBuyText("");
    }
  }, [open, meal]);

  // How many of a freezer vleesje are still free to reserve (inventory minus what
  // this selection already takes).
  function freezerSelected(name: string): number {
    const key = name.toLowerCase();
    return lines.filter((l) => l.source === "freezer" && l.name.toLowerCase() === key).reduce((s, l) => s + l.count, 0);
  }
  function available(v: Vleesje): number {
    return Math.max(0, v.count - freezerSelected(v.name));
  }

  function addFreezer(v: Vleesje) {
    if (available(v) <= 0) return;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.source === "freezer" && l.name.toLowerCase() === v.name.toLowerCase());
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], count: next[i].count + 1 };
        return next;
      }
      return [...prev, { name: v.name, count: 1, source: "freezer" }];
    });
  }

  function addBuy(name: string, count: number) {
    const t = name.trim();
    if (!t) return;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.source === "buy" && l.name.toLowerCase() === t.toLowerCase());
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], count: next[i].count + count };
        return next;
      }
      return [...prev, { name: t, count, source: "buy" }];
    });
  }

  async function onParseBuy() {
    const t = buyText.trim();
    if (!t || parsing) return;
    setParsing(true);
    try {
      const parsed = await parseBuyVleesjes(t, vleesjeNames);
      if (parsed.length === 0) {
        addBuy(t, 1);
      } else {
        for (const p of parsed) addBuy(p.name, p.count);
      }
      setBuyText("");
    } catch (e) {
      toast.error("Verwerken mislukt.");
      console.error(e);
      addBuy(t, 1);
      setBuyText("");
    } finally {
      setParsing(false);
    }
  }

  function setCount(idx: number, count: number) {
    setLines((prev) => {
      if (count <= 0) return prev.filter((_, i) => i !== idx);
      const next = [...prev];
      // Don't let a freezer line exceed what's in stock.
      if (next[idx].source === "freezer") {
        const inv = vleesjes.find((v) => v.name.toLowerCase() === next[idx].name.toLowerCase());
        const otherSel = freezerSelected(next[idx].name) - next[idx].count;
        const max = inv ? Math.max(0, inv.count - otherSel) : count;
        count = Math.min(count, max);
      }
      next[idx] = { ...next[idx], count };
      return next;
    });
  }

  function onSave() {
    if (!meal) return;
    setSaving(true);
    setMealVleesjes(meal.id, lines)
      .then(() => {
        router.refresh();
        onOpenChange(false);
      })
      .catch((e) => {
        toast.error("Opslaan mislukt.");
        console.error(e);
      })
      .finally(() => setSaving(false));
  }

  const availableInv = vleesjes.filter((v) => v.count > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Beef className="size-4 text-rose-500" /> Kies vleesje
          </DialogTitle>
          <DialogDescription>Voor “{recipeTitle}” — uit de diepvries of te kopen.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {/* Current selection */}
          <section>
            <h4 className="mb-2 text-sm font-semibold tracking-tight">Gekozen</h4>
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Nog niets gekozen.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((l, i) => (
                  <li key={`${l.source}-${l.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                    {l.source === "freezer" ? (
                      <Snowflake className="size-4 shrink-0 text-sky-500" />
                    ) : (
                      <ShoppingCart className="size-4 shrink-0 text-amber-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {l.source === "freezer" ? "diepvries" : "te kopen"}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="icon-sm" onClick={() => setCount(i, l.count - 1)} aria-label="Minder">
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="min-w-6 text-center text-sm font-medium tabular-nums">{l.count}</span>
                      <Button variant="outline" size="icon-sm" onClick={() => setCount(i, l.count + 1)} aria-label="Meer">
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                    <button
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Verwijderen"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* From the freezer */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <Snowflake className="size-3.5 text-sky-500" /> Uit de diepvries
            </h4>
            {availableInv.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">Geen vleesjes in voorraad.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableInv.map((v) => {
                  const left = available(v);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={left <= 0}
                      onClick={() => addFreezer(v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        left > 0
                          ? "border-border bg-card hover:border-sky-400"
                          : "cursor-not-allowed border-dashed text-muted-foreground opacity-60",
                      )}
                    >
                      {v.name}
                      <span className="text-xs text-muted-foreground tabular-nums">{left}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* To buy */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <ShoppingCart className="size-3.5 text-amber-600" /> Te kopen
            </h4>
            <div className="flex gap-2">
              <Input
                value={buyText}
                onChange={(e) => setBuyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onParseBuy();
                  }
                }}
                placeholder="bv. 2 hamburger en 1 worst"
              />
              <Button variant="outline" onClick={onParseBuy} disabled={parsing || !buyText.trim()} className="shrink-0">
                <Sparkles className="size-4" /> {parsing ? "…" : "Toevoegen"}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Komt op je boodschappenlijstje bij “Maak boodschappenlijstje”.
            </p>
          </section>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
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
