"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Check, X, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { IngredientCategory, IngredientCategoryEntry } from "@/lib/types";
import {
  createCategory,
  deleteCategory,
  recomputeCategories,
  renameCategory,
  setIngredientCategory,
} from "./category-actions";

const OVERIG = "__overig__";

export function CategoryManagerDialog({
  open,
  onOpenChange,
  categories,
  mapEntries,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: IngredientCategory[];
  mapEntries: IngredientCategoryEntry[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  function run(fn: () => Promise<void>, failMsg = "Mislukt.") {
    setBusy(true);
    fn()
      .then(() => router.refresh())
      .catch((e) => {
        toast.error(failMsg);
        console.error(e);
      })
      .finally(() => setBusy(false));
  }

  function onAdd() {
    const l = draft.trim();
    if (!l) return;
    if (categories.some((c) => c.name.toLowerCase() === l.toLowerCase())) {
      toast.error("Die categorie bestaat al.");
      return;
    }
    setDraft("");
    run(() => createCategory(l), "Toevoegen mislukt.");
  }

  const sortedEntries = [...mapEntries].sort((a, b) => a.name.localeCompare(b.name, "nl"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle>Categorieën</DialogTitle>
          <DialogDescription>
            Maak je eigen winkelsecties. De AI verdeelt ingrediënten automatisch; corrigeer hieronder waar nodig.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <section>
            <h4 className="mb-2 text-sm font-semibold tracking-tight">Secties</h4>
            <div className="mb-3 flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAdd();
                  }
                }}
                placeholder="bv. Diepvries"
              />
              <Button onClick={onAdd} disabled={busy || !draft.trim()} className="shrink-0">
                <Plus className="size-4" /> Toevoegen
              </Button>
            </div>
            {categories.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">Nog geen categorieën.</p>
            ) : (
              <ul className="space-y-2">
                {categories.map((c) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    busy={busy}
                    onRename={(name) => run(() => renameCategory(c.id, name), "Hernoemen mislukt.")}
                    onDelete={() => run(() => deleteCategory(c.id), "Verwijderen mislukt.")}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold tracking-tight">Ingrediënten</h4>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || sortedEntries.length === 0}
                onClick={() => run(() => recomputeCategories(), "Herberekenen mislukt.")}
              >
                <Sparkles className="size-3.5" /> Herbereken
              </Button>
            </div>
            {sortedEntries.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">
                Nog geen ingrediënten ingedeeld. Maak een boodschappenlijstje aan in Planning — dan vult dit zich
                vanzelf.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {sortedEntries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm">
                      <span className="truncate capitalize">{e.name}</span>
                      {e.source === "user" && (
                        <span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                          jij
                        </span>
                      )}
                    </span>
                    <Select
                      value={e.category_id ?? OVERIG}
                      onValueChange={(v) =>
                        run(
                          () => setIngredientCategory(e.name, v === OVERIG ? null : String(v)),
                          "Wijzigen mislukt.",
                        )
                      }
                    >
                      <SelectTrigger size="sm" className="w-44 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={OVERIG}>Overig</SelectItem>
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({
  category,
  busy,
  onRename,
  onDelete,
}: {
  category: IngredientCategory;
  busy: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = React.useState(category.name);
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => setName(category.name), [category.name]);

  function commit() {
    const l = name.trim();
    if (!l) {
      setName(category.name);
      return;
    }
    if (l !== category.name) onRename(l);
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 border-transparent bg-transparent px-2 shadow-none focus-visible:border-input focus-visible:bg-background"
      />
      {/* Keep the toggle mounted across the confirm step (Base UI treats an
          unmounted clicked element as an outside-press and closes the dialog). */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          key="toggle"
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirming) {
              setConfirming(false);
              onDelete();
            } else {
              setConfirming(true);
            }
          }}
          className={cn(
            "shrink-0 rounded-md p-1.5 transition-colors",
            confirming ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:text-destructive",
          )}
          aria-label={confirming ? `Bevestig verwijderen ${category.name}` : `Verwijder ${category.name}`}
        >
          {confirming ? <Check className="size-4" /> : <Trash2 className="size-4" />}
        </button>
        {confirming && (
          <button
            key="cancel"
            type="button"
            onClick={() => setConfirming(false)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Annuleren"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}
