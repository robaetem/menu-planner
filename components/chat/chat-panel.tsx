"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type FileUIPart, type UIMessage } from "ai";
import { ArrowUp, ChevronRight, ImagePlus, Sparkle, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/image-compress";
import { MAX_IMAGES, stripOldImages } from "@/lib/chat/images";
import { clearImages, loadImages, saveImages } from "@/lib/chat/image-store";
import { Button } from "@/components/ui/button";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container";
import { Loader } from "@/components/ui/loader";
import { Message, MessageContent } from "@/components/ui/message";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
import { ScrollButton } from "@/components/ui/scroll-button";
import { ChangeRunCard } from "@/components/chat/change-run-card";
import { ApprovalCard, type AddToolResult } from "@/components/chat/approval-card";
import { ToolSteps, isStepPart, toolName } from "@/components/chat/tool-steps";

const SUGGESTIONS = [
  "Welke recepten heb ik?",
  "Wat staat er deze week op het menu?",
  "Hoe werkt de diepvrieslijst?",
  "Maak de verzendknop rood",
];

const CLIENT_TOOLS = new Set(["tool-proposeChange"]);

/** True when the last assistant message ends on a client tool call that has an answer. */
function needsClientContinue(messages: UIMessage[]) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  return last.parts.some((p) => CLIENT_TOOLS.has(p.type));
}

/** A finished assistant answer (text or card) exists after the last user message: no error banner. */
function lastHasAnswer(messages: UIMessage[]) {
  const last = messages[messages.length - 1];
  return (
    !!last &&
    last.role === "assistant" &&
    last.parts.some((p) => (p.type === "text" && p.text.trim() !== "") || p.type.startsWith("tool-"))
  );
}

// Only the last user message keeps its photos on the wire; older ones become "[foto]".
const transport = new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, messages: stripOldImages(messages) } }),
});

/** Photo thumbnail; tap to enlarge. */
function ChatImage({ src }: { src: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" aria-label="Foto vergroten" onClick={() => setOpen(true)} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Foto" className="size-24 rounded-2xl object-cover" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Foto"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Foto" className="max-h-full max-w-full rounded-xl object-contain" />
          <button
            type="button"
            aria-label="Sluiten"
            className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/90 text-black"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}

/** The bot's acknowledgement belongs before the change card: move text that follows a
 *  request_change card in front of it, or drop it when the message already has a line before the card. */
function acknowledgeFirst(parts: UIMessage["parts"]): UIMessage["parts"] {
  const at = parts.findIndex((p) => p.type === "tool-request_change");
  if (at < 0) return parts;
  const before = parts.slice(0, at);
  const after = parts.slice(at + 1);
  const hasLine = before.some((p) => p.type === "text" && p.text.trim() !== "");
  const lateText = after.filter((p) => p.type === "text");
  if (!lateText.length) return parts;
  const rest = after.filter((p) => p.type !== "text");
  return [...before, ...(hasLine ? [] : lateText), parts[at], ...rest];
}

function ToolPart({
  part,
  addToolResult,
}: {
  part: UIMessage["parts"][number];
  addToolResult: AddToolResult;
}) {
  const name = toolName(part);
  if (!name) return null;
  const p = part as {
    state?: string;
    input?: { title?: string; ops?: unknown[]; request?: string };
    output?: { runId?: string; declined?: boolean; undoId?: string; error?: string };
    toolCallId: string;
  };
  if (name === "proposeChange") {
    return (
      <ApprovalCard
        tool={name}
        toolCallId={p.toolCallId}
        state={p.state}
        input={p.input}
        output={p.output}
        addToolResult={addToolResult}
      />
    );
  }
  if (name === "request_change") {
    const runId = p.output?.runId;
    if (runId) return <ChangeRunCard runId={runId} />;
    if (p.state === "output-error") {
      return <p className="text-xs text-destructive">Wijziging aanvragen mislukte.</p>;
    }
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader variant="circular" size="sm" /> Wijziging aanvragen…
      </div>
    );
  }
  return null;
}

/** Fold runs of consecutive plain tool parts into one collapsed group. */
function renderParts(m: UIMessage, addToolResult: AddToolResult) {
  const out: React.ReactNode[] = [];
  let run: UIMessage["parts"] = [];
  const flush = (key: number) => {
    if (run.length) out.push(<ToolSteps key={`s${key}`} parts={run} />);
    run = [];
  };
  acknowledgeFirst(m.parts).forEach((part, i) => {
    if (isStepPart(part)) {
      run.push(part);
      return;
    }
    flush(i);
    if (part.type === "file" && part.mediaType.startsWith("image/")) {
      out.push(
        // eslint-disable-next-line @next/next/no-img-element
        <ChatImage key={i} src={part.url} />,
      );
    } else if (part.type === "text") {
      if (!part.text) return;
      out.push(
        m.role === "user" ? (
          <MessageContent
            key={i}
            className="rounded-2xl rounded-br-md bg-[#F7F7F7] px-3.5 py-2 text-sm text-neutral-900"
          >
            {part.text}
          </MessageContent>
        ) : (
          <MessageContent key={i} markdown className="max-w-none rounded-none bg-transparent p-0 text-sm">
            {part.text}
          </MessageContent>
        ),
      );
    } else {
      const el = <ToolPart key={i} part={part} addToolResult={addToolResult} />;
      out.push(el);
    }
  });
  flush(m.parts.length);
  return out;
}

export function ChatPanel({
  userId,
  onClose,
  closeIcon = "x",
}: {
  userId: string;
  onClose: () => void;
  closeIcon?: "x" | "chevron";
}) {
  const storageKey = `menu-chat:${userId}`;
  const { messages, sendMessage, setMessages, addToolResult, clearError, status, error } = useChat({
    transport,
    // Only continue after a client-side tool (proposeChange) got its answer. Server tools such as
    // request_change already ran on the server; resending after them caused a bogus second request.
    sendAutomaticallyWhen: (opts) =>
      lastAssistantMessageIsCompleteWithToolCalls(opts) && needsClientContinue(opts.messages),
    onFinish: ({ isError }) => {
      if (!isError) clearError();
    },
  });
  const [input, setInput] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);

  // Restore once per user. In the live app a code change hot-reloads this file and re-runs effects;
  // restoring again would overwrite the running conversation with an older saved copy.
  const restoredFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (restoredFor.current === storageKey) return;
    restoredFor.current = storageKey;
    void (async () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) setMessages(await loadImages(JSON.parse(raw) as UIMessage[]));
      } catch {
        /* corrupt storage: start fresh */
      }
      setLoaded(true);
    })();
  }, [storageKey, setMessages]);

  React.useEffect(() => {
    if (!loaded || status === "streaming" || status === "submitted") return;
    const recent = messages.slice(-60);
    void (async () => {
      try {
        // Photos go to IndexedDB; the saved chat keeps only a pointer.
        localStorage.setItem(storageKey, JSON.stringify(await saveImages(userId, recent)));
      } catch {
        /* storage full: ignore */
      }
    })();
  }, [messages, status, storageKey, loaded, userId]);

  const busy = status === "submitted" || status === "streaming";
  const [images, setImages] = React.useState<string[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function addFiles(list: File[]) {
    const files = list.filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const room = MAX_IMAGES - images.length;
    if (files.length > room) toast.error("Maximaal 3 foto's per bericht");
    for (const f of files.slice(0, Math.max(room, 0))) {
      try {
        const url = await compressImage(f);
        setImages((cur) => (cur.length < MAX_IMAGES ? [...cur, url] : cur));
      } catch {
        toast.error("Deze foto kan ik niet openen");
      }
    }
  }

  function send(text: string) {
    const t = text.trim();
    if ((!t && !images.length) || busy) return;
    const files: FileUIPart[] = images.map((url) => ({ type: "file", mediaType: "image/jpeg", url }));
    sendMessage(files.length ? { text: t, files } : { text: t });
    setInput("");
    setImages([]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Sparkle className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight">Assistent</h2>
        <div className="ml-auto flex items-center gap-0.5">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Nieuw gesprek"
              title="Nieuw gesprek"
              onClick={() => {
                setMessages([]);
                localStorage.removeItem(storageKey);
                void clearImages(userId);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Sluit chat" onClick={onClose}>
            {closeIcon === "x" ? <X className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <ChatContainerRoot className="h-full overscroll-contain">
          <ChatContainerContent className="gap-5 p-4" scrollClassName="overscroll-contain">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-5 pt-10 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                  <Sparkle className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Waarmee kan ik helpen?</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vraag iets over je recepten of menu, of vraag om een aanpassing.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <PromptSuggestion
                      key={s}
                      size="default"
                      className="h-auto w-full justify-start whitespace-normal rounded-xl px-3.5 py-2.5 text-left font-normal"
                      onClick={() => send(s)}
                    >
                      {s}
                    </PromptSuggestion>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <Message
                  key={m.id}
                  className={m.role === "user" ? "justify-end" : "justify-start"}
                >
                  <div
                    className={
                      m.role === "user"
                        ? "flex max-w-[85%] flex-col items-end gap-2"
                        : "flex w-full min-w-0 flex-col gap-2"
                    }
                  >
                    {renderParts(m, addToolResult as AddToolResult)}
                  </div>
                </Message>
              ))
            )}
            {status === "submitted" && (
              <Loader variant="typing" size="sm" className="text-muted-foreground" />
            )}
            {status === "error" && error && !lastHasAnswer(messages) && (
              <p className="text-sm text-destructive">
                Er ging iets mis. Probeer het opnieuw.
              </p>
            )}
          </ChatContainerContent>
          <div className="absolute bottom-3 right-4">
            <ScrollButton />
          </div>
        </ChatContainerRoot>
      </div>

      <div className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <PromptInput
          value={input}
          onValueChange={setInput}
          isLoading={busy}
          onSubmit={() => send(input)}
          className="rounded-2xl"
        >
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pt-2">
              {images.map((url, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Gekozen foto" className="size-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    aria-label="Foto verwijderen"
                    className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-foreground text-background"
                    onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <PromptInputTextarea
            submitOnEnter={false}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (!files.length) return;
              e.preventDefault();
              void addFiles(files);
            }}
            onKeyDown={(e) => {
              // Desktop: Enter sends, Shift+Enter is a newline. Touch / small screens: Enter is a newline.
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              if (window.matchMedia("(pointer: coarse)").matches || !window.matchMedia("(min-width: 768px)").matches) return;
              e.preventDefault();
              send(input);
            }} className="text-base md:text-sm" placeholder="Stel een vraag of vraag een aanpassing…" />
          <PromptInputActions className="justify-between pt-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              aria-label="Foto toevoegen"
              disabled={busy || images.length >= MAX_IMAGES}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="size-8 rounded-full bg-destructive text-white hover:bg-destructive/90"
              data-chat-send
              aria-label="Verstuur"
              disabled={busy || (!input.trim() && !images.length)}
              onClick={() => send(input)}
            >
              <ArrowUp className="size-4" />
            </Button>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  );
}
