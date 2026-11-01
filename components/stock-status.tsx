"use client";

// Freezer tab pieces shared by Vleesjes and Groenten: which days already take
// part of an entry, and which planned meals the freezer can't cover.

import { CalendarCheck, TriangleAlert } from "lucide-react";
import { formatDayShort } from "@/lib/date";
import { entryStatus, shortagesByKey, type FreezerStock, type StockEntry } from "@/lib/freezer/stock";

export function StockPlanned({
  entry,
  stock,
  format,
}: {
  entry: StockEntry | undefined;
  stock: FreezerStock;
  format: (amount: number) => string;
}) {
  if (!entry) return null;
  const status = entryStatus(entry, stock.reservations);
  if (!status.planned.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {status.planned.map((p) => (
        <span
          key={p.mealId}
          title={p.mealTitle}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
        >
          <CalendarCheck className="size-3" />
          {format(p.amount)} ingepland op {formatDayShort(p.day)}
        </span>
      ))}
      <span className="text-xs text-muted-foreground">{format(status.free)} vrij</span>
    </div>
  );
}

/** "Krokante kip: 2 tekort (zo 8 nov 1, ma 9 nov 1)" for every planned meal
 *  the freezer can't cover. Never silently clamped. */
export function StockShortages({ stock, format }: { stock: FreezerStock; format: (amount: number, unit: string) => string }) {
  const short = [...shortagesByKey(stock.entries, stock.reservations, stock.demands).values()];
  if (!short.length) return null;
  return (
    <div
      role="alert"
      className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="size-4" /> Meer ingepland dan er in de diepvries ligt
      </p>
      <ul className="mt-2 space-y-1">
        {short.map((s) => (
          <li key={`${s.name}|${s.unit}`}>
            <span className="font-medium">{s.name}</span>: {format(s.short, s.unit)} tekort (
            {s.days.map((d) => `${formatDayShort(d.day)}: ${format(d.short, s.unit)}`).join(", ")})
          </li>
        ))}
      </ul>
    </div>
  );
}
