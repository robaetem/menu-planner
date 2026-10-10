// "Te kopen" vleesjes go straight onto the boodschappenlijstje when a meal is
// saved, without regenerating the whole list. This module parses what was typed
// ("4 worsten") and patches the generated ("Uit je planning") document and its
// origin index: a meal's old buy lines come off, its new ones go on.
//
// Kept dependency-free (no db) so it can be tested on its own.

import { mergeOriginLines, normalizeLineText, originLineFor, type ShoppingOrigin, type ShoppingOriginIndex } from "./origins";

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };

/** Turn typed text into one buy line: "4 worsten" or "4x worsten" -> 4 × "worsten";
 *  without a leading number it is 1. Null for empty text. */
export function parseBuyText(text: string): { name: string; count: number } | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const m = t.match(/^(\d+)\s*(?:x\s+|x(?=\D)|\s)(.+)$/i);
  if (m) {
    const count = parseInt(m[1], 10);
    const name = m[2].trim();
    if (count > 0 && name) return { name, count };
  }
  return { name: t, count: 1 };
}

/** The line a buy vleesje gets on the list. Same text as the generate action. */
export function buyLineLabel(name: string, count: number): string {
  return `${count} ${name}`;
}

export type BuyLineChange = {
  /** Lines this meal put on the list before (removed when still unchecked). */
  remove: { label: string; meal: string; date: string }[];
  /** Lines to add now, each under its category heading. */
  add: { label: string; name: string; count: number; category: string; origin: ShoppingOrigin }[];
};

function nodeText(n: Node): string {
  if (typeof n.text === "string") return n.text;
  return (n.content || []).map(nodeText).join("");
}

function isHeading(n: Node, level: number): boolean {
  return n.type === "heading" && Number(n.attrs?.level) === level;
}

function taskItem(s: string): Node {
  return {
    type: "taskItem",
    attrs: { checked: false },
    content: [{ type: "paragraph", content: [{ type: "text", text: s }] }],
  };
}

/** Remove the first unchecked list item reading `label`. A heading whose list
 *  ends up empty goes too. */
function removeLine(content: Node[], label: string): void {
  const want = normalizeLineText(label);
  for (let i = 0; i < content.length; i++) {
    const list = content[i];
    if (list.type !== "taskList") continue;
    const items = list.content || [];
    const at = items.findIndex((it) => !it.attrs?.checked && normalizeLineText(nodeText(it)) === want);
    if (at < 0) continue;
    items.splice(at, 1);
    if (items.length === 0) {
      const headed = i > 0 && isHeading(content[i - 1], 2);
      content.splice(headed ? i - 1 : i, headed ? 2 : 1);
    }
    return;
  }
}

/** Append `label` under the `category` heading, creating it at the end. */
function addLine(content: Node[], category: string, label: string): void {
  const key = category.trim().toLowerCase();
  const h = content.findIndex((n) => isHeading(n, 2) && nodeText(n).trim().toLowerCase() === key);
  if (h < 0) {
    content.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: category }] });
    content.push({ type: "taskList", content: [taskItem(label)] });
    return;
  }
  const next = content[h + 1];
  if (next?.type === "taskList") {
    next.content = [...(next.content || []), taskItem(label)];
  } else {
    content.splice(h + 1, 0, { type: "taskList", content: [taskItem(label)] });
  }
}

/** Apply a meal's buy-line change to the generated document and its origins.
 *  Returns new values; the inputs are not touched. */
export function applyBuyLines(
  doc: unknown,
  origins: ShoppingOriginIndex | null,
  change: BuyLineChange,
  title = "Uit je planning",
): { doc: Node; origins: ShoppingOriginIndex } {
  const base = doc && typeof doc === "object" && Array.isArray((doc as Node).content)
    ? (structuredClone(doc) as Node)
    : { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] }] };
  const content = base.content!;
  let lines = [...(origins?.lines ?? [])];

  for (const r of change.remove) {
    removeLine(content, r.label);
    const want = normalizeLineText(r.label);
    lines = lines
      .map((l) =>
        normalizeLineText(l.label) === want ? { ...l, origins: l.origins.filter((o) => !(o.meal === r.meal && o.date === r.date)) } : l,
      )
      .filter((l) => l.origins.length > 0);
  }

  if (change.add.length) {
    // An empty generated list holds a blank paragraph under its title.
    for (let i = content.length - 1; i >= 0; i--) {
      if (content[i].type === "paragraph" && !nodeText(content[i]).trim()) content.splice(i, 1);
    }
  }
  for (const a of change.add) {
    addLine(content, a.category, a.label);
    lines.push(originLineFor(a.label, a.name, String(a.count), [a.origin]));
  }

  if (!content.some((n) => n.type !== "heading" || !isHeading(n, 1))) {
    content.push({ type: "paragraph", content: [] });
  }
  return { doc: base, origins: { version: 1, lines: mergeOriginLines(lines) } };
}
