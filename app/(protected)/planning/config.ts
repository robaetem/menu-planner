import type { Assignee, TemplateVleesje } from "@/lib/types";

// The Amber/Robin day "modes" are now user-managed (the `plan_modes` table,
// edited via the mode-manager dialog). DEFAULT_MODE is the label shown when no
// mode is set ("Thuis").
export const DEFAULT_MODE = "thuis";

export function assigneeLabel(a: Assignee): string {
  return a === "both" ? "Samen" : a === "amber" ? "Amber" : "Robin";
}

export const VLEESJE_TOKEN = /\[vleesje\]/gi;

/** True when a title declares a vleesje slot by writing "[vleesje]". */
export function hasVleesjeToken(title: string | null | undefined): boolean {
  return !!title && /\[vleesje\]/i.test(title);
}

/** A meal needs a vleesje when its recipe is flagged OR its title has the token —
 *  so writing "[vleesje]" in a recipe name is enough, no toggle required. */
export function isVleesjeTemplate(recipe: { has_vleesje?: boolean; title?: string } | null | undefined): boolean {
  return !!recipe && (!!recipe.has_vleesje || hasVleesjeToken(recipe.title));
}

/** "2 hamburger + 1 worst" from the chosen template vleesjes. */
export function vleesjeSummary(vleesjes: TemplateVleesje[] | null | undefined): string {
  return (vleesjes || []).map((v) => `${v.count} ${v.name}`).join(" + ");
}

/** Resolve a template recipe's display title for plain-text contexts: substitute
 *  "[vleesje]" with the chosen vleesjes; when nothing is chosen yet, drop the
 *  token (and a dangling "met") so "[vleesje]" never shows as literal text. */
export function resolveTitle(baseTitle: string, vleesjes: TemplateVleesje[] | null | undefined): string {
  const summary = vleesjeSummary(vleesjes);
  if (summary) {
    if (hasVleesjeToken(baseTitle)) return baseTitle.replace(VLEESJE_TOKEN, summary);
    return `${baseTitle} met ${summary}`;
  }
  return baseTitle
    .replace(/\s*met\s*\[vleesje\]/i, "")
    .replace(VLEESJE_TOKEN, "")
    .trim();
}
