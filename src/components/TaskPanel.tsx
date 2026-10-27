import Link from "next/link";
import { db } from "@/lib/db";
import { activeWeek, addDays, formatDay, todayISO } from "@/lib/dates";
import { dependents } from "@/lib/guards";
import { can, type PermissionSet } from "@/lib/permissions";
import { googleCalendarUrl } from "@/lib/calendar";
import { copiesOf, isOnTask, pickable } from "@/lib/tasks";
import AssigneePicker from "./AssigneePicker";
import { AvatarStack } from "./AvatarStack";
import { Assignees, CommentBody, StatusText } from "./bits";
import { ConfirmButton, EscapeToClose } from "./client";
import { Icon } from "./icons";
import { Menu } from "./Menu";
import MentionInput from "./MentionInput";
import {
  addComment,
  addLink,
  claimTask,
  deleteTask,
  offerHelp,
  pingOwner,
  toggleThisWeek,
  removeLink,
  requestHelp,
  resolveHelpRequest,
  respondToOffer,
  setTaskStatus,
  updateTask,
} from "@/app/actions";

type Me = { id: string; kind: string } & PermissionSet;

const QUICK_STATUSES = [
  { value: "todo", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done ✓" },
];

// Opens over the current page (via ?task=) so you never lose your place.
// One row of main actions up top; everything occasional lives in the ⋯ menu.
export default async function TaskPanel({ taskId, me, back, closeHref }: { taskId: string; me: Me; back: string; closeHref: string }) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      owner: true,
      coOwners: { orderBy: { name: "asc" } },
      project: true,
      waitingOn: true,
      assignedBy: true,
      meeting: true,
      blocking: { include: { owner: true } },
      helpRequests: { include: { requestedBy: true }, orderBy: { createdAt: "desc" } },
      helpOffers: { include: { helper: true }, orderBy: { createdAt: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      links: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) return null;

  const today = todayISO();
  const manages = can(me, "canManageTasks") || (!!task.project && task.project.ownerId === me.id);
  const onIt = isOnTask(task, me.id);
  const canEdit = onIt || manages;
  const isOwner = task.ownerId === me.id;
  const canDelete = isOwner || manages;
  const isUpForGrabs = !task.ownerId;
  const isOpen = task.status !== "done" && task.status !== "dropped";
  const openRequests = task.helpRequests.filter((r) => r.status === "open");
  const liveOffers = task.helpOffers.filter((o) => o.status !== "declined");
  const myOffer = liveOffers.find((o) => o.helperId === me.id);
  const Back = () => <input type="hidden" name="back" value={back} />;

  // A task given to Everyone is one copy per person. Seen by someone else, it
  // reads as the whole group's task, not as whoever's copy happened to open.
  const copies = task.ownerId
    ? await db.task.findMany({ where: copiesOf(task), select: { status: true, owner: true }, orderBy: { owner: { name: "asc" } } })
    : [];
  // Who you can ping from here: everyone on this task, or with a copy of it.
  // People who already finished their copy start unticked.
  const pingable = [
    ...[task.owner, ...task.coOwners].flatMap((p) => (p ? [{ person: p, done: task.status === "done" }] : [])),
    ...copies.flatMap((c) => (c.owner ? [{ person: c.owner, done: c.status === "done" }] : [])),
  ].filter((p, i, all) => p.person.id !== me.id && all.findIndex((q) => q.person.id === p.person.id) === i);
  const shared = copies.length > 0;
  const everyoneView = shared && !onIt;
  const everyoneDone = [task, ...copies].filter((c) => c.status === "done").length;
  // Only managers edit or delete every copy at once.
  const copyCount = manages ? copies.length : 0;
  const [members, siblings] = canEdit
    ? await Promise.all([
        db.member.findMany({ where: { kind: "exec" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
        task.projectId
          ? db.task.findMany({ where: { projectId: task.projectId }, select: { id: true, title: true, waitingOnId: true }, orderBy: { createdAt: "asc" } })
          : Promise.resolve([]),
      ])
    : [[], []];
  // Tasks that already wait on this one can't be picked, or they'd form a loop.
  const loop = dependents(task.id, siblings);
  const waitable = siblings.filter((s) => s.id !== task.id && !loop.has(s.id));
  const gcal =
    task.due && isOpen
      ? googleCalendarUrl({ title: task.title, date: task.due, time: task.dueTime, details: [task.description, task.project?.title].filter(Boolean).join("\n\n"), path: `/?task=${task.id}` })
      : null;
  const [people, plannedWeeks] = await Promise.all([
    db.member.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // The people on it see their own card; everyone else sees the owner's.
    task.ownerId
      ? db.commitment.findMany({ where: { memberId: onIt ? me.id : task.ownerId, taskId: task.id, weekStart: { gte: activeWeek() } }, select: { weekStart: true } })
      : Promise.resolve([]),
  ]);
  const onMyWeek = plannedWeeks.some((c) => c.weekStart === activeWeek());
  const onNextWeek = plannedWeeks.some((c) => c.weekStart === addDays(activeWeek(), 7));
  const hasHelp = openRequests.length > 0 || liveOffers.length > 0;

  return (
    <>
      <EscapeToClose href={closeHref} />
      <Link href={closeHref} scroll={false} className="panel-backdrop" aria-label="Close panel" />
      <aside className="panel" role="dialog" aria-label={task.title}>
        <div className="panel-top">
          {task.project ? (
            <Link href={`/projects/${task.project.id}`} className="small panel-crumb"><Icon name="folder" size={14} /> {task.project.title}</Link>
          ) : (
            <span />
          )}
          <span className="row" style={{ gap: 2 }}>
            {(gcal || (canEdit && isOpen) || canDelete) && (
              <Menu label="More task actions">
                {gcal && (
                  <a href={gcal} target="_blank" rel="noreferrer noopener" className="menu-item"><Icon name="calendar" /> Add to Google Calendar</a>
                )}
                {canEdit && isOpen && (
                  <>
                    <form action={setTaskStatus} className="menu-panel stack">
                      <Back />
                      <input type="hidden" name="taskId" value={task.id} />
                      <input type="hidden" name="status" value="blocked" />
                      <input type="text" name="blockedReason" defaultValue={task.blockedReason} placeholder="What's in the way?" maxLength={300} aria-label="Why it's blocked" />
                      <button className="secondary small">Mark blocked</button>
                    </form>
                  </>
                )}
                {canDelete && (
                  <>
                    <div className="menu-sep" />
                    <form action={deleteTask}>
                      <input type="hidden" name="back" value={closeHref} />
                      <input type="hidden" name="taskId" value={task.id} />
                      <ConfirmButton message={`Delete “${task.title}”? Its comments and links go too. This can't be undone.`} className="menu-item danger">
                        <Icon name="trash" /> Delete task
                      </ConfirmButton>
                    </form>
                    {copyCount > 0 && (
                      <form action={deleteTask}>
                        <input type="hidden" name="back" value={closeHref} />
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="everyone" value="yes" />
                        <ConfirmButton message={`Delete “${task.title}” for all ${copyCount + 1} people? This can't be undone.`} className="menu-item danger">
                          <Icon name="trash" /> Delete for everyone ({copyCount + 1})
                        </ConfirmButton>
                      </form>
                    )}
                  </>
                )}
              </Menu>
            )}
            <Link href={closeHref} scroll={false} className="icon-button" aria-label="Close" title="Close (Esc)">✕</Link>
          </span>
        </div>

        <h2 className="panel-title">{task.title}</h2>
        <p className="small muted panel-meta" style={{ margin: 0 }}>
          {everyoneView ? (
            <>
              <span className="assignees">
                <AvatarStack people={[task.owner!, ...copies.flatMap((c) => (c.owner ? [c.owner] : []))]} size={20} max={4} />
                <span>Given to everyone · {everyoneDone} of {copies.length + 1} done</span>
              </span>
            </>
          ) : (
            <>
              <StatusText task={task} today={today} noDue />
              {" · "}
              {isOwner && !task.coOwners.length ? (shared ? "Your copy" : "You own this") : <Assignees task={task} meId={me.id} size={20} />}
            </>
          )}
          {task.due && ` · due ${formatDay(task.due)}${task.dueTime ? ` at ${timeLabel(task.dueTime)}` : ""}`}
          {isOwner && task.assignedBy && task.assignedById !== me.id && ` · from ${task.assignedBy.name}`}
        </p>
        {task.description && <p className="task-description">{task.description}</p>}
        {(task.waitingOn || task.blocking.length > 0 || task.meeting) && (
          <p className="small muted" style={{ marginTop: 4 }}>
            {task.waitingOn && <>Waits on {task.waitingOn.title}. </>}
            {task.blocking.length > 0 && <>Unblocks {task.blocking.map((b) => b.title).join(", ")}. </>}
            {task.meeting && <>From <Link href={`/meetings/${task.meeting.id}`}>{task.meeting.title}</Link>.</>}
          </p>
        )}

        {canEdit && isOpen && (
          <form action={setTaskStatus} className="segmented" style={{ marginTop: 14 }}>
            <Back />
            <input type="hidden" name="taskId" value={task.id} />
            {QUICK_STATUSES.map((s) => (
              <button key={s.value} name="status" value={s.value} className={task.status === s.value ? "" : "secondary"}>
                {s.label}
              </button>
            ))}
          </form>
        )}
        {onIt && isOpen && me.kind === "exec" && (
          <form action={toggleThisWeek} style={{ marginTop: 8 }}>
            <Back />
            <input type="hidden" name="taskId" value={task.id} />
            <button className="link small">{onMyWeek ? "✓ On your card this week · take it off" : "+ Add to your card this week"}</button>
          </form>
        )}
        {task.ownerId && isOpen && !everyoneView && (
          <p className="small muted" style={{ marginTop: 8 }}>
            {onIt
              ? onMyWeek ? "On your card this week." : "Not on your card this week."
              : onMyWeek ? "On the owner's card this week." : "Not on the owner's card this week."}
            {onNextWeek && " Planned for next week."}
            {onIt && !onMyWeek && <> You&apos;re still on it; add it above or choose it in <Link href="/checkin">your plan</Link>.</>}
          </p>
        )}
        {canEdit && isOpen && (
          <details className="offer" style={{ marginTop: 12 }}>
            <summary className="button secondary">Ask for help</summary>
            <form action={requestHelp} className="stack" style={{ marginTop: 8 }}>
              <Back />
              <input type="hidden" name="taskId" value={task.id} />
              <MentionInput name="message" people={people} placeholder="What would help? @mention someone if you like" required maxLength={300} ariaLabel="What help you need" />
              <button>Ask the board for help</button>
            </form>
          </details>
        )}
        {canEdit && !isOpen && (
          <form action={setTaskStatus} style={{ marginTop: 10 }}>
            <Back />
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="status" value="in_progress" />
            <button className="secondary small">Reopen</button>
          </form>
        )}
        {isUpForGrabs && isOpen && me.kind === "exec" && (
          <form action={claimTask} className="row" style={{ marginTop: 14 }}>
            <Back />
            <input type="hidden" name="taskId" value={task.id} />
            <button name="commit" value="yes">Take it on this week</button>
            <button name="commit" value="no" className="secondary">Take it, plan later</button>
          </form>
        )}
        {!isUpForGrabs && isOpen && ((!canEdit && !shared) || pingable.length > 0) && (
          <div className="row" style={{ marginTop: 14, alignItems: "flex-start" }}>
          {!canEdit && !shared && (
          <details className="offer" open={!!myOffer || undefined}>
            <summary className="button secondary">I can help</summary>
            <form action={offerHelp} className="stack" style={{ marginTop: 8 }}>
              <Back />
              <input type="hidden" name="taskId" value={task.id} />
              <input type="text" name="contribution" defaultValue={myOffer?.contribution} placeholder="What will you do? e.g. Draft the email by Wed" required maxLength={300} aria-label="What you'll do" />
              <button>{myOffer ? "Update offer" : "Send offer"}</button>
            </form>
          </details>
          )}
          {pingable.length > 0 && (
            <Menu
              label="Ping people on this task"
              align="left"
              trigger={<span className="button secondary">{pingable.length === 1 ? `Ping ${pingable[0].person.name.split(/\s+/)[0]}` : "Ping…"}</span>}
            >
              <form action={pingOwner} className="menu-panel stack">
                <Back />
                <input type="hidden" name="taskId" value={task.id} />
                {pingable.length === 1 ? (
                  <input type="hidden" name="toId" value={pingable[0].person.id} />
                ) : (
                  <div className="ping-pick">
                    {pingable.map(({ person, done }) => (
                      <label key={person.id} className="inline">
                        <input type="checkbox" name="toId" value={person.id} defaultChecked={!done} />
                        <AvatarStack people={[person]} size={20} />
                        {person.name}
                        {done && <span className="muted small">· done</span>}
                      </label>
                    ))}
                  </div>
                )}
                <input type="text" name="message" maxLength={200} placeholder="Optional note, e.g. any update?" aria-label="Note" />
                <button className="small">Send ping</button>
              </form>
            </Menu>
          )}
          </div>
        )}

        {hasHelp && (
          <section>
            <h3>Help</h3>
            {openRequests.map((r) => (
              <div key={r.id} className="help-item">
                <span><strong>{r.requestedBy.name} asked:</strong> {r.message}</span>
                {canEdit && (
                  <form action={resolveHelpRequest}>
                    <Back />
                    <input type="hidden" name="requestId" value={r.id} />
                    <button className="link small">Handled</button>
                  </form>
                )}
              </div>
            ))}
            {liveOffers.map((o) => (
              <div key={o.id} className="help-item">
                <span>
                  <strong>{o.helperId === me.id ? "You" : o.helper.name}:</strong> {o.contribution}{" "}
                  <span className="muted">{o.status === "accepted" ? "· accepted" : "· waiting for a reply"}</span>
                </span>
                {canEdit && isOpen && o.status === "offered" && (
                  <form action={respondToOffer} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <Back />
                    <input type="hidden" name="offerId" value={o.id} />
                    <button name="response" value="accept" className="small">Accept</button>
                    <button name="response" value="decline" className="secondary small">Covered</button>
                  </form>
                )}
              </div>
            ))}
          </section>
        )}

        <section>
          <h3>Files</h3>
          {task.links.map((l) => (
            <div key={l.id} className="file-row">
              <Icon name="link" />
              <a href={l.url} target="_blank" rel="noreferrer noopener">{l.title}</a>
              {(manages || l.addedById === me.id || onIt) && (
                <form action={removeLink} className="hover-reveal">
                  <Back />
                  <input type="hidden" name="linkId" value={l.id} />
                  <button className="link small muted">Remove</button>
                </form>
              )}
            </div>
          ))}
          <Menu label="Add a link" align="left" trigger={<span className="small add-link"><Icon name="plus" size={16} /> Add a link</span>}>
            <form action={addLink} className="menu-panel stack">
              <Back />
              <input type="hidden" name="taskId" value={task.id} />
              <input type="url" name="url" placeholder="Any web link: Drive, Docs, Canva, Notion…" required maxLength={2000} />
              <input type="text" name="title" placeholder="Name (optional)" maxLength={160} />
              <button>Add link</button>
            </form>
          </Menu>
        </section>

        <section>
          <h3>Discussion</h3>
          {task.comments.map((c) => (
            <div key={c.id} className="small" style={{ marginBottom: 10 }}>
              <strong>{c.author.name}</strong>{" "}
              <span className="muted">{c.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <CommentBody body={c.body} />
            </div>
          ))}
          <form action={addComment} className="row" style={{ flexWrap: "nowrap" }}>
            <Back />
            <input type="hidden" name="taskId" value={task.id} />
            <MentionInput name="body" people={people} placeholder="Comment, or @mention to ping" required maxLength={4000} ariaLabel="Comment" />
            <button className="secondary">Post</button>
          </form>
        </section>

        {canEdit && (
          <details className="quiet-section" style={{ marginTop: 18 }}>
            <summary>Edit details</summary>
            <form action={updateTask} className="stack" style={{ marginTop: 8 }}>
              <Back />
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="status" value={task.status} />
              <input type="hidden" name="blockedReason" value={task.blockedReason} />
              <label>Outcome<input type="text" name="title" defaultValue={task.title} maxLength={160} /></label>
              <label>Description<textarea name="description" defaultValue={task.description} maxLength={4000} placeholder="Details, context, links to look at" /></label>

              <div>
                <span className="field-label">Assigned to</span>
                {/* Opens on how the task was given out, so an Everyone task stays Everyone. */}
                <AssigneePicker
                  people={pickable(members)}
                  meId={me.id}
                  initial={task.ownerId ? [task.ownerId, ...task.coOwners.map((c) => c.id)] : []}
                  allowEveryone={manages}
                  initialEveryone={manages && shared}
                />
                {manages && shared && (
                  <p className="small muted" style={{ margin: "4px 0 0" }}>Saving as Everyone updates every copy; each person keeps their own progress.</p>
                )}
              </div>
              <div className="grid2">
                <label>Due<input type="date" name="due" defaultValue={task.due ?? ""} /></label>
                <label>Time<input type="time" name="dueTime" defaultValue={task.dueTime ?? ""} /></label>
              </div>
              {waitable.length > 0 && (
                <label>
                  Can&apos;t start until
                  <select name="waitingOnId" defaultValue={task.waitingOnId ?? ""}>
                    <option value="">Nothing</option>
                    {waitable.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </label>
              )}
              <button>Save</button>
            </form>
          </details>
        )}
      </aside>
    </>
  );
}

function timeLabel(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
