"use client";

import Image from "next/image";
import { MoreVertical, Pencil, Trash2, Beef } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRecipeImageUrl } from "@/lib/recipes/images";
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
  const imageUrl = getRecipeImageUrl(recipe.image_path);

  return (
    <Card
      onClick={onView}
      className="group relative cursor-pointer gap-0 overflow-hidden py-0 transition-all hover:border-primary/30 hover:shadow-md"
    >
      {imageUrl && (
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <Image
            src={imageUrl}
            alt={recipe.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            unoptimized
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      )}
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
      </CardHeader>

      <CardContent className="px-4 pt-1 pb-4">
        {recipe.tags.length > 0 || recipe.has_vleesje ? (
          <div className="flex flex-wrap gap-1.5">
            {recipe.has_vleesje && (
              <Badge className="gap-1 border-rose-300 bg-rose-100 font-normal text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                <Beef className="size-3" /> vleesje
              </Badge>
            )}
            {recipe.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-normal capitalize">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Geen tags</span>
        )}
      </CardContent>
    </Card>
  );
}
