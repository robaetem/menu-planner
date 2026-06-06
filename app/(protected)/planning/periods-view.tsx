"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { Plus, CalendarDays, ChevronRight, CalendarPlus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatRange, weekdayName } from "@/lib/date";
import { createPeriod } from "./actions";
import type { Period } from "@/lib/types";

type PeriodRow = Period & { dayCount: number; mealCount: number };

export function PeriodsView({ periods }: { periods: PeriodRow[] }) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const active = periods.filter((p) => !p.is_archived);
  const archived = periods.filter((p) => p.is_archived);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Planning</h1>
          <p className="mt-1 text-sm text-muted-foreground">Jullie weekmenu's en boodschappenlijsten</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="size-4" /> Nieuwe periode
        </Button>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <EmptyState onCreate={() => setDialogOpen(true)} />
      ) : (
        <div className="mt-6 space-y-3">
          {active.map((p) => (
            <PeriodCard key={p.id} period={p} />
          ))}
          {active.length === 0 && (
            <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              Geen actieve periodes. Maak een nieuwe planning.
            </p>
          )}
        </div>
      )}

      {archived.length > 0 && (
        <Collapsible className="mt-8">
          <CollapsibleTrigger
            render={
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <Archive className="size-4" /> Afgelopen periodes ({archived.length})
              </Button>
            }
          />
          <CollapsibleContent className="mt-3 space-y-3">
            {archived.map((p) => (
              <PeriodCard key={p.id} period={p} archived />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <NewPeriodDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function PeriodCard({ period, archived = false }: { period: PeriodRow; archived?: boolean }) {
  const router = useRouter();
  const title = period.title?.trim() || formatRange(period.start_date, period.dayCount);
  return (
    <Card
      onClick={() => router.push(`/planning/${period.id}`)}
      className="group cursor-pointer flex-row items-center justify-between gap-3 px-4 py-3.5 transition-all hover:border-primary/30 hover:shadow-sm"
    >
      <div className="flex items-center gap-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <CalendarDays className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {weekdayName(period.start_date)} · {period.dayCount} {period.dayCount === 1 ? "dag" : "dagen"} ·{" "}
            {period.mealCount} {period.mealCount === 1 ? "maaltijd" : "maaltijden"}
            {archived && " · afgerond"}
          </p>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Card>
  );
}

function NewPeriodDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [date, setDate] = React.useState<Date | undefined>(new Date());
  const [days, setDays] = React.useState("6");
  const [title, setTitle] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [calOpen, setCalOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDate(new Date());
      setDays("6");
      setTitle("");
    }
  }, [open]);

  const dayCount = Math.max(1, Math.min(31, parseInt(days || "1", 10) || 1));

  async function onCreate() {
    if (!date) {
      toast.error("Kies een startdatum.");
      return;
    }
    setPending(true);
    try {
      const id = await createPeriod({
        start_date: format(date, "yyyy-MM-dd"),
        title: title.trim() || null,
        days: dayCount,
      });
      toast.success("Periode aangemaakt");
      onOpenChange(false);
      router.push(`/planning/${id}`);
    } catch (e) {
      toast.error("Aanmaken mislukt.");
      console.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe periode</DialogTitle>
          <DialogDescription>
            Kies een startdag en hoeveel dagen je wil plannen. Periodes mogen op elke dag starten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Startdatum</Label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger
                  render={
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarDays className="size-4" />
                      {date ? format(date, "d MMM yyyy", { locale: nl }) : "Kies datum"}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d);
                      setCalOpen(false);
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="np-days">Aantal dagen</Label>
              <Input
                id="np-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="np-title">Titel (optioneel)</Label>
            <Input
              id="np-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Laat leeg voor automatische datum"
            />
          </div>

          {date && (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              Plant <span className="font-medium text-foreground">{formatRange(format(date, "yyyy-MM-dd"), dayCount)}</span>
              {" · "}
              {dayCount} {dayCount === 1 ? "dag" : "dagen"}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button onClick={onCreate} disabled={pending}>
            <CalendarPlus className="size-4" />
            {pending ? "Aanmaken…" : "Periode aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <CalendarDays className="size-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Nog geen planning</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Maak een periode aan voor de komende dagen en vul per dag in wat jullie eten.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <Plus className="size-4" /> Eerste periode aanmaken
      </Button>
    </div>
  );
}
