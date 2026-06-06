"use client";

import * as React from "react";
import { toast } from "sonner";
import { Leaf, Package, Copy, Plus, Trash2, Info, ShoppingCart } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import {
  computeShoppingList,
  formatQuantity,
  formatProvenanceAmount,
  type ShoppingLine,
} from "@/lib/planning/shopping";
import type { PlanDayWithMeals, RecipeWithIngredients, ShoppingCheck, ShoppingExtra } from "@/lib/types";
import { addExtra, deleteExtra, setShoppingCheck, toggleExtra } from "../actions";

export function ShoppingList({
  periodId,
  days,
  recipes,
  extras: initialExtras,
  checks,
}: {
  periodId: string;
  days: PlanDayWithMeals[];
  recipes: RecipeWithIngredients[];
  extras: ShoppingExtra[];
  checks: ShoppingCheck[];
}) {
  const ingredientsByRecipe = React.useMemo(
    () => Object.fromEntries(recipes.map((r) => [r.id, r.ingredients])),
    [recipes],
  );
  const result = React.useMemo(() => computeShoppingList(days, ingredientsByRecipe), [days, ingredientsByRecipe]);

  const [checked, setChecked] = React.useState<Set<string>>(
    () => new Set(checks.filter((c) => c.checked).map((c) => c.line_key)),
  );
  const [extras, setExtras] = React.useState<ShoppingExtra[]>(initialExtras);
  const [newExtra, setNewExtra] = React.useState("");

  function toggleLine(key: string) {
    const isChecked = !checked.has(key);
    setChecked((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(key);
      else next.delete(key);
      return next;
    });
    setShoppingCheck(periodId, key, isChecked).catch((e) => {
      console.error(e);
      toast.error("Kon afvinken niet bewaren.");
    });
  }

  function addExtraItem() {
    const t = newExtra.trim();
    if (!t) return;
    setNewExtra("");
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const temp: ShoppingExtra = { id: tempId, period_id: periodId, text: t, checked: false, sort: extras.length };
    setExtras((prev) => [...prev, temp]);
    addExtra(periodId, t)
      .then((row) => {
        if (row) setExtras((prev) => prev.map((x) => (x.id === tempId ? row : x)));
      })
      .catch((e) => {
        console.error(e);
        setExtras((prev) => prev.filter((x) => x.id !== tempId));
        toast.error("Toevoegen mislukt.");
      });
  }

  function toggleExtraItem(extra: ShoppingExtra) {
    const nextChecked = !extra.checked;
    setExtras((prev) => prev.map((x) => (x.id === extra.id ? { ...x, checked: nextChecked } : x)));
    toggleExtra(periodId, extra.id, nextChecked).catch((e) => console.error(e));
  }

  function removeExtraItem(id: string) {
    setExtras((prev) => prev.filter((x) => x.id !== id));
    deleteExtra(periodId, id).catch((e) => console.error(e));
  }

  function copyList() {
    const lines: string[] = [];
    const emit = (title: string, arr: ShoppingLine[]) => {
      if (!arr.length) return;
      lines.push(`${title}:`);
      arr.forEach((l) => {
        const q = formatQuantity(l);
        lines.push(`- ${q ? q + " " : ""}${l.name}`);
      });
      lines.push("");
    };
    emit("Verse producten", result.fresh);
    emit("Voorraad & kast", result.pantry);
    if (extras.length) {
      lines.push("Extra:");
      extras.forEach((x) => lines.push(`- ${x.text}`));
    }
    const text = lines.join("\n").trim();
    const ok = () => toast.success("Boodschappenlijst gekopieerd");
    const fail = () => toast.error("Kopiëren mislukt");
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(ok, fail);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(ta);
        copied ? ok() : fail();
      }
    } catch (e) {
      console.error(e);
      fail();
    }
  }

  const totalLines = result.all.length;
  const isEmpty = totalLines === 0 && extras.length === 0;

  return (
    <div className="space-y-5">
      {/* Coverage / actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {result.mealsCounted} {result.mealsCounted === 1 ? "maaltijd" : "maaltijden"} meegerekend
          {result.mealsFromFreezer > 0 && ` · ${result.mealsFromFreezer} uit diepvries`}
          {result.unlinkedMeals.length > 0 && (
            <HoverCard>
              <HoverCardTrigger
                render={
                  <button className="ml-1 inline-flex items-center gap-1 text-amber-600 underline-offset-2 hover:underline dark:text-amber-400" />
                }
              >
                <Info className="size-3.5" />
                {result.unlinkedMeals.length} zonder recept
              </HoverCardTrigger>
              <HoverCardContent className="w-72 text-sm">
                <p className="mb-1.5 font-medium">Tellen niet mee (geen recept gekoppeld):</p>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  {result.unlinkedMeals.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={copyList} disabled={isEmpty}>
          <Copy className="size-4" /> Kopieer lijst
        </Button>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <ShoppingCart className="size-6" />
          </div>
          <p className="mt-3 font-medium">Nog niets te kopen</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Koppel recepten aan de maaltijden in het Menu, dan verschijnt hier automatisch de boodschappenlijst.
          </p>
        </div>
      ) : (
        <>
          <ShoppingGroup
            title="Verse producten"
            icon={<Leaf className="size-4 text-primary" />}
            lines={result.fresh}
            checked={checked}
            onToggle={toggleLine}
          />
          <ShoppingGroup
            title="Voorraad & kast"
            icon={<Package className="size-4 text-muted-foreground" />}
            lines={result.pantry}
            checked={checked}
            onToggle={toggleLine}
          />

          {/* Extras */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Plus className="size-4 text-muted-foreground" /> Extra's
            </h3>
            <div className="overflow-hidden rounded-xl border">
              {extras.map((x) => (
                <div key={x.id} className="flex items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
                  <Checkbox checked={x.checked} onCheckedChange={() => toggleExtraItem(x)} />
                  <span className={cn("flex-1 text-sm", x.checked && "text-muted-foreground line-through")}>{x.text}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeExtraItem(x.id)}
                    aria-label="Verwijderen"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2 px-3 py-2">
                <Input
                  value={newExtra}
                  onChange={(e) => setNewExtra(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExtraItem();
                    }
                  }}
                  placeholder="bv. koffie, wc-papier…"
                  className="h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
                <Button variant="ghost" size="icon-sm" onClick={addExtraItem} disabled={!newExtra.trim()} aria-label="Toevoegen">
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ShoppingGroup({
  title,
  icon,
  lines,
  checked,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  lines: ShoppingLine[];
  checked: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (lines.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon} {title} <span className="font-normal text-muted-foreground">({lines.length})</span>
      </h3>
      <div className="overflow-hidden rounded-xl border">
        {lines.map((line) => {
          const isChecked = checked.has(line.key);
          const qty = formatQuantity(line);
          return (
            <div key={line.key} className="flex items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
              <Checkbox checked={isChecked} onCheckedChange={() => onToggle(line.key)} id={`chk-${line.key}`} />
              <label
                htmlFor={`chk-${line.key}`}
                className={cn(
                  "flex flex-1 cursor-pointer items-baseline gap-2 text-sm",
                  isChecked && "text-muted-foreground line-through",
                )}
              >
                {qty && <span className="min-w-16 font-medium tabular-nums">{qty}</span>}
                <span className={cn(!qty && "font-medium")}>{line.name}</span>
              </label>
              <HoverCard>
                <HoverCardTrigger
                  render={
                    <button className="text-muted-foreground/60 transition-colors hover:text-foreground" aria-label="Herkomst" />
                  }
                >
                  <Info className="size-3.5" />
                </HoverCardTrigger>
                <HoverCardContent className="w-64 text-sm">
                  <p className="mb-1.5 font-medium">{line.name}</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {line.provenance.map((p, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="truncate">{p.meal}</span>
                        <span className="shrink-0 tabular-nums">{formatProvenanceAmount(p, line.unit)}</span>
                      </li>
                    ))}
                  </ul>
                </HoverCardContent>
              </HoverCard>
            </div>
          );
        })}
      </div>
    </section>
  );
}
