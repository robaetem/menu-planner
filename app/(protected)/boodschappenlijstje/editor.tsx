"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import "./editor.css";
import {
  Heading1,
  Heading2,
  Bold,
  List,
  ListOrdered,
  ListChecks,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toPlainJson } from "@/lib/shopping/plain-json";
import type { ShoppingOriginIndex, ShoppingOriginLine } from "@/lib/shopping/origins";
import { OriginInfo, ORIGIN_ATTR } from "./origin-info-extension";
import { OriginTooltip } from "./origin-tooltip";

export type DocJSON = Record<string, unknown>;

const EMPTY_DOC: DocJSON = { type: "doc", content: [{ type: "paragraph" }] };

/** Notion-style rich editor for the boodschappenlijstje: headings, checkboxes,
 *  ordered/unordered lists, with markdown shortcuts ("# ", "- ", "1. ", "[] ").
 *  Controlled by `content` (TipTap JSON); changes are debounced to `onChange`.
 *  Pass `origins` to show a (i) button per line explaining where it came from. */
export function ShoppingEditor({
  content,
  onChange,
  minHeightClassName = "min-h-[55vh]",
  origins = null,
}: {
  content: DocJSON | null;
  onChange: (doc: DocJSON) => void;
  minHeightClassName?: string;
  origins?: ShoppingOriginIndex | null;
}) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Typ je boodschappen… '#' voor een titel, '-' voor een lijst, '[] ' voor een vinkje",
      }),
      // Decorations are built once from the index handed in at mount, exactly
      // like `content` — a regenerated list arrives via a fresh navigation.
      OriginInfo.configure({ index: origins, label: "Waar komt dit vandaan?" }),
    ],
    content: content ?? EMPTY_DOC,
    editorProps: {
      attributes: {
        class: cn("tiptap max-w-none focus:outline-none px-1 py-2 text-sm", minHeightClassName),
      },
    },
    onUpdate({ editor }) {
      if (timer.current) clearTimeout(timer.current);
      // toPlainJson is REQUIRED: ProseMirror's `attrs` are null-prototype
      // objects that a Server Action silently drops, which used to lose every
      // checkbox tick and heading level on save.
      timer.current = setTimeout(() => onChange(toPlainJson(editor.getJSON()) as DocJSON), 600);
    },
  });

  // The editor is UNCONTROLLED after mount: it owns the document and autosaves.
  // We deliberately do NOT sync the `content` prop back in on every render — that
  // fought with live typing (a saved value echoing back reset the doc mid-edit).
  // Genuinely new content (after "Boodschappen bijwerken") arrives via a fresh
  // navigation, which remounts this component with the new initial content.

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const originHover = useOriginHover(origins);

  if (!editor) {
    return <div className={cn("rounded-xl border bg-card", minHeightClassName)} />;
  }

  return (
    <div className="rounded-xl border bg-card">
      <Toolbar editor={editor} />
      <div
        className="px-3 pb-4 pt-1 md:px-5"
        onPointerOver={originHover.onPointerOver}
        onPointerOut={originHover.onPointerOut}
        onFocus={originHover.onFocus}
        onBlur={originHover.onBlur}
        onClick={originHover.onClick}
      >
        <EditorContent editor={editor} />
      </div>
      <OriginTooltip line={originHover.line} anchor={originHover.anchor} open={originHover.open} />
    </div>
  );
}

type OriginHit = { el: HTMLElement; line: ShoppingOriginLine };

/** Track which (i) button the pointer or keyboard focus is on. Hovering shows
 *  the tooltip; clicking pins it open, which is the only way to read it on a
 *  touch screen. A pinned tooltip wins over hover until it is dismissed. */
function useOriginHover(origins: ShoppingOriginIndex | null) {
  const [hovered, setHovered] = React.useState<OriginHit | null>(null);
  const [pinned, setPinned] = React.useState<OriginHit | null>(null);

  const resolve = React.useCallback(
    (target: EventTarget | null): OriginHit | null => {
      if (!origins || !(target instanceof Element)) return null;
      const el = target.closest(`[${ORIGIN_ATTR}]`);
      if (!(el instanceof HTMLElement)) return null;
      const at = Number(el.getAttribute(ORIGIN_ATTR));
      const line = Number.isInteger(at) ? origins.lines[at] : null;
      return line ? { el, line } : null;
    },
    [origins],
  );

  // Dismiss a pinned tooltip with Escape or a click anywhere else.
  React.useEffect(() => {
    if (!pinned) return;
    const dismiss = () => setPinned(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    const onDocClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(`[${ORIGIN_ATTR}]`)) return;
      dismiss();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick);
    };
  }, [pinned]);

  const active = pinned ?? hovered;

  return {
    anchor: active?.el ?? null,
    line: active?.line ?? null,
    open: !!active,
    onPointerOver: (e: React.PointerEvent) => {
      const hit = resolve(e.target);
      if (hit) setHovered(hit);
    },
    onPointerOut: (e: React.PointerEvent) => {
      if (resolve(e.target)) setHovered(null);
    },
    onFocus: (e: React.FocusEvent) => {
      const hit = resolve(e.target);
      if (hit) setHovered(hit);
    },
    onBlur: (e: React.FocusEvent) => {
      if (resolve(e.target)) setHovered(null);
    },
    onClick: (e: React.MouseEvent) => {
      const hit = resolve(e.target);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      setPinned((prev) => (prev?.el === hit.el ? null : hit));
    },
  };
}

function Toolbar({ editor }: { editor: Editor }) {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const update = () => force();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
      <Btn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Titel">
        <Heading1 className="size-4" />
      </Btn>
      <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Subtitel">
        <Heading2 className="size-4" />
      </Btn>
      <Sep />
      <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Vet">
        <Bold className="size-4" />
      </Btn>
      <Sep />
      <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Lijst">
        <List className="size-4" />
      </Btn>
      <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Genummerd">
        <ListOrdered className="size-4" />
      </Btn>
      <Btn active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} label="Vinkjes">
        <ListChecks className="size-4" />
      </Btn>
      <Sep />
      <Btn onClick={() => editor.chain().focus().undo().run()} label="Ongedaan maken" disabled={!editor.can().undo()}>
        <Undo2 className="size-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} label="Opnieuw" disabled={!editor.can().redo()}>
        <Redo2 className="size-4" />
      </Btn>
    </div>
  );
}

function Btn({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}
