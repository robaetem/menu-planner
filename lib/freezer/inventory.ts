export const FREEZER_TABS = ["potjes", "vleesjes", "groenten"] as const;

export type FreezerTab = (typeof FREEZER_TABS)[number];

export function normalizeFreezerTab(value: unknown): FreezerTab {
  return typeof value === "string" && FREEZER_TABS.includes(value as FreezerTab)
    ? (value as FreezerTab)
    : "potjes";
}

export function clampFreezerCount(value: number): number {
  return Math.max(0, Math.min(99, Math.floor(value) || 0));
}
