"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChatPanel } from "@/components/chat/chat-panel";
import { OPEN_CHAT_EVENT } from "@/components/chat/chat-button";

const OPEN_KEY = "menu-chat-open";
const PANEL_W = 400;

// Desktop (md+): right sidebar, remembered open/closed. Mobile: fullscreen sheet.
// Both are opened from the chat button in the top bar (OPEN_CHAT_EVENT). The panel is portalled to <body> so no ancestor
// transform can break `fixed`; body padding makes the app shrink next to it. On desktop the app shell is h-dvh and the page scrolls inside SidebarInset, so the body never scrolls.
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

  const toggleRef = React.useRef(() => {});
  toggleRef.current = () => (desktop ? setSidebar(!sidebarOpen) : setSheetOpen(true));
  React.useEffect(() => {
    const onToggle = () => toggleRef.current();
    window.addEventListener(OPEN_CHAT_EVENT, onToggle);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onToggle);
  }, []);

  const showSidebar = desktop && sidebarOpen;
  const firstPadding = React.useRef(true);
  React.useEffect(() => {
    const b = document.body.style;
    // No slide on page load, only when the user opens or closes it.
    b.transition = firstPadding.current ? "" : "padding-right 300ms cubic-bezier(0.32, 0.72, 0, 1)";
    if (mounted) firstPadding.current = false;
    b.paddingRight = showSidebar ? `${PANEL_W}px` : "";
    return () => {
      b.paddingRight = "";
    };
  }, [showSidebar, mounted]);

  React.useEffect(() => {
    document.body.style.overflow = !desktop && sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [desktop, sheetOpen]);

  if (!mounted) return null;

  return createPortal(
    desktop ? (
      <aside
        className={
          "fixed inset-y-0 right-0 z-40 border-l bg-background transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none " +
          (sidebarOpen ? "translate-x-0" : "pointer-events-none translate-x-full")
        }
        style={{ width: PANEL_W }}
        aria-label="Assistent"
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
      >
        <ChatPanel userId={userId} onClose={() => setSidebar(false)} closeIcon="chevron" />
      </aside>
    ) : sheetOpen ? (
      <div className="fixed inset-0 z-[60] bg-background" role="dialog" aria-label="Assistent">
        <ChatPanel userId={userId} onClose={() => setSheetOpen(false)} closeIcon="x" />
      </div>
    ) : null,
    document.body,
  );
}
