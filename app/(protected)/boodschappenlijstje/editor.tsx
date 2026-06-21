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

export type DocJSON = Record<string, unknown>;

const EMPTY_DOC: DocJSON = { type: "doc", content: [{ type: "paragraph" }] };

/** Notion-style rich editor for the boodschappenlijstje: headings, checkboxes,
 *  ordered/unordered lists, with markdown shortcuts ("# ", "- ", "1. ", "[] ").
 *  Controlled by `content` (TipTap JSON); changes are debounced to `onChange`. */
export function ShoppingEditor({
  content,
  onChange,
}: {
  content: DocJSON | null;
  onChange: (doc: DocJSON) => void;
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
    ],
    content: content ?? EMPTY_DOC,
    editorProps: {
      attributes: {
        class: "tiptap max-w-none min-h-[55vh] focus:outline-none px-1 py-2 text-sm",
      },
    },
    onUpdate({ editor }) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onChange(editor.getJSON() as DocJSON), 600);
    },
  });

  // The editor is UNCONTROLLED after mount: it owns the document and autosaves.
  // We deliberately do NOT sync the `content` prop back in on every render — that
  // fought with live typing (a saved value echoing back reset the doc mid-edit).
  // Genuinely new content (after "Maak boodschappenlijstje") arrives via a fresh
  // navigation, which remounts this component with the new initial content.

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!editor) {
    return <div className="min-h-[55vh] rounded-xl border bg-card" />;
  }

  return (
    <div className="rounded-xl border bg-card">
      <Toolbar editor={editor} />
      <div className="px-3 pb-4 pt-1 md:px-5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
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
