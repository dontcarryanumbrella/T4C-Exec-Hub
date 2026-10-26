import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { addDays, formatWeek, isISODate, mondayOf, todayISO } from "@/lib/dates";
import { taskStatus } from "@/lib/status";
import { withTask } from "@/components/bits";
import { ConfirmButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Menu } from "@/components/Menu";
import TaskPanel from "@/components/TaskPanel";
import { PageHeader } from "@/components/shell";
import { resetCalendarToken } from "../../actions";
import { appUrl } from "@/lib/url";

export const metadata: Metadata = { title: "Calendar · T4C Exec Hub" };

type Item = { key: string; date: string; time: string | null; label: string; who?: string; href: string; tone: string; kind: string; done?: boolean };

function timeLabel(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

// One week at a time: each day lists all-day deadlines first, then anything
// with a time, in order.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string; task?: string; subscribe?: string }>;
}) {
  const me = await requireMember();
  const query = await searchParams;
  const today = todayISO();
  const everyone = query.view === "all";
  const thisWeek = mondayOf(today);
  const week = isISODate(query.week) ? mondayOf(query.week) : thisWeek;
  const end = addDays(week, 6);
  const link = (taskId: string | null) => withTask("/calendar", { view: query.view, week: query.week }, taskId);
  const href = (v: string | null, w: string) => {
    const p = new URLSearchParams();
    if (v) p.set("view", v);
    if (w !== thisWeek) p.set("week", w);
    const qs = p.toString();
    return qs ? `/calendar?${qs}` : "/calendar";
  };
  const view = everyone ? "all" : null;

  const [tasks, projects, meetings] = await Promise.all([
    db.task.findMany({
      where: { due: { gte: week, lte: end }, status: { not: "dropped" }, ...(everyone ? {} : { ownerId: me.id }) },
      include: { owner: true, waitingOn: true, helpRequests: true },
      orderBy: { createdAt: "asc" },
    }),
    db.project.findMany({ where: { status: "active", due: { gte: week, lte: end }, ...(everyone ? {} : { ownerId: me.id }) } }),
    db.meeting.findMany({ where: { date: { gte: week, lte: end } } }),
  ]);

  const items: Item[] = [
    ...meetings.map((m) => ({ key: m.id, date: m.date, time: m.time, label: m.title, href: `/meetings/${m.id}`, tone: "ok", kind: "Meeting" })),
    ...projects.map((p) => ({ key: p.id, date: p.due!, time: null, label: p.title, href: `/projects/${p.id}`, tone: "muted", kind: "Project due" })),
    ...tasks.map((t) => ({
      key: t.id,
      date: t.due!,
      time: t.dueTime,
      label: t.title,
      who: everyone ? (t.ownerId === me.id ? "You" : (t.owner?.name ?? "Up for grabs")) : undefined,
      href: link(t.id),
      tone: taskStatus(t, today).tone,
      kind: "Task",
      done: t.status === "done",
    })),
  ];
  // Every Sunday: the weekly check-in for the week that starts the next day.
  if (me.kind === "exec") {
    const sunday = addDays(week, 6);
    const doneIt = await db.checkIn.count({ where: { memberId: me.id, weekStart: addDays(sunday, 1) } });
    items.unshift({ key: `checkin-${sunday}`, date: sunday, time: null, label: "Weekly check-in", href: `/checkin?week=${addDays(sunday, 1)}`, tone: doneIt ? "done" : "ok", kind: "Check-in", done: !!doneIt });
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const forDay = (d: string) =>
    items
      .filter((i) => i.date === d)
      .sort((a, b) => (a.time ?? "") .localeCompare(b.time ?? ""));

  const base = appUrl();
  const feedUrl = me.calendarToken ? `${base}/calendar/feed/${me.calendarToken}.ics` : null;
  const googleSubscribe = feedUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl.replace(/^https?:/, "webcal:"))}` : null;

  return (
    <>
      <PageHeader
        title="Calendar"
        sub={formatWeek(week)}
        actions={
          <>
            <div className="segmented" role="tablist" aria-label="Whose dates" style={{ minWidth: 180 }}>
              <Link href={href(null, week)} className={`button small${everyone ? " secondary" : ""}`} role="tab" aria-selected={!everyone}>Mine</Link>
              <Link href={href("all", week)} className={`button small${everyone ? "" : " secondary"}`} role="tab" aria-selected={everyone}>Everyone</Link>
            </div>
            <nav className="row" aria-label="Change week" style={{ gap: 4 }}>
              {week !== thisWeek && <Link href={href(view, thisWeek)} className="button secondary small">Today</Link>}
              <Link href={href(view, addDays(week, -7))} className="icon-button" aria-label="Previous week" title="Previous week"><Icon name="left" /></Link>
              <Link href={href(view, addDays(week, 7))} className="icon-button" aria-label="Next week" title="Next week"><Icon name="right" /></Link>
            </nav>
            <Menu>
              <a href="/calendar/download" className="menu-item"><Icon name="calendar" /> Download for Google Calendar (.ics)</a>
              <Link href="/calendar?subscribe=1#subscribe" className="menu-item"><Icon name="link" /> Subscribe (keeps in sync)</Link>
            </Menu>
          </>
        }
      />

      <div className="week-grid">
        {days.map((d) => {
          const list = forDay(d);
          const date = new Date(`${d}T00:00:00Z`);
          return (
            <section key={d} className={`week-day${d === today ? " today" : ""}`} aria-label={d}>
              <header className="week-day-head">
                <span className="dow">{date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</span>
                <span className="dom">{date.getUTCDate()}</span>
              </header>
              {list.length === 0 && <span className="week-empty">—</span>}
              {list.map((it) => (
                <Link key={it.key} href={it.href} scroll={false} className={`week-item tone-${it.tone}${it.done ? " done" : ""}`} title={`${it.kind}: ${it.label}`}>
                  <span className="when">{it.time ? timeLabel(it.time) : it.kind === "Task" ? "Due" : it.kind}</span>
                  <span className="what">{it.label}</span>
                  {it.who && <span className="who">{it.who}</span>}
                </Link>
              ))}
            </section>
          );
        })}
      </div>

      {query.subscribe && (
        <div className="box" id="subscribe" style={{ marginTop: 20, maxWidth: 680 }}>
          <h2>Google Calendar</h2>
          <p className="small">
            <a href="/calendar/download">Download (.ics)</a> and import it in Google Calendar, or subscribe with your link to stay in sync.
          </p>
          {feedUrl ? (
            <>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input type="text" readOnly value={feedUrl} aria-label="Your private calendar link" />
                {googleSubscribe && <a href={googleSubscribe} target="_blank" rel="noreferrer noopener" className="button">Subscribe</a>}
              </div>
              <form action={resetCalendarToken}>
                <ConfirmButton message="Make a new link? The old one stops working, so you'll need to subscribe again." className="link small">
                  Reset my link
                </ConfirmButton>
              </form>
            </>
          ) : (
            <form action={resetCalendarToken}>
              <button className="secondary">Create my private link</button>
            </form>
          )}
        </div>
      )}

      {query.task && <TaskPanel taskId={query.task} me={me} back={link(query.task)} closeHref={link(null)} />}
    </>
  );
}
