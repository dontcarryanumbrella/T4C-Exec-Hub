import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell";
import { requireMember } from "@/lib/auth";
import { activeWeek, addDays, formatDay, todayISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { taskStatus } from "@/lib/status";
import { Assignees, StatusText, withTask } from "@/components/bits";
import AssigneePicker from "@/components/AssigneePicker";
import { pickable } from "@/lib/tasks";
import { ConfirmButton } from "@/components/client";
import TaskPanel from "@/components/TaskPanel";
import MentionInput from "@/components/MentionInput";
import { addActionItem, deleteMeeting, updateMeeting } from "../../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const m = await db.meeting.findUnique({ where: { id: (await params).id }, select: { title: true, date: true } });
  return { title: m ? `${m.title}, ${formatDay(m.date)} · T4C Exec Hub` : "Meeting · T4C Exec Hub" };
}

// The meeting responds to the board rather than rereading it: only blocked
// or overdue work, open help requests, proposals, and the week's deadlines.
async function boardAgenda(today: string) {
  const [open, requests, proposals, members, checkIns] = await Promise.all([
    db.task.findMany({
      where: { status: { notIn: ["done", "dropped"] }, OR: [{ project: null }, { project: { status: "active" } }] },
      include: { owner: true, waitingOn: true, helpRequests: true },
      orderBy: { due: "asc" },
    }),
    db.helpRequest.findMany({
      where: { status: "open", task: { status: { notIn: ["done", "dropped"] } } },
      include: { task: { include: { owner: true } } },
    }),
    db.project.findMany({ where: { status: "proposed" }, include: { proposedBy: true } }),
    db.member.count({ where: { kind: "exec" } }),
    db.checkIn.count({ where: { weekStart: activeWeek() } }),
  ]);
  const stuck = open.filter((t) => {
    const text = taskStatus({ ...t, helpRequests: [] }, today).text;
    return text.startsWith("Blocked") || text.startsWith("Overdue");
  });
  const dueSoon = open.filter((t) => t.due && t.due >= today && t.due <= addDays(today, 7));
  const upForGrabs = open.filter((t) => !t.ownerId);
  return { stuck, requests, proposals, dueSoon, upForGrabs, checkIns, members };
}

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const me = await requireMember();
  const { id } = await params;
  const query = await searchParams;
  const today = todayISO();
  const path = `/meetings/${id}`;
  const link = (taskId: string | null) => withTask(path, {}, taskId);
  const boardLink = (taskId: string) => `${path}?task=${taskId}`;

  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      createdBy: true,
      tasks: { include: { owner: true, coOwners: true, waitingOn: true, helpRequests: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!meeting) notFound();
  const canWrite = can(me, "canWriteNotes");
  // Live agenda only makes sense for today's or an upcoming meeting.
  const agenda = meeting.date >= addDays(today, -1) ? await boardAgenda(today) : null;
  const people = await db.member.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const [execs, projects] = canWrite
    ? await Promise.all([
        db.member.findMany({ where: { kind: "exec" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
        db.project.findMany({ where: { status: "active" }, orderBy: [{ kind: "desc" }, { title: "asc" }] }),
      ])
    : [[], []];
  const who = (o: { name: string } | null, ownerId: string | null) => (ownerId === me.id ? "you" : (o?.name ?? "up for grabs"));

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader title={meeting.title} back={{ href: "/meetings", label: "Meetings" }} sub={<>{formatDay(meeting.date)}
        {meeting.createdBy && ` · notes by ${meeting.createdBy.name}`}</>} />

      {agenda && (
        <div className="box" style={{ marginTop: 12 }}>
          <h2>Agenda from the board</h2>
          <div className="grid2">
            <div>
              <h3>Stuck or overdue</h3>
              {agenda.stuck.length === 0 ? <p className="small muted">Nothing stuck.</p> : agenda.stuck.slice(0, 8).map((t) => (
                <p key={t.id} className="small">
                  <Link href={boardLink(t.id)} scroll={false}>{t.title}</Link> · {who(t.owner, t.ownerId)} · <StatusText task={t} today={today} />
                </p>
              ))}
              <h3 style={{ marginTop: 10 }}>Asking for help</h3>
              {agenda.requests.length === 0 ? <p className="small muted">No open requests.</p> : agenda.requests.map((r) => (
                <p key={r.id} className="small">
                  <strong>{who(r.task.owner, r.task.ownerId)}:</strong> {r.message} (<Link href={boardLink(r.taskId)} scroll={false}>{r.task.title}</Link>)
                </p>
              ))}
            </div>
            <div>
              <h3>Needs a decision</h3>
              {agenda.proposals.length === 0 ? <p className="small muted">No proposals waiting.</p> : agenda.proposals.map((p) => (
                <p key={p.id} className="small"><Link href={`/projects/${p.id}`}>{p.title}</Link> · proposed by {p.proposedBy?.name ?? "someone"}</p>
              ))}
              {agenda.upForGrabs.length > 0 && (
                <p className="small"><strong>{agenda.upForGrabs.length} task{agenda.upForGrabs.length === 1 ? "" : "s"} up for grabs.</strong> Who takes them?</p>
              )}
              <h3 style={{ marginTop: 10 }}>Due in the next 7 days</h3>
              {agenda.dueSoon.length === 0 ? <p className="small muted">Nothing due.</p> : agenda.dueSoon.slice(0, 8).map((t) => (
                <p key={t.id} className="small">
                  <strong>{formatDay(t.due!)}</strong> · <Link href={boardLink(t.id)} scroll={false}>{t.title}</Link> · {who(t.owner, t.ownerId)}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 22 }}>Notes</h2>
      {canWrite ? (
        <form action={updateMeeting} className="stack">
          <input type="hidden" name="meetingId" value={meeting.id} />
          <input type="hidden" name="back" value={path} />
          <div className="grid2">
            <label>Meeting name<input type="text" name="title" defaultValue={meeting.title} maxLength={120} /></label>
            <div className="grid2">
              <label>Date<input type="date" name="date" defaultValue={meeting.date} /></label>
              <label>Time<input type="time" name="time" defaultValue={meeting.time ?? ""} /></label>
            </div>
          </div>
          <label>
            Notes
            <MentionInput name="notes" people={people} multiline defaultValue={meeting.notes} maxLength={20000} minHeight={180} placeholder="What was discussed. @mention someone to ping them." ariaLabel="Notes" />
          </label>
          <label>
            Decisions
            <MentionInput name="decisions" people={people} multiline defaultValue={meeting.decisions} maxLength={4000} placeholder="One per line, e.g. We'll co-host the hackathon with Sanford in March." ariaLabel="Decisions" />
          </label>
          <button>Save notes</button>
        </form>
      ) : (
        <>
          {meeting.notes ? <div className="box" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{meeting.notes}</div> : <p className="muted small">No notes yet.</p>}
          {meeting.decisions && (
            <>
              <h3 style={{ marginTop: 12 }}>Decisions</h3>
              <div className="box" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{meeting.decisions}</div>
            </>
          )}
        </>
      )}

      <h2 style={{ marginTop: 22 }}>Action items</h2>
      {meeting.tasks.length > 0 && (
        <table>
          <thead>
            <tr><th>Outcome</th><th>Owner</th><th>Due</th><th>Status</th></tr>
          </thead>
          <tbody>
            {meeting.tasks.map((t) => (
              <tr key={t.id}>
                <td><Link href={link(t.id)} scroll={false}>{t.title}</Link></td>
                <td><Assignees task={t} meId={me.id} /></td>
                <td>{t.due ? formatDay(t.due) : "—"}</td>
                <td><StatusText task={t} today={today} noDue /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canWrite && (
        <form action={addActionItem} className="add-task">
          <input type="hidden" name="meetingId" value={meeting.id} />
          <input type="hidden" name="back" value={path} />
          <div className="row">
            <input type="text" name="title" required maxLength={160} placeholder="Action item, e.g. Email Sanford about co-hosting" aria-label="Action item" style={{ flex: 3, minWidth: 220 }} />
            <AssigneePicker people={pickable(execs)} meId={me.id} allowEveryone />
            <input type="date" name="due" aria-label="Due date (optional)" title="Due date (optional)" style={{ flex: 1, minWidth: 130 }} />
            <button>Add</button>
          </div>
          <p className="small muted">Assigned tasks due by Sunday, or with no date, join the owner's current card if it has room. Later deadlines stay in check-in.</p>
          {projects.length > 0 && (
            <details>
              <summary className="small">Put it in a folder or project (default: Club Operations)</summary>
              <select name="projectId" defaultValue="" aria-label="Folder or project" style={{ marginTop: 6, maxWidth: 320 }}>
                <option value="">Club Operations</option>
                {projects.filter((p) => p.title !== "Club Operations").map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </details>
          )}
        </form>
      )}

      {canWrite && (
        <form action={deleteMeeting} style={{ marginTop: 28 }}>
          <input type="hidden" name="meetingId" value={meeting.id} />
          <ConfirmButton message="Delete this meeting's notes? Its action items stay on the board." className="link small muted">
            Delete this meeting
          </ConfirmButton>
        </form>
      )}

      {query.task && <TaskPanel taskId={query.task} me={me} back={link(query.task)} closeHref={link(null)} />}
    </div>
  );
}
