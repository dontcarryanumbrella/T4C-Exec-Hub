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
import { Icon } from "@/components/icons";
import { Menu } from "@/components/Menu";
import AssigneePicker from "@/components/AssigneePicker";
import { copiesLabel, groupCopies, pickable } from "@/lib/tasks";
import { ConfirmButton } from "@/components/client";
import TaskPanel from "@/components/TaskPanel";
import MentionInput from "@/components/MentionInput";
import { addActionItem, addLink, deleteMeeting, removeLink, updateMeeting } from "../../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const m = await db.meeting.findUnique({ where: { id: (await params).id }, select: { title: true, date: true } });
  return { title: m ? `${m.title}, ${formatDay(m.date)} · T4C Exec Hub` : "Meeting · T4C Exec Hub" };
}

// The meeting responds to the board rather than rereading it: blocked or
// overdue work, open help requests, proposals, project deadlines, and the
// open work in the General folders.
async function boardAgenda(today: string) {
  const [open, requests, proposals, deadlines, members, checkIns] = await Promise.all([
    db.task.findMany({
      where: { status: { notIn: ["done", "dropped"] }, OR: [{ project: null }, { project: { status: "active" } }] },
      include: { owner: true, waitingOn: true, helpRequests: true, project: { select: { title: true, kind: true } } },
      orderBy: { due: "asc" },
    }),
    db.helpRequest.findMany({
      where: { status: "open", task: { status: { notIn: ["done", "dropped"] } } },
      include: { task: { include: { owner: true } } },
    }),
    db.project.findMany({ where: { status: "proposed" }, include: { proposedBy: true } }),
    db.project.findMany({ where: { status: "active", kind: "project", due: { not: null } }, orderBy: { due: "asc" } }),
    db.member.count({ where: { kind: "exec" } }),
    db.checkIn.count({ where: { weekStart: activeWeek() } }),
  ]);
  const stuck = open.filter((t) => {
    const text = taskStatus({ ...t, helpRequests: [] }, today).text;
    return text.startsWith("Blocked") || text.startsWith("Overdue");
  });
  const stuckIds = new Set(stuck.map((t) => t.id));
  // Lists below show a task given to Everyone once.
  const stuckRows = groupCopies(stuck, "");
  // Dated work first, soonest at the top; undated work after.
  const inFolders = open
    .filter((t) => t.project?.kind === "folder" && !stuckIds.has(t.id))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const upForGrabs = open.filter((t) => !t.ownerId);
  return { stuck: stuckRows, requests, proposals, deadlines, inFolders: groupCopies(inFolders, ""), upForGrabs, checkIns, members };
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
      links: { orderBy: { createdAt: "asc" } },
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
  const execCount = agenda?.members ?? (await db.member.count({ where: { kind: "exec" } }));
  // A row's people: one person, or how many share a task given to Everyone.
  const whoRow = (r: { task: { owner: { name: string } | null; ownerId: string | null }; copies: unknown[] }) =>
    r.copies.length > 1 ? copiesLabel(r.copies.length, execCount) : who(r.task.owner, r.task.ownerId);
  const actionItems = groupCopies(meeting.tasks, me.id);

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader title={meeting.title} back={{ href: "/meetings", label: "Meetings" }} sub={<>{formatDay(meeting.date)}
        {meeting.createdBy && ` · notes by ${meeting.createdBy.name}`}</>} />

      {canWrite && (
        <form action={updateMeeting} className="row meeting-details" style={{ marginTop: 12 }}>
          <input type="hidden" name="meetingId" value={meeting.id} />
          <input type="hidden" name="back" value={path} />
          <input type="hidden" name="notes" value={meeting.notes} />
          <input type="hidden" name="decisions" value={meeting.decisions} />
          <label style={{ flex: 3, minWidth: 200, margin: 0 }}>Meeting name<input type="text" name="title" defaultValue={meeting.title} maxLength={120} /></label>
          <label style={{ flex: 1, minWidth: 140, margin: 0 }}>Date<input type="date" name="date" defaultValue={meeting.date} /></label>
          <label style={{ flex: 1, minWidth: 120, margin: 0 }}>Time<input type="time" name="time" defaultValue={meeting.time ?? ""} /></label>
          <button className="secondary" style={{ alignSelf: "flex-end" }}>Save</button>
        </form>
      )}

      {/* The real notes live in a doc; this is where everyone finds it. */}
      <div className="box meeting-links" style={{ marginTop: 14 }}>
        <h2 style={{ margin: 0 }}>Notes &amp; links</h2>
        {meeting.links.length === 0 && <p className="small muted" style={{ margin: "6px 0 0" }}>No links yet. Add the meeting&apos;s notes doc so everyone can find it.</p>}
        {meeting.links.map((l) => (
          <div key={l.id} className="file-row">
            <Icon name="link" />
            <a href={l.url} target="_blank" rel="noreferrer noopener">{l.title}</a>
            {(canWrite || l.addedById === me.id) && (
              <form action={removeLink} className="hover-reveal">
                <input type="hidden" name="back" value={path} />
                <input type="hidden" name="linkId" value={l.id} />
                <ConfirmButton message="Remove this link?" className="link small muted">Remove</ConfirmButton>
              </form>
            )}
          </div>
        ))}
        <Menu label="Add a link" align="left" trigger={<span className="small add-link"><Icon name="plus" size={16} /> Add a link</span>}>
          <form action={addLink} className="menu-panel stack">
            <input type="hidden" name="back" value={path} />
            <input type="hidden" name="meetingId" value={meeting.id} />
            <input type="url" name="url" placeholder="Notes doc, slides, recording…" required maxLength={2000} />
            <input type="text" name="title" placeholder="Name (optional), e.g. Meeting notes" maxLength={160} />
            <button>Add link</button>
          </form>
        </Menu>
      </div>

      {agenda && (
        <div className="box" style={{ marginTop: 22 }}>
          <h2>Agenda from the board</h2>
          <div className="grid2">
            <div>
              <h3>Stuck or overdue</h3>
              {agenda.stuck.length === 0 ? <p className="small muted">Nothing stuck.</p> : agenda.stuck.slice(0, 8).map((r) => (
                <p key={r.task.id} className="small">
                  <Link href={boardLink(r.task.id)} scroll={false}>{r.task.title}</Link> · {whoRow(r)} · <StatusText task={r.task} today={today} />
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
              <h3 style={{ marginTop: 10 }}>Project deadlines</h3>
              {agenda.deadlines.length === 0 ? <p className="small muted">No project deadlines.</p> : agenda.deadlines.slice(0, 6).map((p) => (
                <p key={p.id} className="small">
                  <strong className={p.due! < today ? "status attention" : undefined}>{p.due! < today ? `Overdue (${formatDay(p.due!)})` : formatDay(p.due!)}</strong> · <Link href={`/projects/${p.id}`}>{p.title}</Link>
                </p>
              ))}
            </div>
          </div>
          <h3 style={{ marginTop: 10 }}>In the General folders</h3>
          {agenda.inFolders.length === 0 ? <p className="small muted">No open tasks in the General folders.</p> : (
            <>
              {agenda.inFolders.slice(0, 8).map((r) => (
                <p key={r.task.id} className="small">
                  {r.task.due && <><strong>{formatDay(r.task.due)}</strong> · </>}
                  <Link href={boardLink(r.task.id)} scroll={false}>{r.task.title}</Link> · {r.task.project?.title} · {whoRow(r)}
                </p>
              ))}
              {agenda.inFolders.length > 8 && <p className="small muted">…and {agenda.inFolders.length - 8} more in the folders.</p>}
            </>
          )}
        </div>
      )}

      <h2 style={{ marginTop: 22 }}>Action items</h2>
      {actionItems.length > 0 && (
        <table>
          <thead>
            <tr><th>Outcome</th><th>Owner</th><th>Due</th><th>Status</th></tr>
          </thead>
          <tbody>
            {actionItems.map(({ task: t, copies }) => (
              <tr key={t.id}>
                <td><Link href={link(t.id)} scroll={false}>{t.title}</Link></td>
                <td>{copies.length > 1 ? copiesLabel(copies.length, execCount) : <Assignees task={t} meId={me.id} />}</td>
                <td>{t.due ? formatDay(t.due) : "—"}</td>
                <td>
                  {copies.length > 1
                    ? `${copies.filter((c) => c.status === "done").length} of ${copies.length} done`
                    : <StatusText task={t} today={today} noDue />}
                </td>
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

      <h2 style={{ marginTop: 22 }}>Written notes</h2>
      {canWrite ? (
        <details className="box" open={!!(meeting.notes || meeting.decisions) || undefined}>
          <summary className="small">Notes and decisions (optional; keep the main notes in the linked doc)</summary>
          <form action={updateMeeting} className="stack" style={{ marginTop: 10 }}>
            <input type="hidden" name="meetingId" value={meeting.id} />
            <input type="hidden" name="back" value={path} />
            <input type="hidden" name="title" value={meeting.title} />
            <input type="hidden" name="date" value={meeting.date} />
            <input type="hidden" name="time" value={meeting.time ?? ""} />
            <label>
              Notes
              <MentionInput name="notes" people={people} multiline defaultValue={meeting.notes} maxLength={20000} minHeight={140} placeholder="Anything worth keeping here. @mention someone to ping them." ariaLabel="Notes" />
            </label>
            <label>
              Decisions
              <MentionInput name="decisions" people={people} multiline defaultValue={meeting.decisions} maxLength={4000} placeholder="One per line, e.g. We'll co-host the hackathon with Sanford in March." ariaLabel="Decisions" />
            </label>
            <button className="secondary">Save notes</button>
          </form>
        </details>
      ) : meeting.notes || meeting.decisions ? (
        <div className="box">
          {meeting.notes && <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{meeting.notes}</div>}
          {meeting.decisions && (
            <>
              <h3 style={{ marginTop: meeting.notes ? 12 : 0 }}>Decisions</h3>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{meeting.decisions}</div>
            </>
          )}
        </div>
      ) : (
        <p className="muted small">None. The notes live in the linked doc.</p>
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
