"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Snowflake, ChefHat } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Assignee } from "@/lib/types";
import { addPotje } from "./actions";
import { assigneeLabel } from "./config";

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

  function potje() {
    start(async () => {
      try {
        await addPotje(dayDate, who);
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
      <DropdownMenuContent align="center" className="min-w-44">
        <DropdownMenuItem onClick={potje}>
          <Snowflake className="size-4 text-sky-500" /> Potje diepvries
        </DropdownMenuItem>
        <DropdownMenuItem onClick={gerecht}>
          <ChefHat className="size-4 text-amber-600" /> Gerecht
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
