"use client";

// One shared tooltip for all the (i) buttons in a shopping list. Base UI can
// position a popup against any element via `anchor`, so a single controlled
// tooltip follows whichever button is hovered/focused instead of mounting a
// React tooltip per line inside the editor.

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { formatDayLabel } from "@/lib/date";
import { sortOrigins, type ShoppingOriginLine } from "@/lib/shopping/origins";
import { PersonDot, type Person } from "@/components/person-badge";

const WHO: Record<string, string> = { amber: "Amber", robin: "Robin" };

export function OriginTooltip({
  line,
  anchor,
  open,
}: {
  line: ShoppingOriginLine | null;
  anchor: HTMLElement | null;
  open: boolean;
}) {
  return (
    <TooltipPrimitive.Root open={open && !!line && !!anchor}>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          anchor={anchor}
          side="top"
          align="start"
          sideOffset={6}
          className="isolate z-50"
        >
          <TooltipPrimitive.Popup className="z-50 w-fit max-w-[19rem] origin-(--transform-origin) rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {line && <OriginList line={line} />}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function OriginList({ line }: { line: ShoppingOriginLine }) {
  const rows = sortOrigins(line.origins);
  return (
    <div>
      <p className="font-semibold">
        {line.total ? `${line.total} ${line.name}` : line.name}
      </p>
      <p className="mt-0.5 text-background/60">
        {rows.length === 1 ? "Komt van 1 maaltijd" : `Komt van ${rows.length} maaltijden`}
      </p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((o, i) => (
          <li key={`${o.date}-${o.meal}-${i}`} className="flex items-baseline gap-1.5">
            <span className="shrink-0 font-medium tabular-nums">{o.amount}</span>
            <span className="text-background/50">·</span>
            <span className="min-w-0">
              {o.meal}
              {o.assignee && o.assignee !== "both" && WHO[o.assignee] ? (
                <span className="ml-1.5 inline-flex items-center gap-1 text-background/70">
                  <PersonDot who={o.assignee as Person} />
                  {WHO[o.assignee]}
                </span>
              ) : null}
              {o.date ? (
                <span className="block text-background/60">{formatDayLabel(o.date)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
