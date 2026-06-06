// Parse a freeform meal line the way it's typed in the Notion planner.
//   "Robin maakt: Wortelpuree met hamburgers + 2 potjes"
//      -> cook="Robin", freezer_servings=2, title="Wortelpuree met hamburgers"
//   "Quiche lorrain met bloemkool + 2 potjes" -> freezer_servings=2
//   "Amber potje" / "Amber en Robin Potje" -> freezer_servings=0 (a from-freezer
//      day; that is a separate toggle, never inferred from text to avoid surprises)

export type ParsedMeal = {
  cook: string | null;
  freezer_servings: number;
  title: string;
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function parseMealLine(raw: string): ParsedMeal {
  let text = (raw || "").trim();
  let cook: string | null = null;
  let freezer_servings = 0;

  const cookM = text.match(/^\s*(robin|amber)\s+maakt\s*:\s*/i);
  if (cookM) {
    cook = cap(cookM[1]);
    text = text.slice(cookM[0].length);
  }

  // "+N potjes" / "N potjes" (cook extra to freeze); sum if several.
  text = text.replace(/\+?\s*(\d+)\s*potjes?\b/gi, (_full, n: string) => {
    freezer_servings += parseInt(n, 10) || 0;
    return " ";
  });

  text = text.replace(/\s*\+\s*$/, "").replace(/\s+/g, " ").trim();
  return { cook, freezer_servings, title: text };
}
