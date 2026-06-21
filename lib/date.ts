import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

/** Add n days to a yyyy-MM-dd string without timezone drift (UTC math). */
export function addIsoDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Vrijdag 05/06" */
export function formatDayLabel(iso: string): string {
  return cap(format(parseISO(iso), "EEEE dd/MM", { locale: nl }));
}

/** "vr 5 jun" — compact */
export function formatDayShort(iso: string): string {
  return format(parseISO(iso), "EEEEEE d MMM", { locale: nl });
}

/** "5 – 9 juni" or "5 jun – 2 jul" range from a start date + day count. */
export function formatRange(startIso: string, dayCount: number): string {
  if (!startIso) return "";
  const start = parseISO(startIso);
  const endIso = addIsoDays(startIso, Math.max(0, dayCount - 1));
  const end = parseISO(endIso);
  const sameMonth = format(start, "MM yyyy") === format(end, "MM yyyy");
  if (dayCount <= 1) return cap(format(start, "d MMMM yyyy", { locale: nl }));
  if (sameMonth) {
    return `${format(start, "d", { locale: nl })} – ${format(end, "d MMMM yyyy", { locale: nl })}`;
  }
  return `${format(start, "d MMM", { locale: nl })} – ${format(end, "d MMM yyyy", { locale: nl })}`;
}

export function weekdayName(iso: string): string {
  return cap(format(parseISO(iso), "EEEE", { locale: nl }));
}

/** "5 jun" — compact day + month, from a date or full timestamp. */
export function formatMonthDay(iso: string): string {
  return format(parseISO(iso), "d MMM", { locale: nl });
}
