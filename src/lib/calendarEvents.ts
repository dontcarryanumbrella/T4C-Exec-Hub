import { db } from "./db";
import { MINUTES, type FeedEvent } from "./calendar";
import { addDays, mondayOf, todayISO } from "./dates";
import { workingOn } from "./tasks";

// Everything that belongs in one person's calendar: tasks they're on (with a
// date), deadlines of projects they own, all exec meetings, and (for execs)
// the weekly Sunday check-in.
export async function eventsFor(memberId: string): Promise<FeedEvent[]> {
  const member = await db.member.findUnique({ where: { id: memberId }, select: { kind: true } });
  const [tasks, projects, meetings] = await Promise.all([
    db.task.findMany({
      where: { ...workingOn(memberId), due: { not: null }, status: { not: "dropped" } },
      include: { project: true },
    }),
    db.project.findMany({ where: { ownerId: memberId, status: "active", due: { not: null } } }),
    db.meeting.findMany(),
  ]);
  // Execs check in every Sunday; one repeating event covers every week.
  const checkIn: FeedEvent[] =
    member?.kind === "exec"
      ? [{ uid: "weekly-checkin", date: addDays(mondayOf(todayISO()), -1), title: "T4C weekly check-in", path: "/checkin?from=reminder", rrule: "FREQ=WEEKLY;BYDAY=SU" }]
      : [];
  return [
    ...checkIn,
    ...tasks.map((t) => ({
      uid: `task-${t.id}`,
      date: t.due!,
      time: t.dueTime,
      minutes: MINUTES.task,
      title: `${t.status === "done" ? "✓ " : ""}${t.title}`,
      description: [t.description, t.project ? `Project: ${t.project.title}` : ""].filter(Boolean).join("\n\n") || undefined,
      path: `/?task=${t.id}`,
    })),
    ...projects.map((p) => ({ uid: `project-${p.id}`, date: p.due!, title: `${p.title} (project due)`, path: `/projects/${p.id}` })),
    ...meetings.map((m) => ({ uid: `meeting-${m.id}`, date: m.date, time: m.time, minutes: MINUTES.meeting, title: m.title, path: `/meetings/${m.id}` })),
  ];
}
