import type { Assignee } from "@/lib/types";

// The Amber/Robin day "modes" are now user-managed (the `plan_modes` table,
// edited via the mode-manager dialog). DEFAULT_MODE is the label shown when no
// mode is set ("Thuis").
export const DEFAULT_MODE = "thuis";

export function assigneeLabel(a: Assignee): string {
  return a === "both" ? "Samen" : a === "amber" ? "Amber" : "Robin";
}
