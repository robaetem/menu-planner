"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Link2, Clock, Leaf, Snowflake, CornerDownLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseMealLine } from "@/lib/planning/meal-parser";
import type { RecipeWithIngredients } from "@/lib/types";
import { addMeal } from "../actions";

function fold(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchScore(r: RecipeWithIngredients, q: string): number {
  const t = fold(r.title);
  if (t.startsWith(q)) return 4;
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 3;
  if (t.includes(q)) return 2;
  if ((r.tags || []).some((tag) => fold(tag).includes(q))) return 1;
  return 0;
}

export function MealAutocomplete({
  periodId,
  dayId,
  recipes,
}: {
  periodId: string;
  dayId: string;
  recipes: RecipeWithIngredients[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [text, setText] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const blurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = React.useMemo(() => {
    const q = fold(text.trim());
    if (!q) return [];
    return recipes
      .map((r) => ({ r, s: matchScore(r, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.r.title.localeCompare(b.r.title, "nl"))
      .slice(0, 8)
      .map((x) => x.r);
  }, [text, recipes]);

  const showDropdown = open && matches.length > 0;

  function reset() {
    setText("");
    setActive(-1);
    setOpen(false);
  }

  function submit(recipe?: RecipeWithIngredients) {
    const t = text.trim();
    if (!recipe && !t) return;
    const freezer = parseMealLine(t).freezer_servings;
    const raw = recipe
      ? freezer > 0
        ? `${recipe.title} + ${freezer} ${freezer === 1 ? "potje" : "potjes"}`
        : recipe.title
      : t;
    reset();
    startTransition(async () => {
      try {
        await addMeal(periodId, dayId, raw, recipe ? recipe.id : null);
        router.refresh();
      } catch (e) {
        toast.error("Toevoegen mislukt.");
        console.error(e);
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showDropdown && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((p) => {
        const n = matches.length;
        if (e.key === "ArrowDown") return p + 1 >= n ? 0 : p + 1;
        return p - 1 < 0 ? n - 1 : p - 1;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showDropdown && active >= 0 && active < matches.length) submit(matches[active]);
      else submit();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => text.trim() && setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          placeholder="+ Maaltijd toevoegen of recept zoeken…"
          className="h-9 border-dashed bg-transparent text-sm"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => submit()}
          disabled={!text.trim()}
          aria-label="Maaltijd toevoegen"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-[calc(100%-2.75rem)] overflow-hidden rounded-lg border bg-popover shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {matches.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    submit(r);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                    i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Link2 className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate font-medium">{r.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {r.uses_fresh_veg && <Leaf className="size-3.5 text-primary" />}
                    {r.freezer_friendly && <Snowflake className="size-3.5 text-sky-500" />}
                    {r.prep_minutes != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="size-3" />
                        {r.prep_minutes}m
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {text.trim() && (
            <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
              <CornerDownLeft className="mr-1 inline size-3" />
              Enter voor vrije tekst “{text.trim()}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}
