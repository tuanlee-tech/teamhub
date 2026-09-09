const DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string) {
  const cached = DATE_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone });
  DATE_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

/** Today's YYYY-MM-DD in the organization timezone (not UTC). */
export function todayInTimezone(timeZone: string): string {
  return dateFormatter(timeZone).format(new Date());
}

const TIME_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string) {
  const cached = TIME_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  TIME_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

/** "HH:mm" at the given organization timezone. */
export function formatTimeInTimezone(iso: string, timeZone: string): string {
  if (!iso) return "—";
  return timeFormatter(timeZone).format(new Date(iso));
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

/** Vietnamese-ish label for a YYYY-MM-DD date. */
export function formatWorkDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const asOrg = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00`,
  );
  const formatted = WEEKDAY_FORMATTER.format(asOrg);
  const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  return `${capitalized} (${day}/${month}/${year})`;
}

/** Shift a YYYY-MM-DD by a number of days, keeping the same calendar day. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().split("T")[0];
}