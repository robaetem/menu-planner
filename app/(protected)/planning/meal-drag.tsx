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
};

const DragContext = React.createContext<DragContextValue>({
  drag: null,
  begin: () => {},
  isOver: () => false,
});

export function useMealDrag(): DragContextValue {
  return React.useContext(DragContext);
}

function sameTarget(a: DropTarget, b: DropTarget): boolean {
  return a.date === b.date && a.assignee === b.assignee;
}

function zoneAt(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y);
  const zone = el instanceof Element ? el.closest("[data-drop-date]") : null;
  if (!zone) return null;
  const date = zone.getAttribute("data-drop-date");
  const assignee = zone.getAttribute("data-drop-assignee");
  if (!date || !assignee) return null;
  return { date, assignee: assignee as Assignee };
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
        setDrag({
          meal,
          from,
          label,
          width,
          x: ev.clientX,
          y: ev.clientY,
          over: zoneAt(ev.clientX, ev.clientY),
        });
        scrollTowards(ev.clientY);
      }

      function onUp() {
        const state = live.current;
        cleanup();
        setDrag(null);
        if (!state) return;
        // The pointerup lands on whatever is under the finger; swallow the
        // click it produces so dropping onto a card does not also open it.
        swallowNextClick();
        if (state.over && !sameTarget(state.over, state.from)) {
          onDrop(state.meal, state.from, state.over);
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

  const value = React.useMemo(() => ({ drag, begin, isOver }), [drag, begin, isOver]);

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

/** Wraps a region of a day card so a meal can be dropped on it. */
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
  const { drag, isOver } = useMealDrag();
  const active = drag !== null;
  const over = isOver({ date, assignee });
  return (
    <div
      data-drop-date={date}
      data-drop-assignee={assignee}
      className={[
        "rounded-lg transition-colors",
        active ? "outline-dashed outline-1 outline-offset-2 outline-border" : "",
        over ? "outline-2 outline-primary bg-primary/5" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
