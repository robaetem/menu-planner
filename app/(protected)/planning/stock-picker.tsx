"use client";

// Shared pieces of the vleesje and groente pickers: what the freezer still has
// free for this meal, the chips to take from it and one chosen line.

import * as React from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { availableByKey, round3, stockKey, type FreezerStock } from "@/lib/freezer/stock";
export { mealStockLines as demandOf } from "@/lib/freezer/stock";

export type StockOption = { key: string; name: string; unit: string; free: number; total: number };

/** Free stock per name for `mealId` (its own reservations count as free).
 *  Names with nothing in the freezer are left out. */
export function useStockOptions(stock: FreezerStock, mealId: string | null): StockOption[] {
  return React.useMemo(
    () =>
      [...availableByKey(stock.entries, stock.reservations, mealId)]
        .map(([key, v]) => ({ key, ...v }))
        .filter((o) => o.total > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "nl")),
    [stock, mealId],
  );
}

/** How much of `option` is still free once this meal's selection is taken. */
export function leftOf(option: StockOption | undefined, selected: number): number {
  return option ? Math.max(0, round3(option.free - selected)) : 0;
}

export function findOption(options: StockOption[], name: string, unit = ""): StockOption | undefined {
  const k = stockKey(name, unit);
  return options.find((o) => o.key === k);
}

export function StockChips({
  options,
  selectedOf,
  format,
  onAdd,
  empty,
}: {
  options: StockOption[];
  /** How much this meal already takes of an option. */
  selectedOf: (o: StockOption) => number;
  format: (o: StockOption, left: number) => string;
  onAdd: (o: StockOption) => void;
  empty: string;
}) {
  if (!options.length) return <p className="px-1 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const left = leftOf(o, selectedOf(o));
        return (
          <button
            key={o.key}
            type="button"
            disabled={left <= 0}
            onClick={() => onAdd(o)}
            title={left <= 0 ? "Alles is al ingepland" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              left > 0
                ? "border-border bg-card hover:border-sky-400"
                : "cursor-not-allowed border-dashed text-muted-foreground opacity-60",
            )}
          >
            {o.name}
            <span className="text-xs text-muted-foreground tabular-nums">{format(o, left)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One chosen line: icon, name, a stepper and a remove button. `short` > 0
 *  marks a line that wants more than the freezer has free. */
export function ChosenLine({
  icon,
  name,
  label,
  amount,
  canIncrease,
  short,
  shortLabel,
  onStep,
  onRemove,
  children,
}: {
  icon: React.ReactNode;
  name: string;
  label: string;
  amount: string;
  canIncrease: boolean;
  short: number;
  shortLabel?: string;
  onStep: (direction: 1 | -1) => void;
  onRemove: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border bg-card px-3 py-2",
        short > 0 && "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30",
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => onStep(-1)} aria-label="Minder">
            <Minus className="size-3.5" />
          </Button>
          <span className="min-w-6 text-center text-sm font-medium tabular-nums">{amount}</span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onStep(1)}
            disabled={!canIncrease}
            aria-label="Meer"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
          aria-label="Verwijderen"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {short > 0 && (
        <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300">
          {shortLabel ?? `${short} tekort`}: niet genoeg in de diepvries
        </p>
      )}
      {children}
    </li>
  );
}
