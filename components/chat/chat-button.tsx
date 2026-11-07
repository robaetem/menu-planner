"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const OPEN_CHAT_EVENT = "menu-chat:toggle";

/** Top-bar button that opens (mobile) or toggles (desktop) the chat. */
export function ChatButton({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Assistent"
      onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))}
    >
      <MessageCircle className="size-[1.15rem]" />
    </Button>
  );
}
