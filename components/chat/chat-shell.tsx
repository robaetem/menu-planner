"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { MessageCircle, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/chat-panel";

const OPEN_KEY = "menu-chat-open";
const PANEL_W = 400;

// Desktop (md+): right sidebar, remembered open/closed. Mobile: bubble bottom-left
// that opens a fullscreen sheet. The panel is portalled to <body> so no ancestor
// transform can break `fixed`; body padding makes the app shrink next to it.
export function ChatShell({ userId = "me" }: { userId?: string }) {
  const [mounted, setMounted] = React.useState(false);
  const [desktop, setDesktop] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  React.useEffect(() => {
    setSidebarOpen(localStorage.getItem(OPEN_KEY) !== "0");
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    setMounted(true);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function setSidebar(open: boolean) {
    setSidebarOpen(open);
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  }

  const showSidebar = desktop && sidebarOpen;
  React.useEffect(() => {
    document.body.style.paddingRight = showSidebar ? `${PANEL_W}px` : "";
    return () => {
      document.body.style.paddingRight = "";
    };
  }, [showSidebar]);

  React.useEffect(() => {
    document.body.style.overflow = !desktop && sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [desktop, sheetOpen]);

  if (!mounted) return null;

  return createPortal(
    desktop ? (
      sidebarOpen ? (
        <aside
          className="fixed inset-y-0 right-0 z-40 border-l bg-background"
          style={{ width: PANEL_W }}
          aria-label="Assistent"
        >
          <ChatPanel userId={userId} onClose={() => setSidebar(false)} closeIcon="chevron" />
        </aside>
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-4 bottom-4 z-40 size-11 rounded-full shadow-md"
          aria-label="Open assistent"
          onClick={() => setSidebar(true)}
        >
          <PanelRightOpen className="size-5" />
        </Button>
      )
    ) : sheetOpen ? (
      <div className="fixed inset-0 z-[60] bg-background" role="dialog" aria-label="Assistent">
        <ChatPanel userId={userId} onClose={() => setSheetOpen(false)} closeIcon="x" />
      </div>
    ) : (
      <Button
        size="icon"
        className="fixed bottom-20 left-4 z-50 size-13 rounded-full shadow-lg"
        aria-label="Open assistent"
        onClick={() => setSheetOpen(true)}
      >
        <MessageCircle className="size-6" />
      </Button>
    ),
    document.body,
  );
}
