"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StickyNote, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { setDayNote } from "./actions";

/** A small per-day note ("Gebruik worsten uit de diepvries"). Collapsed to a
 *  subtle button when empty; an auto-growing textarea that saves on blur when
 *  open. Optimistic — the value lives locally and only persists on blur. */
export function DayNote({ dayDate, note }: { dayDate: string; note: string | null }) {
  const router = useRouter();
  const [value, setValue] = React.useState(note ?? "");
  const [open, setOpen] = React.useState(!!note);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  // Re-sync if the server value changes (e.g. after a refresh elsewhere).
  React.useEffect(() => {
    setValue(note ?? "");
    setOpen((o) => o || !!note);
  }, [note]);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
  React.useEffect(() => {
    if (open) autosize();
  }, [open, value]);

  function commit() {
    const next = value.trim();
    if (next === (note ?? "").trim()) {
      if (!next) setOpen(false);
      return;
    }
    setDayNote(dayDate, next)
      .then(() => router.refresh())
      .catch((e) => {
        toast.error("Notitie opslaan mislukt.");
        console.error(e);
      });
    if (!next) setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => taRef.current?.focus());
        }}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <StickyNote className="size-3.5" /> Notitie
      </button>
    );
  }

  return (
    <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2.5 py-1.5 dark:border-amber-900/50 dark:bg-amber-950/20">
      <StickyNote className="mt-1.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          autosize();
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
        }}
        rows={1}
        placeholder="bv. Gebruik worsten uit de diepvries"
        className={cn(
          "min-h-0 flex-1 resize-none bg-transparent py-1 text-sm leading-snug outline-none placeholder:text-muted-foreground/70",
        )}
      />
      <button
        type="button"
        aria-label="Notitie wissen"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setValue("");
          setDayNote(dayDate, "")
            .then(() => router.refresh())
            .catch(() => toast.error("Notitie wissen mislukt."));
          setOpen(false);
        }}
        className="mt-1 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
