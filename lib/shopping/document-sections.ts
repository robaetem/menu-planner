export type ShoppingSection = "manual" | "generated";

export type ShoppingDocPatch = {
  content?: unknown;
  generated_content?: unknown;
  generated_origins?: unknown;
  updated_at: string;
};

/** Build the narrow database patch for one shopping section. Keeping this
 * mapping in a pure helper makes the no-cross-section-write guarantee easy to
 * regression-test.
 *
 * `origins` is only ever written together with a fresh generated document. An
 * autosave from the editor omits it, so hand-editing the generated list never
 * throws away the provenance recorded at generation time. */
export function shoppingDocPatch(
  section: ShoppingSection,
  content: unknown,
  updatedAt = new Date().toISOString(),
  origins?: unknown,
): ShoppingDocPatch {
  if (section === "manual") return { content, updated_at: updatedAt };
  if (section === "generated") {
    return origins === undefined
      ? { generated_content: content, updated_at: updatedAt }
      : { generated_content: content, generated_origins: origins, updated_at: updatedAt };
  }
  throw new Error("Onbekende boodschappenlijst-sectie.");
}
