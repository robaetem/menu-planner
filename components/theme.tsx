"use client";

import * as React from "react";

export type Theme = "light" | "dark";

type ThemeCtx = { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void };

const Context = React.createContext<ThemeCtx | null>(null);

function currentIsDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("light");

  // Apply the saved theme on mount. We intentionally do NOT inject a no-flash
  // <script> in the layout: React 19 errors on any client-reconciled <script>.
  // Light is the default so the common case never flashes; a dark-mode user may
  // see one frame of light on a full reload only.
  React.useEffect(() => {
    let saved: Theme = "light";
    try {
      if (localStorage.getItem("theme") === "dark") saved = "dark";
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle("dark", saved === "dark");
    setThemeState(saved);
  }, []);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(currentIsDark() ? "light" : "dark");
  }, [setTheme]);

  return <Context.Provider value={{ theme, toggle, setTheme }}>{children}</Context.Provider>;
}

export function useTheme(): ThemeCtx {
  return React.useContext(Context) ?? { theme: "light", toggle: () => {}, setTheme: () => {} };
}
