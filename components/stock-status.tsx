"use client";

// Freezer tab pieces shared by Potjes, Vleesjes and Groenten: "vrij" (free to
// plan) up front, "ingepland" (taken by a planned meal) muted behind it.

import * as React from "react";
import { CalendarCheck, ChevronDown, Minus, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { entryStatus, type FreezerStock, type StockEntry } from "@/lib/freezer/stock";

/** "di 17/11" */
export function formatDayNumeric(iso: string): string {
  return format(parseISO(iso), "EEEEEE d/MM", { locale: nl });
}

/** Planned meals taking part of an entry: quiet, one line per day. */
export function StockPlanned({
  entry,
  stock,
  format: fmt,
}: {
  entry: StockEntry | undefined;
  stock: FreezerStock;
  format: (amount: number) => string;
}) {
  if (!entry) return null;
  const { planned } = entryStatus(entry, stock.reservations);
  return (
    <PlannedLines
      items={planned.map((p) => ({ key: p.mealId, text: `${fmt(p.amount)} ingepland ${formatDayNumeric(p.day)}`, title: p.mealTitle }))}
    />
  );
}

export function PlannedLines({ items }: { items: { key: string; text: string; title?: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-0.5">
      {items.map((i) => (
        <li key={i.key} title={i.title} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CalendarCheck className="mt-0.5 size-3 shrink-0" />
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Alleen vrij" switch; the quiet line beside it shows what is hidden. */
export function OnlyFreeBar({
  onlyFree,
  onChange,
  summary,
}: {
  onlyFree: boolean;
  onChange: (v: boolean) => void;
  /** Free totals, e.g. "7 stuks vrij". */
  summary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {summary ? <div className="text-sm text-muted-foreground">{summary}</div> : <span />}
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Switch checked={onlyFree} onCheckedChange={onChange} aria-label="Alleen vrij" />
        Alleen vrij
      </label>
    </div>
  );
}

/** Quiet line under the list: how many are fully planned; tap to show them. */
export function HiddenPlanned({ count, onShow }: { count: number; onShow: () => void }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onShow}
      className="mt-3 w-full rounded-lg px-3 py-2 text-center text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {count} volledig ingepland · toon
    </button>
  );
}

export function NoneFree({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** A big free count that opens a +/- popover for hand corrections. */
export function FreeCount({
  free,
  total,
  unitLabel,
  caption,
  disabled,
  onAdd,
  onRemove,
  ariaLabel,
  className,
}: {
  free: string;
  total: number;
  unitLabel?: string;
  caption: string;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  ariaLabel: string;
  className?: string;
}) {
  const none = free === "0";
  return (
    <Popover>
      <PopoverTrigger
        aria-label={ariaLabel}
        render={
          <button
            className={cn(
              "inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1 text-left transition-colors hover:border-primary/40",
              none ? "border-dashed text-muted-foreground" : "border-border bg-background",
              className,
            )}
          />
        }
      >
        <span className={cn("font-semibold tabular-nums", none ? "text-base" : "text-xl")}>{free}</span>
        <span className="text-sm text-muted-foreground">{unitLabel ?? "vrij"}</span>
        <ChevronDown className="size-3 self-center text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={onRemove} disabled={total <= 0 || disabled} aria-label="Minder">
            <Minus className="size-3.5" />
          </Button>
          <span className="min-w-8 text-center text-sm font-medium tabular-nums">{total}</span>
          <Button variant="outline" size="icon-sm" onClick={onAdd} disabled={disabled} aria-label="Meer">
            <Plus className="size-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">{caption}</p>
      </PopoverContent>
    </Popover>
  );
}
