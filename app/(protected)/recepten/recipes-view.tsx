"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus, BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { rankRecipes } from "@/lib/recipes/ranker";
import type { RecipeWithIngredients } from "@/lib/types";
import { RecipeCard } from "./recipe-card";
import { RecipeEditorDialog } from "./recipe-editor-dialog";
import { RecipeDetailDialog } from "./recipe-detail-dialog";
import { deleteRecipe } from "./actions";

const CHIPS = [
  { label: "Snel", token: "snel" },
  { label: "Verse groenten", token: "verse groenten" },
  { label: "Vriezer", token: "vriezer" },
  { label: "Oven", token: "oven" },
  { label: "Vega", token: "vegetarisch" },
];

export function RecipesView({ recipes }: { recipes: RecipeWithIngredients[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [chips, setChips] = React.useState<Set<string>>(new Set());

  const [editing, setEditing] = React.useState<RecipeWithIngredients | null | "new">(null);
  const [viewing, setViewing] = React.useState<RecipeWithIngredients | null>(null);
  const [deleting, setDeleting] = React.useState<RecipeWithIngredients | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);

  const effectiveQuery = React.useMemo(
    () => [query, ...chips].filter(Boolean).join(" "),
    [query, chips],
  );
  const results = React.useMemo(
    () => rankRecipes(recipes, effectiveQuery),
    [recipes, effectiveQuery],
  );

  const hasFilter = effectiveQuery.trim().length > 0;

  function toggleChip(token: string) {
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setChips(new Set());
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await deleteRecipe(deleting.id);
      toast.success("Recept verwijderd");
      setDeleting(null);
      setViewing(null);
      router.refresh();
    } catch (e) {
      toast.error("Verwijderen mislukt.");
      console.error(e);
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Recepten</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {recipes.length} {recipes.length === 1 ? "recept" : "recepten"} in jullie databank
          </p>
        </div>
        <Button onClick={() => setEditing("new")} className="shrink-0">
          <Plus className="size-4" /> Nieuw recept
        </Button>
      </div>

      {/* Search + chips */}
      <div className="mt-5 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek of beschrijf wat je wil eten… (bv. 'iets snel met verse groenten')"
            className="h-11 pl-9 pr-9 text-[0.95rem]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Wis zoekopdracht"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const active = chips.has(c.token);
            return (
              <button
                key={c.token}
                onClick={() => toggleChip(c.token)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            );
          })}
          {hasFilter && (
            <button
              onClick={clearFilters}
              className="rounded-full px-3 py-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              wissen
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      {recipes.length > 0 && (
        <p className="mt-5 text-sm text-muted-foreground">
          {hasFilter
            ? `${results.length} ${results.length === 1 ? "resultaat" : "resultaten"}`
            : `Alle recepten`}
        </p>
      )}

      {/* Grid / empty states */}
      {recipes.length === 0 ? (
        <EmptyState onCreate={() => setEditing("new")} />
      ) : results.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed py-14 text-center">
          <p className="text-sm text-muted-foreground">Geen recepten gevonden voor deze zoekopdracht.</p>
          <Button variant="outline" className="mt-4" onClick={clearFilters}>
            Toon alle recepten
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onView={() => setViewing(r)}
              onEdit={() => setEditing(r)}
              onDelete={() => setDeleting(r)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <RecipeEditorDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        recipe={editing === "new" ? null : editing}
      />
      <RecipeDetailDialog
        recipe={viewing}
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
        onEdit={() => {
          const r = viewing;
          setViewing(null);
          setEditing(r);
        }}
        onDelete={() => {
          setDeleting(viewing);
        }}
      />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recept verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” wordt definitief verwijderd. Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deletePending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deletePending ? "Verwijderen…" : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <BookOpen className="size-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Nog geen recepten</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Voeg jullie favoriete maaltijden toe. Daarna stelt de planning automatisch de boodschappenlijst samen.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <Plus className="size-4" /> Eerste recept toevoegen
      </Button>
    </div>
  );
}
