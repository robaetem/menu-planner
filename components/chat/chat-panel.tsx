"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, ChevronRight, Search, Sparkles, Trash2, X } from "lucide-react";
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

const SUGGESTIONS = [
  "Welke recepten heb ik?",
  "Wat staat er deze week op het menu?",
  "Hoe werkt de diepvrieslijst?",
  "Maak de verzendknop rood",
];

const transport = new DefaultChatTransport({ api: "/api/chat" });

function ToolPart({ part }: { part: UIMessage["parts"][number] }) {
  if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") return null;
  const p = part as { type: string; toolName?: string; state?: string; output?: unknown };
  const name = p.type === "dynamic-tool" ? (p.toolName ?? "tool") : p.type.slice(5);
  if (name === "request_change") {
    const runId = (p.output as { runId?: string } | undefined)?.runId;
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
  const done = p.state === "output-available";
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {done ? <Search className="size-3" /> : <Loader variant="circular" size="sm" />}
      <span>{done ? "Opgezocht" : "Opzoeken"}: {name}</span>
    </div>
  );
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
  const { messages, sendMessage, setMessages, status, error } = useChat({ transport });
  const [input, setInput] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw) as UIMessage[]);
    } catch {
      /* corrupt storage: start fresh */
    }
    setLoaded(true);
  }, [storageKey, setMessages]);

  React.useEffect(() => {
    if (!loaded || status === "streaming" || status === "submitted") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-60)));
    } catch {
      /* storage full: ignore */
    }
  }, [messages, status, storageKey, loaded]);

  const busy = status === "submitted" || status === "streaming";

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Sparkles className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight">Assistent</h2>
        <div className="ml-auto flex items-center gap-0.5">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Nieuw gesprek"
              title="Nieuw gesprek"
              onClick={() => setMessages([])}
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
        <ChatContainerRoot className="h-full">
          <ChatContainerContent className="gap-5 p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-5 pt-10 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                  <Sparkles className="size-5 text-muted-foreground" />
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
                    {m.parts.map((part, i) =>
                      part.type === "text" ? (
                        part.text ? (
                          m.role === "user" ? (
                            <MessageContent
                              key={i}
                              className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                            >
                              {part.text}
                            </MessageContent>
                          ) : (
                            <MessageContent
                              key={i}
                              markdown
                              className="bg-transparent p-0 text-sm"
                            >
                              {part.text}
                            </MessageContent>
                          )
                        ) : null
                      ) : (
                        <ToolPart key={i} part={part} />
                      ),
                    )}
                  </div>
                </Message>
              ))
            )}
            {status === "submitted" && (
              <Loader variant="typing" size="sm" className="text-muted-foreground" />
            )}
            {error && (
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
          <PromptInputTextarea placeholder="Stel een vraag of vraag een aanpassing…" />
          <PromptInputActions className="justify-end pt-1">
            <Button
              type="button"
              size="icon"
              className="size-8 rounded-full"
              data-chat-send
              aria-label="Verstuur"
              disabled={busy || !input.trim()}
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
