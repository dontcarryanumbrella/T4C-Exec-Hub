import { db } from "./db";
import { sendEmail } from "./email";
import { addDays, formatDay, planningWeek, todayISO } from "./dates";
import { taskStatus } from "./status";
import { appUrl } from "./url";

const OPEN_TASKS_SHOWN = 8;

type Digest = { to: string; subject: string; text: string; pingIds: string[]; dueIds: string[] };

// One morning email per person, covering everything since yesterday's:
// tasks due tomorrow, new pings (assignments, @mentions, help offers,
// decisions), a Sunday reminder to plan the coming week, and open tasks.
// Nobody gets an email that would only repeat yesterday's open-task list.
// People who have never signed in get nothing until they do, so the first
// hub email anyone sees is the sign-in link they asked for.
export async function buildDigests(): Promise<Digest[]> {
  const base = appUrl();
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  // Use the hub's Eastern calendar date, not the server's local weekday.
  const sunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
  const week = planningWeek(today);
  const members = await db.member.findMany({
    where: { joinedAt: { not: null } },
    include: {
      ownedTasks: {
        where: { status: { notIn: ["done", "dropped"] } },
        include: { project: true, waitingOn: true, helpRequests: true },
        orderBy: [{ due: "asc" }, { createdAt: "asc" }],
      },
      notifications: { where: { emailState: "pending" }, orderBy: { createdAt: "asc" } },
      checkIns: { where: { weekStart: week }, select: { id: true } },
    },
  });

  const digests: Digest[] = [];
  for (const m of members) {
    const due = m.ownedTasks.filter((t) => t.due === tomorrow && t.reminderSentFor !== tomorrow);
    // Pings already read on the site don't need repeating, and pings from
    // before someone first signed in are left for the bell.
    const pings = m.notifications.filter((n) => !n.readAt && !(m.joinedAt && n.createdAt < m.joinedAt));
    const needsCheckIn = sunday && m.kind === "exec" && m.checkIns.length === 0;
    const others = m.ownedTasks.filter((t) => t.due !== tomorrow);
    if (!due.length && !pings.length && !needsCheckIn) {
      // Still mark read pings as handled, so they never go out later.
      if (m.notifications.length) digests.push({ to: "", subject: "", text: "", pingIds: m.notifications.map((n) => n.id), dueIds: [] });
      continue;
    }

    const where = (t: (typeof due)[number]) => (t.project ? ` (${t.project.title})` : "");
    const sections: string[] = [];
    if (due.length)
      sections.push(
        `DUE TOMORROW, ${formatDay(tomorrow).toUpperCase()}\n` +
          due.map((t) => `• ${t.title}${where(t)}${t.dueTime ? ` at ${t.dueTime}` : ""}\n  ${base}/?task=${t.id}`).join("\n"),
      );
    if (pings.length) sections.push(`NEW FOR YOU\n` + pings.map((p) => `• ${p.text}\n  ${base}${p.href}`).join("\n"));
    if (needsCheckIn)
      sections.push(
        `WEEKLY CHECK-IN\nPlan your coming week: choose 1–3 outcomes, review unfinished work, and ask for any help you need. Check in today so the board can see your plan.\n  ${base}/checkin?week=${week}`,
      );
    if (others.length)
      sections.push(
        `YOUR OTHER OPEN TASKS\n` +
          others
            .slice(0, OPEN_TASKS_SHOWN)
            .map((t) => `• ${t.title}${where(t)} · ${taskStatus(t, today).text}\n  ${base}/?task=${t.id}`)
            .join("\n") +
          (others.length > OPEN_TASKS_SHOWN ? `\n…and ${others.length - OPEN_TASKS_SHOWN} more: ${base}/` : ""),
      );

    const headline = [
      due.length && `${due.length} due tomorrow`,
      pings.length && `${pings.length} new`,
      needsCheckIn && "plan your coming week",
    ].filter(Boolean);
    digests.push({
      to: m.email,
      subject: `T4C Hub: ${headline.join(", ")}`,
      text: `Hi ${m.name},\n\n${sections.join("\n\n")}\n\nOpen the hub: ${base}/`,
      pingIds: m.notifications.map((n) => n.id),
      dueIds: due.map((t) => t.id),
    });
  }
  return digests;
}

// Sends the morning emails, then marks what they covered so it isn't repeated.
// One person's email failing doesn't stop the others; their items wait for tomorrow.
export async function sendDailyDigests(): Promise<number> {
  const tomorrow = addDays(todayISO(), 1);
  let sent = 0;
  for (const d of await buildDigests()) {
    try {
      if (d.to) {
        await sendEmail(d.to, d.subject, d.text);
        sent++;
      }
      await db.notification.updateMany({ where: { id: { in: d.pingIds } }, data: { emailState: "sent" } });
      await db.task.updateMany({ where: { id: { in: d.dueIds } }, data: { reminderSentFor: tomorrow } });
    } catch (err) {
      console.error(`Daily email to ${d.to} failed`, err);
    }
  }
  return sent;
}
