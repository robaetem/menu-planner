"use client";

import * as React from "react";
import type { Portion } from "@/lib/freezer/potjes";

type FreezerState = {
  portions: Portion[];
  /** Server's today, so client and server agree on what "in the freezer" means. */
  today: string;
};

const FreezerContext = React.createContext<FreezerState>({ portions: [], today: "" });

export function FreezerProvider({ value, children }: { value: FreezerState; children: React.ReactNode }) {
  return <FreezerContext.Provider value={value}>{children}</FreezerContext.Provider>;
}

export function useFreezer(): FreezerState {
  return React.useContext(FreezerContext);
}
