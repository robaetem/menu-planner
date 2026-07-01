"use client";

import { Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Ingredient, IngredientRow } from "@/lib/types";

// "Samen" amounts are entered for the two of us together; per_serving values are
// normalized by this on save (so a single-person meal scales to one serving).
const HOUSEHOLD = 2;

export const UNIT_OPTIONS = ["stuk", "gram", "dl", "cl", "ml"];

export type IngRow = {
  key: string;
  name: string;
  unit: string;
  samen: string;
  amber: string;
  robin: string;
  includeInShopping: boolean;
};

let counter = 0;
const newKey = () => `row-${counter++}`;

export function emptyRow(): IngRow {
  return { key: newKey(), name: "", unit: "gram", samen: "", amber: "", robin: "", includeInShopping: true };
}

function num(s: string): number | null {
  const v = parseFloat((s || "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
}
function mapUnit(u: string): string {
  const v = (u || "").toLowerCase().trim();
  if (v === "g" || v === "gr" || v === "gram" || v === "grammen") return "gram";
  if (UNIT_OPTIONS.includes(v)) return v;
  if (v === "stuks" || v === "st") return "stuk";
  return "stuk"; // legacy counts (blik, teen, rol, fles, bos, pak, …) → stuk
}

/** Stored ingredients → editor rows (Samen shown "for the two of us"). */
export function rowsFromIngredients(ings: Ingredient[]): IngRow[] {
  return [...ings]
    .sort((a, b) => a.sort - b.sort)
    .map((ig) => {
      const unit = mapUnit(ig.unit);
      if (ig.scaling === "per_person") {
        return {
          key: newKey(),
          name: ig.name,
          unit,
          samen: "",
          amber: ig.amounts_per_person?.amber != null ? fmt(Number(ig.amounts_per_person.amber)) : "",
          robin: ig.amounts_per_person?.robin != null ? fmt(Number(ig.amounts_per_person.robin)) : "",
          includeInShopping: ig.include_in_shopping ?? true,
        };
      }
      const base = ig.amount_max ?? ig.amount;
      // per_serving shown ×HOUSEHOLD ("for two"); legacy fixed shown as-is.
      const samen = base != null ? fmt(ig.scaling === "per_serving" ? base * HOUSEHOLD : base) : "";
      return { key: newKey(), name: ig.name, unit, samen, amber: "", robin: "", includeInShopping: ig.include_in_shopping ?? true };
    });
}

/** Editor rows → DB ingredient rows. */
export function ingredientRowsFromEditor(rows: IngRow[]): IngredientRow[] {
  return rows
    .filter((r) => r.name.trim())
    .map((r, i) => {
      const base = { name: r.name.trim(), unit: r.unit, is_fresh: false, include_in_shopping: r.includeInShopping, sort: i };
      const rb = num(r.robin);
      const am = num(r.amber);
      if (rb != null || am != null) {
        const pp: Record<string, number> = {};
        if (rb != null) pp.robin = rb;
        if (am != null) pp.amber = am;
        return { ...base, scaling: "per_person" as const, amount: null, amount_max: null, amounts_per_person: pp };
      }
      const a = num(r.samen);
      return { ...base, scaling: "per_serving" as const, amount: a != null ? a / HOUSEHOLD : null, amount_max: null, amounts_per_person: {} };
    });
}

export function IngredientListEditor({
  rows,
  onChange,
}: {
  rows: IngRow[];
  onChange: (rows: IngRow[]) => void;
}) {
  function update(key: string, patch: Partial<IngRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function remove(key: string) {
    onChange(rows.filter((r) => r.key !== key));
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <Input
              value={r.name}
              onChange={(e) => update(r.key, { name: e.target.value })}
              placeholder="Ingrediënt"
              className="h-9 border-0 bg-transparent px-1 text-[0.95rem] font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <button
              type="button"
              onClick={() => remove(r.key)}
              className="shrink-0 p-1.5 text-muted-foreground transition-colors hover:text-destructive"
              aria-label="Ingrediënt verwijderen"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 pl-1">
            <AmountField label="Samen" value={r.samen} onChange={(v) => update(r.key, { samen: v })} />
            <AmountField label="Amber" value={r.amber} onChange={(v) => update(r.key, { amber: v })} />
            <AmountField label="Robin" value={r.robin} onChange={(v) => update(r.key, { robin: v })} />
            <Select value={r.unit} onValueChange={(v) => update(r.key, { unit: String(v) })}>
              <SelectTrigger size="sm" className="w-[5.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-muted/45 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <ShoppingBasket className="size-4 shrink-0" />
              <span className="truncate">Boodschappenlijst</span>
            </div>
            <Switch
              checked={r.includeInShopping}
              onCheckedChange={(v) => update(r.key, { includeInShopping: !!v })}
              aria-label={`${r.name || "Ingrediënt"} op boodschappenlijst`}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rows, emptyRow()])}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 hover:text-foreground"
      >
        <Plus className="size-4" /> Voeg ingrediënt toe
      </button>
    </div>
  );
}

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="h-8 w-16 px-2 text-center text-sm"
      />
    </label>
  );
}
