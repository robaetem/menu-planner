"use client";

// Freezer tab pieces shared by Vleesjes and Groenten: which days already take
// part of an entry, and which planned meals the freezer can't cover.

import { CalendarCheck } from "lucide-react";
import { formatDayShort } from "@/lib/date";
import { entryStatus, type FreezerStock, type StockEntry } from "@/lib/freezer/stock";

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
