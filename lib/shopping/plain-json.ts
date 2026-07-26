// Make a TipTap/ProseMirror document safe to hand to a Server Action.
//
// prosemirror-model builds every node's `attrs` with `Object.create(null)`
// (see `computeAttrs`), and `node.toJSON()` hands that same null-prototype
// object straight through. React's Server Action argument serializer cannot
// send a null-prototype object — it substitutes an opaque placeholder — so the
// server used to receive `attrs: undefined` for EVERY node. Text survived
// (plain strings and arrays), which is why typing appeared to save while
// checkbox state (`taskItem.checked`) and heading levels (`heading.level`)
// were silently dropped on every autosave.
//
// Rebuilding the tree out of plain object literals fixes all of them at once.

/** Deep-copy a value into plain arrays/objects with normal prototypes. */
export function toPlainJson<T>(value: T): T {
  return copy(value) as T;
}

function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const v = copy((value as Record<string, unknown>)[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** True when every object in the tree has a normal prototype, i.e. the value
 *  will survive a Server Action round trip. Used by the regression test. */
export function isPlainJson(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(isPlainJson);
  if (value === null || typeof value !== "object") return true;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).every(isPlainJson);
}
