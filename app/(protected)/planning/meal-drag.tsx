"use client";

// Dragging a planned meal to another day (or another person).
//
// Built on Pointer Events rather than HTML5 drag-and-drop, because native DnD
// does not fire on touch screens and this plan is mostly read on a phone. That
// means we do the three things the browser would otherwise do for us: only
// start once the finger has actually moved, draw our own card under the
// pointer, and scroll the page when the pointer nears an edge (the plan is a
// long vertical list, so a drop target is usually off-screen).
//
// Drop targets are plain DOM: any element carrying `data-drop-date` +
// `data-drop-assignee` (see `DropZone`). We hit-test with elementFromPoint, so
// zones do not have to register themselves.

import * as React from "react";
import type { Assignee, PlanMealWithRecipe } from "@/lib/types";

export type DropTarget = { date: string; assignee: Assignee };

type DragState = {
  meal: PlanMealWithRecipe;
  from: DropTarget;
  label: string;
  /** Pointer position, for drawing the dragged card. */
  x: number;
  y: number;
  /** Width of the card we picked up, so the ghost matches it. */
  width: number;
  over: DropTarget | null;
  /** The day card under the pointer — only that one opens up its boxes. */
  overDay: string | null;
  /** Set once the pointer has left the day the drag started on, so that day
   *  does not rearrange itself under your finger the moment you pick a meal
   *  up. Coming back to it later is fine. */
  leftSource: boolean;
};

/** How far the pointer must travel before this counts as a drag and not a tap. */
const DRAG_THRESHOLD = 6;
/** Distance from the viewport edge at which the page starts scrolling along. */
const EDGE = 90;
const MAX_SCROLL_SPEED = 18;

type DragContextValue = {
  drag: DragState | null;
  begin: (
    e: React.PointerEvent,
    meal: PlanMealWithRecipe,
    from: DropTarget,
    label: string,
  ) => void;
  isOver: (target: DropTarget) => boolean;
  /** True while this day should show all three boxes to drop into. */
  isDayOpen: (date: string) => boolean;
};

const DragContext = React.createContext<DragContextValue>({
  drag: null,
  begin: () => {},
  isOver: () => false,
  isDayOpen: () => false,
});

export function useMealDrag(): DragContextValue {
  return React.useContext(DragContext);
}

function sameTarget(a: DropTarget, b: DropTarget): boolean {
  return a.date === b.date && a.assignee === b.assignee;
}

/** What is under the pointer: the exact box, and the day card it belongs to.
 *  The day is tracked separately because a day's empty boxes do not exist in
 *  the DOM until that day is the one being hovered. */
function targetAt(x: number, y: number): { zone: DropTarget | null; day: string | null } {
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof Element)) return { zone: null, day: null };
  const day = el.closest("[data-day-card]")?.getAttribute("data-day-card") ?? null;
  const box = el.closest("[data-drop-date]");
  const date = box?.getAttribute("data-drop-date");
  const assignee = box?.getAttribute("data-drop-assignee");
  return {
    zone: date && assignee ? { date, assignee: assignee as Assignee } : null,
    day,
  };
}

export function MealDragProvider({
  onDrop,
  children,
}: {
  onDrop: (meal: PlanMealWithRecipe, from: DropTarget, to: DropTarget) => void;
  children: React.ReactNode;
}) {
  const [drag, setDragState] = React.useState<DragState | null>(null);
  // The pointer handlers run outside React's render loop, so they read the live
  // value from a ref instead of a captured state variable.
  const live = React.useRef<DragState | null>(null);
  const scroll = React.useRef<{ raf: number; speed: number } | null>(null);

  const setDrag = React.useCallback((next: DragState | null) => {
    live.current = next;
    setDragState(next);
  }, []);

  const stopScrolling = React.useCallback(() => {
    if (!scroll.current) return;
    cancelAnimationFrame(scroll.current.raf);
    scroll.current = null;
  }, []);

  /** Keep scrolling while the pointer sits near the top or bottom edge. */
  const scrollTowards = React.useCallback(
    (y: number) => {
      const top = y - EDGE;
      const bottom = y - (window.innerHeight - EDGE);
      let speed = 0;
      if (top < 0) speed = Math.max(-MAX_SCROLL_SPEED, (top / EDGE) * MAX_SCROLL_SPEED);
      else if (bottom > 0) speed = Math.min(MAX_SCROLL_SPEED, (bottom / EDGE) * MAX_SCROLL_SPEED);

      if (speed === 0) {
        stopScrolling();
        return;
      }
      if (scroll.current) {
        scroll.current.speed = speed;
        return;
      }
      const step = () => {
        if (!scroll.current) return;
        window.scrollBy(0, scroll.current.speed);
        scroll.current.raf = requestAnimationFrame(step);
      };
      scroll.current = { speed, raf: requestAnimationFrame(step) };
    },
    [stopScrolling],
  );

  React.useEffect(() => stopScrolling, [stopScrolling]);

  const begin = React.useCallback(
    (e: React.PointerEvent, meal: PlanMealWithRecipe, from: DropTarget, label: string) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const card = (e.currentTarget as HTMLElement).closest("[data-meal-card]") as HTMLElement | null;
      const width = card?.getBoundingClientRect().width ?? 220;
      const startX = e.clientX;
      const startY = e.clientY;
      let started = false;

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        stopScrolling();
      };

      function onMove(ev: PointerEvent) {
        if (!started) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
          started = true;
        }
        ev.preventDefault();
        const { zone, day } = targetAt(ev.clientX, ev.clientY);
        setDrag({
          meal,
          from,
          label,
          width,
          x: ev.clientX,
          y: ev.clientY,
          over: zone,
          overDay: day,
          leftSource: (live.current?.leftSource ?? false) || (day !== null && day !== from.date),
        });
        scrollTowards(ev.clientY);
      }

      function onUp(ev: PointerEvent) {
        const state = live.current;
        cleanup();
        setDrag(null);
        if (!state) return;
        // The pointerup lands on whatever is under the finger; swallow the
        // click it produces so dropping onto a card does not also open it.
        swallowNextClick();
        // Hit-test once more at the release point. A day's boxes only render
        // once it is hovered, so the box under the pointer can be newer than
        // the last pointermove saw — releasing right after entering a day
        // would otherwise drop nothing.
        const drop = targetAt(ev.clientX, ev.clientY).zone ?? state.over;
        if (drop && !sameTarget(drop, state.from)) {
          onDrop(state.meal, state.from, drop);
        }
      }

      function onCancel() {
        cleanup();
        setDrag(null);
      }

      function onKey(ev: KeyboardEvent) {
        if (ev.key !== "Escape") return;
        cleanup();
        setDrag(null);
      }

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey);
    },
    [onDrop, scrollTowards, setDrag, stopScrolling],
  );

  const isOver = React.useCallback(
    (target: DropTarget) => !!drag?.over && sameTarget(drag.over, target),
    [drag],
  );

  // Only the hovered day opens up. Revealing every day at once made all ten
  // cards grow the instant you picked a meal up, which shifted the whole page
  // under the pointer.
  const isDayOpen = React.useCallback(
    (date: string) => {
      if (!drag || drag.overDay !== date) return false;
      return date !== drag.from.date || drag.leftSource;
    },
    [drag],
  );

  const value = React.useMemo(
    () => ({ drag, begin, isOver, isDayOpen }),
    [drag, begin, isOver, isDayOpen],
  );

  return (
    <DragContext.Provider value={value}>
      {children}
      {drag && <DragGhost drag={drag} />}
    </DragContext.Provider>
  );
}

function swallowNextClick() {
  const swallow = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  // If no click follows (the common case on touch), drop the listener again so
  // it cannot eat an unrelated click later on.
  window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 300);
}

/** The card that follows the pointer. `pointer-events-none` is essential —
 *  otherwise it would be what elementFromPoint finds under the finger. */
function DragGhost({ drag }: { drag: DragState }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 text-sm font-medium text-foreground shadow-lg ring-2 ring-amber-400/40 dark:border-amber-800 dark:bg-amber-950"
      style={{ left: drag.x, top: drag.y, width: Math.min(drag.width, 260), opacity: 0.95 }}
    >
      <span className="line-clamp-2">{drag.label}</span>
    </div>
  );
}

/** Wraps a region of a day card so a meal can be dropped on it. Only the day
 *  being hovered outlines its boxes — an outline on every day at once was as
 *  distracting as the layout jump it came with. `outline` is used rather than
 *  `border` because it does not take up space, so nothing moves. */
export function DropZone({
  date,
  assignee,
  className,
  children,
}: {
  date: string;
  assignee: Assignee;
  className?: string;
  children: React.ReactNode;
}) {
  const { drag, isOver, isDayOpen } = useMealDrag();
  const hinted = drag !== null && drag.overDay === date;
  const over = isOver({ date, assignee });
  return (
    <div
      data-drop-date={date}
      data-drop-assignee={assignee}
      className={[
        "rounded-lg transition-colors",
        hinted && !over ? "outline-dashed outline-1 outline-offset-2 outline-border" : "",
        over ? "outline-2 outline-offset-2 outline-primary bg-primary/5" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
