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

export const GROENTE_UNITS = ["gram", "kilogram", "stuk", "portie", "zak", "doos", "verpakking"] as const;

export type GroenteUnit = (typeof GROENTE_UNITS)[number];

export function normalizeGroenteUnit(value: unknown): GroenteUnit {
  return typeof value === "string" && GROENTE_UNITS.includes(value as GroenteUnit)
    ? (value as GroenteUnit)
    : "stuk";
}

export function normalizeGroenteAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1_000_000, Math.round(value * 1000) / 1000));
}

/** Keep the old count column useful if application code needs to be rolled back. */
export function legacyCountForAmount(value: number): number {
  const amount = normalizeGroenteAmount(value);
  return amount > 0 ? Math.ceil(amount) : 0;
}

function pluralizeGroenteUnit(unit: GroenteUnit, amount: number): string {
  if (amount === 1 || unit === "gram" || unit === "kilogram") return unit;
  const plurals: Record<Exclude<GroenteUnit, "gram" | "kilogram">, string> = {
    stuk: "stuks",
    portie: "porties",
    zak: "zakken",
    doos: "dozen",
    verpakking: "verpakkingen",
  };
  return plurals[unit];
}

export function formatGroenteQuantity(amount: number, unit: GroenteUnit): string {
  const formatted = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 3 }).format(amount);
  return `${formatted} ${pluralizeGroenteUnit(unit, amount)}`;
}
