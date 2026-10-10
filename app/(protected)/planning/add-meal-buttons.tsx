"use client";

import { useRouter } from "next/navigation";
import { Fragment, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Snowflake, ChefHat } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Assignee } from "@/lib/types";
import { formatDayShort } from "@/lib/date";
import { blockedPotjes, potjeChoices, type BlockedPotje, type PotjeChoice } from "@/lib/freezer/potjes";
import { planPotje } from "./actions";
import { assigneeLabel } from "./config";
import { useFreezer } from "./freezer-context";
import { PersonBadge } from "@/components/person-badge";

export function AddMealButton({
  dayDate,
  who,
  full,
}: {
  dayDate: string;
  who: Assignee;
  full?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { portions, today } = useFreezer();
  // Everything cooked BEFORE this day and not planned elsewhere — including
  // potjes that are only going to be made later this week.
  const choices = potjeChoices(portions, dayDate, who, today);
  const inFreezer = choices.filter((c) => c.inFreezer > 0);
  const upcoming = choices.filter((c) => c.inFreezer === 0);
  // Never let a potje silently vanish: what can't be picked for this day is
  // listed struck through, with why.
  const blocked = blockedPotjes(portions, dayDate, who, today);

  function pickPotje(c: PotjeChoice) {
    start(async () => {
      try {
        await planPotje(dayDate, who, c.name);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Toevoegen mislukt.");
        console.error(e);
      }
    });
  }

  const item = (c: PotjeChoice) => (
    <DropdownMenuItem key={c.name} onClick={() => pickPotje(c)} className="items-start">
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2">{c.name}</span>
        {c.nextReadyOn && (
          <span className="block text-xs text-muted-foreground">
            {c.inFreezer > 0 ? `+${c.count - c.inFreezer} ` : ""}klaar vanaf {formatDayShort(c.nextReadyOn)}
          </span>
        )}
      </span>
      <span className="pl-3 text-xs text-muted-foreground tabular-nums">{c.count}</span>
    </DropdownMenuItem>
  );

  function gerecht() {
    router.push(`/recepten?assignDate=${dayDate}&who=${who}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border border-dashed bg-card/40 text-sm font-medium transition-colors",
              who === "both"
                ? "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
                : who === "robin"
                  ? "border-robin/35 text-robin-ink hover:border-robin/60 hover:bg-robin-soft"
                  : "border-amber/35 text-amber-ink hover:border-amber/60 hover:bg-amber-soft",
              full ? "w-full py-3.5" : "h-full min-h-[4.25rem] w-full",
              pending && "opacity-60",
            )}
          />
        }
      >
        <Plus className="size-4" /> {assigneeLabel(who)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Snowflake className="size-4 text-sky-500" /> Potje diepvries
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 max-w-[calc(100vw-2rem)]">
            {choices.length === 0 && <DropdownMenuItem disabled>Geen potjes beschikbaar op deze dag</DropdownMenuItem>}
            {choices.length > 0 && (
              <>
                {inFreezer.length > 0 && (
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>In de diepvries</DropdownMenuLabel>
                    {inFreezer.map(item)}
                  </DropdownMenuGroup>
                )}
                {inFreezer.length > 0 && upcoming.length > 0 && <DropdownMenuSeparator />}
                {upcoming.length > 0 && (
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Wordt nog gemaakt</DropdownMenuLabel>
                    {upcoming.map(item)}
                  </DropdownMenuGroup>
                )}
              </>
            )}
            {[
              { label: "Al ingepland", list: blocked.filter((b) => b.reason.kind === "planned") },
              { label: "Niet beschikbaar op deze dag", list: blocked.filter((b) => b.reason.kind !== "planned") },
            ].map(
              ({ label, list }) =>
                list.length > 0 && (
                  <Fragment key={label}>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{label}</DropdownMenuLabel>
                      {groupBlocked(list).map((g) => (
                        <BlockedItem key={g.name} group={g} />
                      ))}
                    </DropdownMenuGroup>
                  </Fragment>
                ),
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={gerecht}>
          <ChefHat className="size-4 text-amber-600" /> Gerecht
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function blockedReason(b: BlockedPotje): string {
  if (b.reason.kind === "planned") return `ingepland op ${formatDayShort(b.reason.on)}`;
  if (b.reason.kind === "later") return `pas klaar vanaf ${formatDayShort(b.reason.readyOn)}`;
  return "geen portie";
}

type BlockedGroup = {
  name: string;
  /** One row per reason; Robin and Amber share a row when it is the same. */
  rows: { text: string; whos: { who: BlockedPotje["who"]; count: number }[] }[];
};

function groupBlocked(list: BlockedPotje[]): BlockedGroup[] {
  const groups = new Map<string, BlockedGroup>();
  for (const b of list) {
    const key = b.name.trim().toLowerCase();
    const g = groups.get(key) ?? { name: b.name, rows: [] };
    const text = blockedReason(b);
    const row = g.rows.find((r) => r.text === text) ?? g.rows[g.rows.push({ text, whos: [] }) - 1];
    row.whos.push({ who: b.who, count: b.count });
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    for (const r of g.rows) r.whos.sort((a, b) => (a.who === b.who ? 0 : a.who === "amber" ? -1 : 1));
  }
  return [...groups.values()];
}

/** A potje that exists but can't be planned on this day, struck through, with
 *  who it is blocked for and why. */
function BlockedItem({ group }: { group: BlockedGroup }) {
  return (
    <div
      role="menuitem"
      aria-disabled="true"
      className="rounded-md px-1.5 py-1 text-sm text-muted-foreground"
    >
      <span className="block line-clamp-2 line-through decoration-muted-foreground/60">{group.name}</span>
      {group.rows.map((r) => (
        <span key={r.text} className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {r.whos.map((w) => (
            <PersonBadge key={w.who} who={w.who} className="px-1.5 py-px">
              {w.who === "robin" ? "Robin" : "Amber"}
              {w.count > 1 && <span className="ml-1 tabular-nums opacity-70">{w.count}×</span>}
            </PersonBadge>
          ))}
          <span>{r.text}</span>
        </span>
      ))}
    </div>
  );
}
