import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { activeWeek, addDays, formatDay, formatWeek, isISODate, mondayOf, planningWeek, todayISO } from "@/lib/dates";
import { Avatar, StatusText, withTask } from "@/components/bits";
import TaskPanel from "@/components/TaskPanel";
import { PageHeader } from "@/components/shell";
import { Icon } from "@/components/icons";
import MoreToggle from "@/components/MoreToggle";
import { taskStatus } from "@/lib/status";

export const metadata: Metadata = { title: "This Week · T4C Exec Hub" };

// Cards show this many commitments; the rest fold under "+N more" so a busy
// week doesn't stretch the whole grid.
const CARD_LIMIT = 3;

function CommitmentItem({ task, href, today }: { task: Parameters<typeof StatusText>[0]["task"] & { id: string; title: string; helpOffers: unknown[] }; href: string; today: string }) {
  return (
    <li>
      <Link href={href}>
        <div>{task.title}</div>
        <StatusText task={task} today={today} />
        {task.helpOffers.length > 0 && <span className="small muted"> · +{task.helpOffers.length} helping</span>}
      </Link>
    </li>
  );
}

function dueLabel(due: string, today: string): string {
  if (due === today) return "Today";
  if (due === addDays(today, 1)) return "Tomorrow";
  return formatDay(due);
}

export default async function ThisWeek({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; task?: string }>;
}) {
  const me = await requireMember();
  const query = await searchParams;
  const current = activeWeek();
  const week = isISODate(query.week) ? mondayOf(query.week) : current;
  const today = todayISO();
  const link = (taskId: string | null) => withTask("/", { week: query.week }, taskId);
  const isExec = me.kind === "exec";

  const [members, commitments, checkIns, openTasks, everCheckedIn] = await Promise.all([
    db.member.findMany({ where: { kind: "exec" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.commitment.findMany({
      where: { weekStart: week },
      include: {
        task: {
          include: {
            waitingOn: true,
            helpRequests: true,
            helpOffers: { where: { status: { not: "declined" } }, include: { helper: true } },
          },
        },
      },
    }),
    db.checkIn.findMany({ where: { weekStart: week } }),
    db.task.findMany({
      where: { status: { notIn: ["done", "dropped"] } },
      include: { owner: true, waitingOn: true, helpRequests: { where: { status: "open" } } },
      orderBy: [{ due: "asc" }, { createdAt: "asc" }],
    }),
    db.checkIn.count({ where: { memberId: me.id } }),
  ]);

  // Tasks open inside their folder or project, with the task's panel showing.
  const taskHome = (t: { id: string; projectId: string | null }) => (t.projectId ? `/projects/${t.projectId}?task=${t.id}` : link(t.id));
  const checkInBy = new Map(checkIns.map((c) => [c.memberId, c]));
  const nextWeek = addDays(current, 7);
  const canPlan = week === current || week === nextWeek;
  // Viewing this week on a Sunday, "your plan" means next week's.
  const planWeek = week === current ? planningWeek() : week;
  const planHref = `/checkin?week=${planWeek}`;
  const planned = planWeek === week ? checkInBy.has(me.id) : (await db.checkIn.count({ where: { memberId: me.id, weekStart: planWeek } })) > 0;
  const planLabel = planned
    ? planWeek === current ? "Edit your plan" : "Edit next week's plan"
    : planWeek === current ? "Plan this week" : "Plan next week";
  const showGettingStarted = isExec && week === current && everCheckedIn === 0;
  const upForGrabs = openTasks.filter((t) => !t.ownerId).length;
  // One row per task. Urgent work comes first and is never cut off by a limit.
  const attention = openTasks.map((t) => {
    const status = taskStatus(t, today);
    const overdue = !!t.due && t.due < today;
    const blocked = t.status === "blocked" || status.text.startsWith("Blocked");
    const help = t.helpRequests.length > 0;
    const upcoming = !!t.due && t.due <= addDays(today, 7);
    const priority = overdue || blocked ? 0 : help ? 1 : 2;
    const label = overdue ? "Overdue" : blocked ? "Blocked" : help ? "Help wanted" : t.due ? dueLabel(t.due, today) : "";
    return { task: t, status, priority, label, visible: overdue || blocked || help || upcoming };
  }).filter((a) => a.visible).sort((a, b) => a.priority - b.priority);
  // A task given to Everyone is one copy per person; show it once, with a count.
  const grouped = new Map<string, (typeof attention)[number][]>();
  for (const a of attention) {
    const key = [a.task.title, a.task.projectId, a.task.due, a.label].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), a]);
  }
  const rows = [...grouped.values()].map((copies) => {
    const mine = copies.find((c) => c.task.ownerId === me.id);
    const first = mine ?? copies[0];
    const who = copies.length > 1 ? `${copies.length} people${mine ? ", incl. you" : ""}` : first.task.ownerId === me.id ? "you" : (first.task.owner?.name ?? "up for grabs");
    return { ...first, who };
  });

  return (
    <>
      <PageHeader
        title={week === current ? "This Week" : `Week of ${formatWeek(week)}`}
        sub={`${formatWeek(week)} · ${checkIns.length} of ${members.length} checked in`}
        actions={
          <nav className="row" aria-label="Change week" style={{ gap: 4 }}>
            {isExec && <Link href={`/checkin?week=${nextWeek}`} className="button secondary small">Plan next week</Link>}
            {week !== current && <Link href="/" className="button secondary small">This week</Link>}
            <Link href={`/?week=${addDays(week, -7)}`} className="icon-button" aria-label="Previous week" title="Previous week"><Icon name="left" /></Link>
            <Link href={`/?week=${addDays(week, 7)}`} className="icon-button" aria-label="Next week" title="Next week"><Icon name="right" /></Link>
          </nav>
        }
      />

      {showGettingStarted && (
        <div className="notice">
          <strong>Start with your work.</strong> Pick this week's outcomes, open a task to update it, or use Ask for help when you're stuck.
          <div style={{ marginTop: 8 }}><Link href={`/checkin?week=${planningWeek()}`} className="button">{planningWeek() === current ? "Plan this week" : "Plan next week"}</Link></div>
        </div>
      )}
      {isExec && canPlan && !showGettingStarted && (
        <div className="row" style={{ margin: "12px 0" }}>
          <Link href={planHref} className="button">{planLabel}</Link>
          <span className="small muted">Your card is your plan. Other tasks stay in check-in until you choose them.</span>
        </div>
      )}

      {(rows.length > 0 || upForGrabs > 0) && (
        <>
          <div className="section-title"><h2>Needs attention now · {rows.length}</h2></div>
          <div className="box" style={{ padding: "4px 14px" }}>
            {rows.map((a) => (
              <Link key={a.task.id} href={taskHome(a.task)} className="attn-row">
                <span className={`chip${a.priority < 2 ? " warn" : ""}`}>{a.label}</span>
                <span className="attn-text">{a.task.title}<span className="small muted" style={{ display: "block" }}>{a.status.text}{a.task.helpRequests.length > 0 && ` · Help: ${a.task.helpRequests[0].message}`}</span></span>
                <span className="muted small">{a.who}</span>
              </Link>
            ))}
            {upForGrabs > 0 && (
              <Link href={isExec ? "/checkin#up-for-grabs" : "/projects"} className="attn-row">
                <span className="chip blue">Up for grabs</span>
                <span className="attn-text">
                  {upForGrabs} task{upForGrabs === 1 ? " needs" : "s need"} an owner{isExec ? ". Take one on" : ""}
                </span>
                <Icon name="right" />
              </Link>
            )}
          </div>
        </>
      )}

      <div className="section-title"><h2>Who&apos;s doing what</h2></div>
      <div className="cards">
        {members.map((m) => {
          const mine = commitments.filter((c) => c.memberId === m.id && (week < current || c.task.ownerId === m.id));
          const checkIn = checkInBy.get(m.id);
          const isMe = m.id === me.id;
          return (
            <div key={m.id} className={`card${mine.length ? "" : " empty"}${isMe ? " mine" : ""}`}>
              <div className="card-head">
                <Avatar name={m.name} look={m} seen={m.lastSeenAt} />
                <div>
                  <div className="card-name">
                    {m.name}
                    {isMe && <span className="you">You</span>}
                  </div>
                  <div className="card-role">{m.role}</div>
                </div>
              </div>
              {mine.length === 0 ? (
                <p className="muted small">
                  {checkIn ? "No commitments" : isMe && canPlan ? <Link href={planHref}>Plan your week →</Link> : "Not checked in"}
                </p>
              ) : (
                <ul className="commits">
                  {mine.slice(0, CARD_LIMIT).map(({ task }) => (
                    <CommitmentItem key={task.id} task={task} href={taskHome(task)} today={today} />
                  ))}
                  {mine.length > CARD_LIMIT && (
                    <MoreToggle count={mine.length - CARD_LIMIT}>
                      {mine.slice(CARD_LIMIT).map(({ task }) => (
                        <CommitmentItem key={task.id} task={task} href={taskHome(task)} today={today} />
                      ))}
                    </MoreToggle>
                  )}
                </ul>
              )}
              {isMe && canPlan && (
                <Link href={planHref} className="card-edit small">{planLabel}</Link>
              )}
            </div>
          );
        })}
      </div>

      {query.task && <TaskPanel taskId={query.task} me={me} back={link(query.task)} closeHref={link(null)} />}
    </>
  );
}
