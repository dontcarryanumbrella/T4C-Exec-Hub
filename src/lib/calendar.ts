import { addDays } from "./dates";
import { appUrl } from "./url";

const compact = (iso: string) => iso.replaceAll("-", "");
export const TZ = "America/New_York";

// A task with a time is a 30-minute block starting then; a meeting is an
// hour. Without a time, it's an all-day item (Google shows those at the top
// of the day, like a deadline).
export const MINUTES = { task: 30, meeting: 60 } as const;

function endTime(time: string, minutes: number): { time: string; nextDay: boolean } {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const t = total % (24 * 60);
  return { time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, nextDay: total >= 24 * 60 };
}

const stamp = (date: string, time: string) => `${compact(date)}T${time.replace(":", "")}00`;

// Opens Google Calendar with the event pre-filled. It's a one-time copy;
// the subscription feed (once the hub is online) is what stays in sync.
export function googleCalendarUrl(e: {
  title: string;
  date: string;
  time?: string | null;
  minutes?: number;
  details?: string;
  path?: string;
}): string {
  const details = [e.details, e.path ? `${appUrl()}${e.path}` : ""].filter(Boolean).join("\n\n");
  let dates: string;
  if (e.time) {
    const end = endTime(e.time, e.minutes ?? MINUTES.task);
    dates = `${stamp(e.date, e.time)}/${stamp(end.nextDay ? addDays(e.date, 1) : e.date, end.time)}`;
  } else {
    dates = `${compact(e.date)}/${compact(addDays(e.date, 1))}`;
  }
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, details, ctz: TZ });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export type FeedEvent = {
  uid: string;
  date: string;
  time?: string | null;
  minutes?: number;
  title: string;
  description?: string;
  path?: string;
  rrule?: string; // e.g. FREQ=WEEKLY;BYDAY=SU for something that repeats
};

// iCalendar text escaping (RFC 5545 §3.3.11).
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 octets are folded with CRLF + space.
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

// US Eastern time, so timed events land at the right hour in any calendar app.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildIcs(name: string, events: FeedEvent[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//T4C//Exec Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    ...VTIMEZONE,
  ];
  for (const e of events) {
    const description = [e.description, e.path ? `${appUrl()}${e.path}` : ""].filter(Boolean).join("\n\n");
    let when: string[];
    if (e.time) {
      const end = endTime(e.time, e.minutes ?? MINUTES.task);
      when = [`DTSTART;TZID=${TZ}:${stamp(e.date, e.time)}`, `DTEND;TZID=${TZ}:${stamp(end.nextDay ? addDays(e.date, 1) : e.date, end.time)}`];
    } else {
      when = [`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`];
    }
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@t4c-exec-hub`,
      `DTSTAMP:${now}`,
      ...when,
      ...(e.rrule ? [`RRULE:${e.rrule}`] : []),
      `SUMMARY:${esc(e.title)}`,
      ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
