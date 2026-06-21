// Build a TipTap JSON document for the boodschappenlijstje from category groups.
// Each non-empty category becomes an H2 heading followed by a task list (one
// unchecked checkbox per line). Kept dependency-free so it runs on the server.

export type ShoppingGroup = { category: string; lines: string[] };

type Node = Record<string, unknown>;

function text(s: string): Node {
  return { type: "text", text: s };
}
function heading(level: number, s: string): Node {
  return { type: "heading", attrs: { level }, content: [text(s)] };
}
function taskItem(s: string): Node {
  return {
    type: "taskItem",
    attrs: { checked: false },
    content: [{ type: "paragraph", content: s ? [text(s)] : [] }],
  };
}
function taskList(lines: string[]): Node {
  return { type: "taskList", content: lines.map(taskItem) };
}

export function buildShoppingDoc(groups: ShoppingGroup[], title = "Boodschappen"): Node {
  const content: Node[] = [heading(1, title)];
  const filled = groups.filter((g) => g.lines.length > 0);
  if (filled.length === 0) {
    content.push({ type: "paragraph", content: [] });
    return { type: "doc", content };
  }
  for (const g of filled) {
    content.push(heading(2, g.category));
    content.push(taskList(g.lines));
  }
  return { type: "doc", content };
}
