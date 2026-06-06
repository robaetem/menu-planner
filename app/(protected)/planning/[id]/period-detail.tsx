"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  MoreVertical,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  CalendarPlus,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatRange, weekdayName } from "@/lib/date";
import type { Diner, PeriodWithDays, RecipeWithIngredients, ShoppingCheck, ShoppingExtra } from "@/lib/types";
import { DayCard } from "./day-card";
import { ShoppingList } from "./shopping-list";
import { addDay, archivePeriod, deletePeriod, duplicatePeriod, updatePeriod } from "../actions";

export function PeriodDetail({
  period,
  recipes,
  diners,
  extras,
  checks,
}: {
  period: PeriodWithDays;
  recipes: RecipeWithIngredients[];
  diners: Diner[];
  defaultPeople: number;
  extras: ShoppingExtra[];
  checks: ShoppingCheck[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(period.title ?? "");

  const title = period.title?.trim() || formatRange(period.start_date, period.days.length);
  const mealCount = period.days.reduce((n, d) => n + d.meals.length, 0);

  function run(fn: () => Promise<void>, after?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        after?.();
      } catch (e) {
        toast.error("Actie mislukt.");
        console.error(e);
      }
    });
  }

  async function onRename() {
    await updatePeriod(period.id, { title: renameValue.trim() || null });
    toast.success("Naam opgeslagen");
    setRenameOpen(false);
    router.refresh();
  }

  async function onDuplicate() {
    try {
      const id = await duplicatePeriod(period.id);
      toast.success("Periode gedupliceerd");
      router.push(`/planning/${id}`);
    } catch (e) {
      toast.error("Dupliceren mislukt.");
      console.error(e);
    }
  }

  async function onArchiveToggle() {
    if (period.is_archived) {
      run(() => updatePeriod(period.id, { is_archived: false }), () => toast.success("Periode heractiveerd"));
    } else {
      run(() => archivePeriod(period.id), () => toast.success("Periode afgerond"));
    }
  }

  async function onDelete() {
    try {
      await deletePeriod(period.id);
      toast.success("Periode verwijderd");
      router.push("/planning");
    } catch (e) {
      toast.error("Verwijderen mislukt.");
      console.error(e);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <Link
          href="/planning"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Planning
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
              {title}
              {period.is_archived && <Badge variant="secondary">afgerond</Badge>}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {weekdayName(period.start_date)} · {period.days.length} {period.days.length === 1 ? "dag" : "dagen"} ·{" "}
              {mealCount} {mealCount === 1 ? "maaltijd" : "maaltijden"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Periode-acties" />}>
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setRenameValue(period.title ?? ""); setRenameOpen(true); }}>
                <Pencil className="size-4" /> Hernoemen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="size-4" /> Dupliceren
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchiveToggle}>
                {period.is_archived ? (
                  <>
                    <ArchiveRestore className="size-4" /> Heractiveren
                  </>
                ) : (
                  <>
                    <Archive className="size-4" /> Afronden
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" /> Verwijderen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="menu">
        <TabsList className="mb-4">
          <TabsTrigger value="menu">
            <UtensilsCrossed className="size-4" /> Menu
          </TabsTrigger>
          <TabsTrigger value="shopping">
            <ShoppingCart className="size-4" /> Boodschappen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="menu">
          {period.days.length === 0 ? (
            <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              Nog geen dagen. Voeg een dag toe om te beginnen.
            </p>
          ) : (
            <div className="space-y-3">
              {period.days.map((day) => (
                <DayCard key={day.id} periodId={period.id} day={day} recipes={recipes} diners={diners} />
              ))}
            </div>
          )}
          <Button
            variant="outline"
            className="mt-3 w-full border-dashed"
            onClick={() => run(() => addDay(period.id))}
          >
            <CalendarPlus className="size-4" /> Dag toevoegen
          </Button>
        </TabsContent>

        <TabsContent value="shopping">
          <ShoppingList
            periodId={period.id}
            days={period.days}
            recipes={recipes}
            extras={extras}
            checks={checks}
          />
        </TabsContent>
      </Tabs>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Periode hernoemen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="rename">Titel</Label>
            <Input
              id="rename"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={formatRange(period.start_date, period.days.length)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && onRename()}
            />
            <p className="text-xs text-muted-foreground">Laat leeg om de datum te tonen.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={onRename}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete alert */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Periode verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              “{title}” en alle dagen, maaltijden en de boodschappenlijst worden verwijderd. Dit kan niet ongedaan
              gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
