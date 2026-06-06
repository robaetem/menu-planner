"use client";

import { Clock, Leaf, Snowflake, MoreVertical, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RecipeWithIngredients } from "@/lib/types";

export function RecipeCard({
  recipe,
  onView,
  onEdit,
  onDelete,
}: {
  recipe: RecipeWithIngredients;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ingredientCount = recipe.ingredients.length;

  return (
    <Card
      onClick={onView}
      className="group relative cursor-pointer gap-0 overflow-hidden py-0 transition-all hover:border-primary/30 hover:shadow-md"
    >
      <CardHeader className="gap-0 px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base leading-snug">{recipe.title}</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-1.5 -mt-1 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
                  aria-label="Meer acties"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4" /> Bewerken
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-4" /> Verwijderen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {recipe.prep_minutes != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {recipe.prep_minutes} min
            </span>
          )}
          {recipe.uses_fresh_veg && (
            <span className="inline-flex items-center gap-1 text-primary">
              <Leaf className="size-3.5" />
              verse groenten
            </span>
          )}
          {recipe.freezer_friendly && (
            <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
              <Snowflake className="size-3.5" />
              vriezer
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex grow flex-col px-4 pt-1 pb-4">
        {recipe.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {recipe.tags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="secondary" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UtensilsCrossed className="size-3.5" />
            {ingredientCount} {ingredientCount === 1 ? "ingrediënt" : "ingrediënten"}
          </span>
          <span>
            {recipe.cook_count > 0 ? `${recipe.cook_count}× gemaakt` : "nog niet gemaakt"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
