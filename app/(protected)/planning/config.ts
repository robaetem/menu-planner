import type { Assignee } from "@/lib/types";

export const AMBER_MODES = ["24 uur", "Recup", "Vrije middag", "A"];
export const ROBIN_MODES = ["Brussel", "Leuven", "Thuiswerk"];
export const DEFAULT_MODE = "thuis";

export function assigneeLabel(a: Assignee): string {
  return a === "both" ? "Samen" : a === "amber" ? "Amber" : "Robin";
}
