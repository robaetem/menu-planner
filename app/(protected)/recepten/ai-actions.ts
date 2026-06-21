"use server";

import { suggestVleesjeTemplate } from "@/lib/ai/vleesje";

/** Ask the model whether a recipe is a good "[vleesje]" template candidate. */
export async function suggestVleesje(
  title: string,
  ingredients: string[],
): Promise<{ isVleesje: boolean; reason: string }> {
  if (!title.trim()) return { isVleesje: false, reason: "" };
  return suggestVleesjeTemplate(title.trim(), ingredients.filter(Boolean));
}
