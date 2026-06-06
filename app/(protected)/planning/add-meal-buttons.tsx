"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Snowflake, ChefHat } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Assignee, Potje } from "@/lib/types";
import { addPotjeFromInventory } from "./actions";
import { assigneeLabel } from "./config";

function availableCount(p: Potje, who: Assignee): number {
  if (who === "amber") return p.amber_count;
  if (who === "robin") return p.robin_count;
  return Math.min(p.robin_count, p.amber_count);
}

export function AddMealButton({
  dayDate,
  who,
  full,
  potjes,
}: {
  dayDate: string;
  who: Assignee;
  full?: boolean;
  potjes: Potje[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const available = potjes.filter((p) => availableCount(p, who) > 0);

  function pickPotje(p: Potje) {
    start(async () => {
      try {
        await addPotjeFromInventory(dayDate, who, p.id);
        router.refresh();
      } catch (e) {
        toast.error("Toevoegen mislukt.");
        console.error(e);
      }
    });
  }

  function gerecht() {
    router.push(`/recepten?assignDate=${dayDate}&who=${who}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-card/40 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground",
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
          <DropdownMenuSubContent className="min-w-52">
            {available.length === 0 ? (
              <DropdownMenuItem disabled>Geen potjes beschikbaar</DropdownMenuItem>
            ) : (
              available.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => pickPotje(p)}>
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                    {availableCount(p, who)}
                  </span>
                </DropdownMenuItem>
              ))
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
