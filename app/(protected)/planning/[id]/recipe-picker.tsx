"use client";

import * as React from "react";
import { Link2, Link2Off, Check, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { RecipeWithIngredients } from "@/lib/types";

export function RecipePicker({
  recipes,
  value,
  linkedTitle,
  onSelect,
  suggestQuery,
}: {
  recipes: RecipeWithIngredients[];
  value: string | null;
  linkedTitle: string | null;
  onSelect: (recipeId: string | null) => void;
  suggestQuery?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant={value ? "secondary" : "outline"}
            size="sm"
            className={cn("h-7 gap-1.5 rounded-full px-2.5 text-xs font-normal", !value && "border-dashed text-muted-foreground")}
          />
        }
      >
        {value ? <Link2 className="size-3.5 text-primary" /> : <ChefHat className="size-3.5" />}
        <span className="max-w-44 truncate">{value ? linkedTitle ?? "Recept gekoppeld" : "koppel recept"}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek een recept…" />
          <CommandList>
            <CommandEmpty>Geen recept gevonden.</CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__unlink__ ontkoppel recept"
                  onSelect={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <Link2Off className="size-4" /> Ontkoppel recept
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Recepten">
              {recipes.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${r.title} ${r.tags.join(" ")}`}
                  onSelect={() => {
                    onSelect(r.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === r.id ? "opacity-100 text-primary" : "opacity-0")} />
                  <span className="truncate">{r.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
