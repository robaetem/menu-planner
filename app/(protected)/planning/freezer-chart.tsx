"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDayLabel, formatDayTiny } from "@/lib/date";
import { freezerTimeline, type Who } from "@/lib/freezer/potjes";
import { useFreezer } from "./freezer-context";

const WHOS: Who[] = ["robin", "amber"];

/** Series colours (validated as a pair, light and dark). */
const SERIES = "[--robin:#2a78d6] [--amber:#eb6834] dark:[--robin:#3987e5] dark:[--amber:#d95926]";

const COL = 56; // min px per day
const UNIT = 22; // px per potje, so every count gets its own gridline
const PAD = { top: 18, right: 28, bottom: 26, left: 30 };

/** Step chart of how many potjes Robin and Amber have in the freezer at the end
 *  of every planned day, from what is frozen now plus the plan. */
export function FreezerChart({
  days,
  robinLabel,
  amberLabel,
  onClose,
}: {
  days: string[];
  robinLabel: string;
  amberLabel: string;
  onClose: () => void;
}) {
  const { portions } = useFreezer();
  const timeline = React.useMemo(() => freezerTimeline(portions, days), [portions, days]);
  const label = (w: Who) => (w === "robin" ? robinLabel : amberLabel);
  const [active, setActive] = React.useState<number | null>(null);

  const box = React.useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = React.useState(0);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = timeline.days.length;
  const end = n ? timeline.days[n - 1].counts : timeline.start;
  const width = Math.max(boxWidth, PAD.left + PAD.right + n * COL);
  const colW = n ? (width - PAD.left - PAD.right) / n : 0;
  const cx = (i: number) => PAD.left + colW * (i + 0.5);

  // Range: one potje of room above the highest count and below the lowest (never under 0).
  const values = [...WHOS.map((w) => timeline.start[w]), ...timeline.days.flatMap((d) => WHOS.map((w) => d.counts[w]))];
  const top = Math.max(...values) + 1;
  const bottom = Math.max(0, Math.min(...values) - 1);
  const ticks = Array.from({ length: top - bottom + 1 }, (_, i) => bottom + i);
  const H = PAD.top + PAD.bottom + Math.max(140, (top - bottom) * UNIT);
  // Equal counts would hide one line behind the other: nudge them apart a hair.
  const nudge: Record<Who, number> = { robin: -1.5, amber: 1.5 };
  const y = (v: number, w?: Who) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - bottom) / (top - bottom)) + (w ? nudge[w] : 0);

  // Step-after: a day's change happens at its centre and holds until the next.
  const path = (w: Who) => {
    let d = `M ${PAD.left} ${y(timeline.start[w], w)}`;
    timeline.days.forEach((day, i) => {
      d += ` H ${cx(i)} V ${y(day.counts[w], w)}`;
    });
    return `${d} H ${width - PAD.right}`;
  };

  const activeDay = active !== null ? timeline.days[active] : null;

  return (
    <section className={cn("rounded-xl border bg-card p-4", SERIES)} aria-label="Potjesverloop">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Potjesverloop</h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Potjesverloop sluiten"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Legend doubles as the start → end summary. */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {WHOS.map((w) => {
          const diff = end[w] - timeline.start[w];
          return (
            <span key={w} className="inline-flex items-center gap-2">
              <span className="h-0.5 w-4 rounded-full" style={{ background: `var(--${w})` }} aria-hidden />
              <span className="font-medium">{label(w)}</span>
              <span className="tabular-nums text-muted-foreground">
                {timeline.start[w]} → {end[w]}
                <span className={cn("ml-1", diff !== 0 && "font-medium text-foreground")}>
                  ({diff > 0 ? `+${diff}` : diff === 0 ? "±0" : diff})
                </span>
              </span>
            </span>
          );
        })}
      </div>

      <div ref={box} className="relative mt-3 overflow-x-auto" onMouseLeave={() => setActive(null)}>
        {n > 0 && (
          <svg width={width} height={H} className="block" role="img" aria-label="Potjes per dag voor Robin en Amber">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            {timeline.days.map((d, i) => (
              <text
                key={d.date}
                x={cx(i)}
                y={H - 8}
                textAnchor="middle"
                className={cn("text-[11px]", active === i ? "fill-foreground font-medium" : "fill-muted-foreground")}
              >
                {formatDayTiny(d.date)}
              </text>
            ))}
            {active !== null && (
              <line x1={cx(active)} x2={cx(active)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-foreground/30" strokeWidth={1} />
            )}
            {WHOS.map((w) => (
              <path key={w} d={path(w)} fill="none" stroke={`var(--${w})`} strokeWidth={2} strokeLinejoin="round" />
            ))}
            {WHOS.map((w) =>
              timeline.days.map((d, i) =>
                d.changes.some((c) => c.who === w) || active === i ? (
                  <circle
                    key={`${w}-${d.date}`}
                    cx={cx(i)}
                    cy={y(d.counts[w], w)}
                    r={4}
                    fill={`var(--${w})`}
                    className="stroke-card"
                    strokeWidth={2}
                  />
                ) : null,
              ),
            )}
            {/* Values: where a line changes, and where it ends. */}
            {WHOS.map((w) =>
              timeline.days.map((d, i) =>
                d.changes.some((c) => c.who === w) ? (
                  <text
                    key={`v-${w}-${d.date}`}
                    x={cx(i) + 7}
                    y={y(d.counts[w], w) - 6}
                    className="fill-foreground text-[11px] font-medium tabular-nums"
                  >
                    {d.counts[w]}
                  </text>
                ) : null,
              ),
            )}
            {WHOS.map((w) => (
              <text
                key={`end-${w}`}
                x={width - PAD.right + 6}
                y={y(end[w], w)}
                dy={end.robin === end.amber ? (w === "robin" ? "-0.2em" : "0.9em") : "0.32em"}
                className="fill-foreground text-[11px] font-medium tabular-nums"
              >
                {end[w]}
              </text>
            ))}
            {/* Hit targets: a whole day column. */}
            {timeline.days.map((d, i) => (
              <rect
                key={d.date}
                x={PAD.left + colW * i}
                y={0}
                width={colW}
                height={H}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive((a) => (a === i ? null : i))}
              />
            ))}
          </svg>
        )}

        {activeDay && active !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-52 rounded-lg border bg-popover p-2.5 text-xs shadow-md"
            style={
              cx(active) > width / 2
                ? { right: Math.max(0, width - cx(active) + 10) }
                : { left: cx(active) + 10 }
            }
          >
            <p className="font-medium">{formatDayLabel(activeDay.date)}</p>
            <div className="mt-1.5 space-y-0.5">
              {WHOS.map((w) => (
                <p key={w} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: `var(--${w})` }} aria-hidden />
                    {label(w)}
                  </span>
                  <span className="font-medium tabular-nums">{activeDay.counts[w]}</span>
                </p>
              ))}
            </div>
            {activeDay.changes.length > 0 && (
              <ul className="mt-2 space-y-0.5 border-t pt-2 text-muted-foreground">
                {activeDay.changes.map((c) => (
                  <li key={`${c.name}-${c.who}-${c.delta}`}>
                    <span className="tabular-nums text-foreground">{c.delta > 0 ? `+${c.delta}` : c.delta}</span> {c.name}{" "}
                    <span>({label(c.who)}, {c.delta > 0 ? "gemaakt" : "gegeten"})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>Potjes in de diepvries per dag</caption>
        <thead>
          <tr>
            <th scope="col">Dag</th>
            {WHOS.map((w) => (
              <th key={w} scope="col">
                {label(w)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeline.days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{formatDayLabel(d.date)}</th>
              {WHOS.map((w) => (
                <td key={w}>{d.counts[w]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
