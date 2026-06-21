"use server";

import { parseVleesjes } from "@/lib/ai/vleesje";

/** Parse freeform "te kopen" text into structured { name, count } vleesje lines,
 *  snapping to known names where possible. */
export async function parseBuyVleesjes(
  text: string,
  knownNames: string[],
): Promise<{ name: string; count: number }[]> {
  return parseVleesjes(text, knownNames);
}
