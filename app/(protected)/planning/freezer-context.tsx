"use client";

import * as React from "react";
import type { Portion } from "@/lib/freezer/potjes";
import { EMPTY_STOCK, type FreezerStock } from "@/lib/freezer/stock";

type FreezerState = {
  portions: Portion[];
  /** Server's today, so client and server agree on what "in the freezer" means. */
  today: string;
  /** Vleesjes and groenten with what upcoming meals reserved. */
  vleesjes: FreezerStock;
  groenten: FreezerStock;
};

const FreezerContext = React.createContext<FreezerState>({
  portions: [],
  today: "",
  vleesjes: EMPTY_STOCK,
  groenten: EMPTY_STOCK,
});

export function FreezerProvider({ value, children }: { value: FreezerState; children: React.ReactNode }) {
  return <FreezerContext.Provider value={value}>{children}</FreezerContext.Provider>;
}

export function useFreezer(): FreezerState {
  return React.useContext(FreezerContext);
}
