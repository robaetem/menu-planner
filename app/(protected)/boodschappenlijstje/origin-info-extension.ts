"use client";

// Puts a small (i) button at the end of every shopping line we know the origin
// of. The button is a ProseMirror *widget decoration*, so it lives outside the
// document: it never ends up in the saved JSON and cannot be typed into.
//
// Hovering/clicking it is handled by the editor component, which reads the
// `data-origin-line` index off the button and renders one shared tooltip.

// `@tiptap/core` is a transitive dependency; re-exported by @tiptap/react.
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { matchOriginLine, type ShoppingOriginIndex } from "@/lib/shopping/origins";

export const ORIGIN_ATTR = "data-origin-line";

export type OriginInfoOptions = {
  /** Provenance recorded when the list was generated; null disables the icons. */
  index: ShoppingOriginIndex | null;
  /** Accessible label for the button. */
  label: string;
};

const originInfoKey = new PluginKey("originInfo");

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

function button(lineIndex: number, label: string): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "origin-info";
  el.setAttribute(ORIGIN_ATTR, String(lineIndex));
  el.setAttribute("aria-label", label);
  el.contentEditable = "false";
  el.tabIndex = 0;
  el.innerHTML = ICON;
  return el;
}

export const OriginInfo = Extension.create<OriginInfoOptions>({
  name: "originInfo",

  addOptions() {
    return { index: null, label: "Waar komt dit vandaan?" };
  },

  addProseMirrorPlugins() {
    const { index, label } = this.options;
    if (!index?.lines?.length) return [];

    // Map each known line back to its position in the index, so the button only
    // has to carry a number.
    const positionOf = new Map(index.lines.map((line, i) => [line, i]));

    return [
      new Plugin({
        key: originInfoKey,
        props: {
          decorations(state) {
            const found: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "paragraph") return true;
              const text = node.textContent;
              if (!text.trim()) return false;
              const line = matchOriginLine(text, index);
              if (!line) return false;
              const lineIndex = positionOf.get(line);
              if (lineIndex == null) return false;
              // End of the paragraph's inline content.
              const at = pos + node.nodeSize - 1;
              found.push(
                Decoration.widget(at, () => button(lineIndex, label), {
                  side: 1,
                  ignoreSelection: true,
                  stopEvent: () => true,
                  key: `origin-${lineIndex}-${at}`,
                }),
              );
              return false;
            });
            return DecorationSet.create(state.doc, found);
          },
        },
      }),
    ];
  },
});
