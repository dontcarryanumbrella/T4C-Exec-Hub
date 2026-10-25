// All calendar dates are plain "YYYY-MM-DD" strings in Duke's time zone,
// so a due date never shifts depending on who is looking at it.
const TZ = "America/New_York";

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function toUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

export function mondayOf(iso: string): string {
  const day = toUTC(iso).getUTCDay(); // 0 = Sun
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

// This Week always means the current Monday–Sunday. Planning ahead is explicit.
export function activeWeek(today = todayISO()): string {
  return mondayOf(today);
}

// The week people should be planning: the current one, except on Sunday,
// when the reminder asks everyone to plan the coming week.
export function planningWeek(today = todayISO()): string {
  return toUTC(today).getUTCDay() === 0 ? addDays(mondayOf(today), 7) : mondayOf(today);
}

export function isISODate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const date = toUTC(s);
  return !Number.isNaN(date.getTime()) && fromUTC(date) === s;
}

export function formatDay(iso: string): string {
  return toUTC(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatWeek(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const opts = { month: "short", day: "numeric", timeZone: "UTC" } as const;
  return `${toUTC(weekStart).toLocaleDateString("en-US", opts)} – ${toUTC(end).toLocaleDateString("en-US", opts)}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

export function isoFromDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
