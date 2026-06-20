"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DEFAULT_MODE } from "./config";
import { setMode } from "./actions";

export function ModePill({
  dayDate,
  who,
  label,
  value,
  options,
}: {
  dayDate: string;
  who: "amber" | "robin";
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = !!value;
  // Show the option's label for the stored value; fall back to the raw value
  // (e.g. a mode deleted after it was set) so the pill never goes blank.
  const display = value ? options.find((o) => o.value === value)?.label ?? value : DEFAULT_MODE;

  function pick(mode: string | null) {
    start(async () => {
      try {
        await setMode(dayDate, who, mode);
        router.refresh();
      } catch (e) {
        toast.error("Opslaan mislukt.");
        console.error(e);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
              pending && "opacity-60",
            )}
          />
        }
      >
        <span>
          {label}: {display}
        </span>
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        <DropdownMenuItem onClick={() => pick(null)}>Thuis</DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => pick(o.value)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
