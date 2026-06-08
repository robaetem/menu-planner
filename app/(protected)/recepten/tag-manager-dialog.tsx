"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Check, X, Tag as TagIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RecipeTag } from "@/lib/types";
import { createTag, deleteTag, updateTag } from "./tag-actions";

export function TagManagerDialog({
  open,
  onOpenChange,
  tags,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tags: RecipeTag[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);

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

  async function onAdd() {
    const l = draft.trim();
    if (!l) return;
    if (tags.some((t) => t.label.toLowerCase() === l.toLowerCase())) {
      toast.error("Die tag bestaat al.");
      return;
    }
    setDraft("");
    run(() => createTag(l), "Toevoegen mislukt.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle>Tags beheren</DialogTitle>
          <DialogDescription>
            Maak je eigen tags aan, hernoem of verwijder ze. Je kan recepten ermee labelen en erop filteren.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b px-6 py-4">
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd();
                }
              }}
              placeholder="bv. Bloemkool"
              autoFocus
            />
            <Button onClick={onAdd} disabled={busy || !draft.trim()} className="shrink-0">
              <Plus className="size-4" /> Toevoegen
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tags.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <TagIcon className="size-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Nog geen tags. Maak je eerste tag aan.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tags.map((t) => (
                <TagRow
                  key={t.id}
                  tag={t}
                  busy={busy}
                  onRename={(label) => run(() => updateTag(t.id, label), "Hernoemen mislukt.")}
                  onDelete={() => run(() => deleteTag(t.id), "Verwijderen mislukt.")}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TagRow({
  tag,
  busy,
  onRename,
  onDelete,
}: {
  tag: RecipeTag;
  busy: boolean;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = React.useState(tag.label);
  const [confirming, setConfirming] = React.useState(false);

  // Keep the local field in sync if the tag list refreshes from the server.
  React.useEffect(() => setLabel(tag.label), [tag.label]);

  function commit() {
    const l = label.trim();
    if (!l) {
      setLabel(tag.label);
      return;
    }
    if (l !== tag.label) onRename(l);
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 border-transparent bg-transparent px-2 shadow-none focus-visible:border-input focus-visible:bg-background"
      />
      {/* The toggle button stays mounted across the confirm step — unmounting the
          clicked element makes Base UI treat the trailing pointer event as an
          outside-press and dismiss the whole dialog. */}
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
            confirming
              ? "text-destructive hover:bg-destructive/10"
              : "text-muted-foreground hover:text-destructive",
          )}
          aria-label={confirming ? `Bevestig verwijderen ${tag.label}` : `Verwijder ${tag.label}`}
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
