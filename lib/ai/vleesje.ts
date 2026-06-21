import { chatJson } from "./openrouter";

/** Touchpoint (a): does this recipe revolve around a piece of meat that could be
 *  swapped out (worst, hamburger, kipfilet, …)? Used to offer "make a [vleesje]
 *  template" when saving a recipe. */
export async function suggestVleesjeTemplate(
  title: string,
  ingredients: string[],
): Promise<{ isVleesje: boolean; reason: string }> {
  const parsed = await chatJson<{ isVleesje?: boolean; reason?: string }>(
    [
      {
        role: "system",
        content:
          "Je beoordeelt Nederlandse recepten. Bevat dit recept een stuk vlees dat je makkelijk kan vervangen " +
          "door een ander vleesje (bv. worst, hamburger, kipfilet, gehakt, spek)? Zo ja, dan is het een goede " +
          'kandidaat voor een "[vleesje]"-template. Antwoord ALLEEN met JSON: ' +
          '{"isVleesje": boolean, "reason": "korte uitleg in het Nederlands"}.',
      },
      { role: "user", content: JSON.stringify({ titel: title, ingrediënten: ingredients }) },
    ],
    { maxTokens: 200 },
  );
  return { isVleesje: !!parsed?.isVleesje, reason: parsed?.reason ?? "" };
}

/** Touchpoint (b)+(c): turn freeform "te kopen" text ("2 hamburgers en een
 *  worst") into structured { name, count } lines, snapping each name onto an
 *  existing vleesje name when it's clearly the same thing. Falls back to a naive
 *  split if the model is unavailable. */
export async function parseVleesjes(
  text: string,
  knownNames: string[],
): Promise<{ name: string; count: number }[]> {
  const t = text.trim();
  if (!t) return [];

  const parsed = await chatJson<{ items?: { name?: string; count?: number }[] }>(
    [
      {
        role: "system",
        content:
          "Je zet een vrije Nederlandse omschrijving van te kopen vlees om naar een nette lijst. " +
          "Geef ALLEEN JSON terug: {\"items\":[{\"name\":\"enkelvoud, kleine letters\",\"count\":geheel getal}]}. " +
          "Gebruik enkelvoud (1 hamburger, niet hamburgers). Als een naam duidelijk overeenkomt met een bekende " +
          "naam uit de lijst, gebruik dan exact die bekende naam. Standaard count = 1.",
      },
      { role: "user", content: JSON.stringify({ tekst: t, bekende_namen: knownNames }) },
    ],
    { maxTokens: 400 },
  );

  const items = parsed?.items;
  if (Array.isArray(items) && items.length) {
    return items
      .map((it) => ({ name: String(it?.name ?? "").trim(), count: Math.max(1, Math.floor(Number(it?.count) || 1)) }))
      .filter((it) => it.name);
  }
  // Fallback: split on commas / "en", strip a leading count.
  return t
    .split(/,|\ben\b|\+/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(\d+)\s*x?\s*(.+)$/i);
      return m ? { name: m[2].trim(), count: Math.max(1, parseInt(m[1], 10)) } : { name: p, count: 1 };
    });
}
