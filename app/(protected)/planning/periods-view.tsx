"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, differenceInCalendarDays, format } from "date-fns";
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

const MAX_PERIOD_DAYS = 92;

function NewPeriodDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [startDate, setStartDate] = React.useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = React.useState<Date | undefined>(addDays(new Date(), 5));
  const [title, setTitle] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [startOpen, setStartOpen] = React.useState(false);
  const [endOpen, setEndOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStartDate(new Date());
      setEndDate(addDays(new Date(), 5));
      setTitle("");
    }
  }, [open]);

  const dayCount = startDate && endDate ? differenceInCalendarDays(endDate, startDate) + 1 : 0;
  const tooLong = dayCount > MAX_PERIOD_DAYS;
  const validRange = !!startDate && !!endDate && dayCount >= 1 && !tooLong;

  function pickStart(d?: Date) {
    setStartDate(d);
    setStartOpen(false);
    // Keep the end on/after the start.
    if (d && endDate && endDate < d) setEndDate(d);
  }
  function pickEnd(d?: Date) {
    setEndDate(d);
    setEndOpen(false);
  }

  async function onCreate() {
    if (!validRange || !startDate) {
      toast.error("Kies een geldige start- en einddatum.");
      return;
    }
    setPending(true);
    try {
      const id = await createPeriod({
        start_date: format(startDate, "yyyy-MM-dd"),
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

  const dateButton = (value: Date | undefined) => (
    <Button variant="outline" className="w-full justify-start font-normal">
      <CalendarDays className="size-4" />
      {value ? format(value, "d MMM yyyy", { locale: nl }) : "Kies datum"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe periode</DialogTitle>
          <DialogDescription>
            Kies de start- en einddatum van je planning. Periodes mogen op elke dag starten en eindigen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Startdatum</Label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger render={dateButton(startDate)} />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={pickStart} autoFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Einddatum</Label>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger render={dateButton(endDate)} />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={pickEnd}
                    defaultMonth={endDate ?? startDate}
                    disabled={startDate ? { before: startDate } : undefined}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
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

          {validRange ? (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              Plant{" "}
              <span className="font-medium text-foreground">
                {formatRange(format(startDate!, "yyyy-MM-dd"), dayCount)}
              </span>
              {" · "}
              {dayCount} {dayCount === 1 ? "dag" : "dagen"}
            </p>
          ) : (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {tooLong
                ? `Een periode kan maximaal ${MAX_PERIOD_DAYS} dagen lang zijn.`
                : "De einddatum moet op of na de startdatum liggen."}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button onClick={onCreate} disabled={pending || !validRange}>
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
