export type ShoppingSection = "manual" | "generated";

/** Build the narrow database patch for one shopping section. Keeping this
 * mapping in a pure helper makes the no-cross-section-write guarantee easy to
 * regression-test. */
export function shoppingDocPatch(
  section: ShoppingSection,
  content: unknown,
  updatedAt = new Date().toISOString(),
): { content?: unknown; generated_content?: unknown; updated_at: string } {
  if (section === "manual") return { content, updated_at: updatedAt };
  if (section === "generated") return { generated_content: content, updated_at: updatedAt };
  throw new Error("Onbekende boodschappenlijst-sectie.");
}
