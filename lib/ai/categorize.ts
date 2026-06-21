import { chatJson } from "./openrouter";

/** Assign each ingredient name to exactly one of the given category names using
 *  the model. Returns a map keyed by the ORIGINAL name. Names the model omits or
 *  mis-labels fall back to `fallback`. One batched call for the whole list. */
export async function categorizeNames(
  names: string[],
  categories: string[],
  fallback = "Overig",
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return result;
  for (const n of unique) result[n] = fallback;

  const allowed = categories.length ? categories : [fallback];
  const valid = new Set(allowed.map((c) => c.toLowerCase()));

  const parsed = await chatJson<Record<string, string>>(
    [
      {
        role: "system",
        content:
          "Je bent een assistent die Nederlandse boodschappen-ingrediënten in supermarktcategorieën indeelt. " +
          "Antwoord ALLEEN met een JSON-object dat elke ingrediëntnaam exact koppelt aan één categorie uit de toegestane lijst. " +
          "Gebruik exact de gegeven categorienamen. Twijfel je, kies dan de best passende; past niets, gebruik \"" +
          fallback +
          "\".",
      },
      {
        role: "user",
        content: JSON.stringify({ categorieën: allowed, ingrediënten: unique }),
      },
    ],
    { maxTokens: 1500 },
  );

  if (parsed && typeof parsed === "object") {
    // Match case-insensitively back onto the original names.
    const byLower = new Map(unique.map((n) => [n.toLowerCase(), n]));
    for (const [k, v] of Object.entries(parsed)) {
      const orig = byLower.get(String(k).trim().toLowerCase());
      if (!orig || typeof v !== "string") continue;
      const canon = allowed.find((c) => c.toLowerCase() === v.trim().toLowerCase());
      result[orig] = canon ?? (valid.has(v.trim().toLowerCase()) ? v.trim() : fallback);
    }
  }
  return result;
}
