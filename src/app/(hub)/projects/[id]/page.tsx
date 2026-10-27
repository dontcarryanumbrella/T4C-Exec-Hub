import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { formatDay, todayISO } from "@/lib/dates";
import { projectBrief } from "@/lib/status";
import { can } from "@/lib/permissions";
import AssigneePicker from "@/components/AssigneePicker";
import { copiesLabel, groupCopies, leadsProject, pickable } from "@/lib/tasks";
import { Assignees } from "@/components/bits";
import { AvatarStack } from "@/components/AvatarStack";
import { isBuiltInFolder } from "@/lib/folders";
import { CommentBody, StatusText, withTask } from "@/components/bits";
import TaskPanel from "@/components/TaskPanel";
import { ConfirmButton } from "@/components/client";
import { PageHeader } from "@/components/shell";
import { Icon } from "@/components/icons";
import { Menu } from "@/components/Menu";
import MentionInput from "@/components/MentionInput";
import {
  addComment,
  addLink,
  approveProposal,
  createTask,
  declineProposal,
  deleteProject,
  removeLink,
  updateProject,
} from "../../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const project = await db.project.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: `${project?.title ?? "Project"} · T4C Exec Hub` };
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string; edit?: string }>;
}) {
  const me = await requireMember();
  const { id } = await params;
  const query = await searchParams;
  const today = todayISO();
  const path = `/projects/${id}`;
  const link = (taskId: string | null) => withTask(path, {}, taskId);

  const project = await db.project.findUnique({
    where: { id },
    include: {
      owner: true,
      coOwners: { orderBy: { name: "asc" } },
      proposedBy: true,
      tasks: { include: { owner: true, coOwners: true, waitingOn: true, helpRequests: true }, orderBy: { createdAt: "asc" } },
      links: { orderBy: { createdAt: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();
  const [execs, people] = await Promise.all([
    db.member.findMany({ where: { kind: "exec" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.member.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const isExec = me.kind === "exec";
  const isFolder = project.kind === "folder";
  const leads = leadsProject(project, me.id);
  const manages = can(me, "canManageTasks") || leads;
  const canEdit = (manages || can(me, "canCreateProjects")) && (project.status === "active" || project.status === "done");
  const canDelete =
    !isBuiltInFolder(project) && (leads || can(me, "canCreateProjects") || (project.status === "proposed" && project.proposedById === me.id));
  const back = link(query.task ?? null);
  const finished = (s: string) => s === "done" || s === "dropped";
  const brief = projectBrief(project.tasks, today);
  const rows = groupCopies(project.tasks, me.id)
    .map((r) => ({ ...r, finished: r.copies.every((c) => finished(c.status)) }))
    .sort((a, b) => Number(a.finished) - Number(b.finished));
  const tasks = project.tasks;
  // Hidden fields that keep the rest of the project as it is when only one thing changes.
  const Keep = () => (
    <>
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="back" value={path} />
      <input type="hidden" name="title" value={project.title} />
      <input type="hidden" name="goal" value={project.goal} />
      <input type="hidden" name="due" value={project.due ?? ""} />
      <input type="hidden" name="ownerId" value={project.ownerId ?? ""} />
      {project.coOwners.map((c) => <input key={c.id} type="hidden" name="coOwnerId" value={c.id} />)}
    </>
  );

  return (
    <>
      <PageHeader
        title={project.title}
        back={{ href: "/projects", label: "Folders" }}
        sub={
          <>
            {isFolder ? "General folder" : ({ proposed: "Idea", done: "Done", declined: "Not now" }[project.status] ?? "Active")}
            {project.owner && <> · {project.ownerId === me.id && !project.coOwners.length ? "You own this" : <Assignees task={project} meId={me.id} size={20} />}</>}
            {project.due && ` · Due ${formatDay(project.due)}`}
            {project.proposedBy && ` · Idea by ${project.proposedBy.id === me.id ? "you" : project.proposedBy.name}`}
          </>
        }
        actions={
          (canEdit || canDelete) && (
            <Menu label="Project actions">
              {canEdit && (
                <Link href={`${path}?edit=1`} className="menu-item"><Icon name="notes" /> Edit details</Link>
              )}
              {canEdit && !isFolder && project.status === "active" && (
                <form action={updateProject}>
                  <Keep />
                  <input type="hidden" name="status" value="done" />
                  <button className="menu-item"><Icon name="check" /> Mark project done</button>
                </form>
              )}
              {canEdit && project.status === "done" && (
                <form action={updateProject}>
                  <Keep />
                  <input type="hidden" name="status" value="active" />
                  <button className="menu-item"><Icon name="left" /> Reopen project</button>
                </form>
              )}
              {canDelete && (
                <form action={deleteProject}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <ConfirmButton
                    message={`Delete “${project.title}”${project.tasks.length ? ` and its ${project.tasks.length} task${project.tasks.length === 1 ? "" : "s"}` : ""}? This can't be undone.`}
                    className="menu-item danger"
                  >
                    <Icon name="trash" /> Delete folder
                  </ConfirmButton>
                </form>
              )}
            </Menu>
          )
        }
      />

      {query.edit && canEdit && (
        <form action={updateProject} className="box stack" style={{ maxWidth: 560, margin: "12px 0" }}>
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="back" value={path} />
          <input type="hidden" name="status" value={project.status} />
          <label>Name<input type="text" name="title" defaultValue={project.title} maxLength={160} /></label>
          <label>Goal<input type="text" name="goal" defaultValue={project.goal} maxLength={300} /></label>
          <div className="grid2">
            <div>
              <span className="field-label">Owners</span>
              <AssigneePicker
                people={pickable(execs)}
                meId={me.id}
                initial={project.ownerId ? [project.ownerId, ...project.coOwners.map((c) => c.id)] : [me.id]}
                allowNone={false}
                label="Owners"
              />
            </div>
            <label>Due<input type="date" name="due" defaultValue={project.due ?? ""} /></label>
          </div>
          <div className="row">
            <button>Save</button>
            <Link href={path} className="button secondary">Cancel</Link>
          </div>
        </form>
      )}

      {project.status === "proposed" &&
        (can(me, "canApprove") ? (
          <div className="notice">
            <strong>Approve this idea?</strong>
            <div className="row" style={{ marginTop: 8 }}>
              <form action={approveProposal} className="row">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="back" value={path} />
                <select name="ownerId" defaultValue={project.proposedBy?.kind === "exec" ? project.proposedBy.id : me.id} aria-label="Owner" style={{ width: "auto" }}>
                  {execs.map((m) => <option key={m.id} value={m.id}>{m.id === me.id ? "You" : m.name} will own it</option>)}
                </select>
                <button>Approve</button>
              </form>
              <Menu label="Decline" trigger={<span className="button secondary">Not now</span>} align="left">
                <form action={declineProposal} className="menu-panel stack">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="back" value="/projects" />
                  <input type="text" name="reason" maxLength={300} placeholder="A kind reason (optional)" />
                  <button className="secondary">Decline for now</button>
                </form>
              </Menu>
            </div>
          </div>
        ) : (
          <div className="notice">Waiting for an approver. Add thoughts in the discussion below.</div>
        ))}
      {project.goal && <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{project.goal}</p>}

      <div className="section-title">
        <h2>Tasks</h2>
        {tasks.length > 0 && (
          <span className="muted small">
            {brief.progress}
            {brief.attention > 0 && <> · <span className="status attention">{brief.attention} need attention</span></>}
          </span>
        )}
      </div>
      {tasks.length > 0 && (
        <div className="list">
          {rows.map(({ task: t, copies, finished: allDone }) => {
            const shared = copies.length > 1;
            const doneCount = copies.filter((c) => c.status === "done").length;
            const mine = shared && t.ownerId === me.id;
            return (
              <Link key={t.id} href={link(t.id)} scroll={false} className={`list-row cols-task${allDone ? " is-finished" : ""}`}>
                <span className="name">
                  <Icon name={allDone && doneCount ? "check" : t.isMilestone ? "flag" : "circle"} />
                  <span title={t.isMilestone ? "Milestone" : undefined}>{t.title}</span>
                </span>
                <span className="cell optional">
                  {shared ? (
                    <span className="assignees">
                      <AvatarStack people={copies.flatMap((c) => (c.owner ? [c.owner] : []))} size={22} max={4} />
                      <span>{copiesLabel(copies.length, execs.length)}</span>
                    </span>
                  ) : t.owner ? (
                    <Assignees task={t} meId={me.id} />
                  ) : (
                    <span className="chip blue">Up for grabs</span>
                  )}
                </span>
                <span className="cell optional">{t.due ? formatDay(t.due) : ""}</span>
                <span className="cell">
                  {shared ? (
                    <span className={`status ${allDone ? "done" : "muted"}`} title={mine ? "Opens your copy" : undefined}>
                      {doneCount} of {copies.length} done
                    </span>
                  ) : (
                    <StatusText task={t} today={today} short />
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {isExec && project.status === "active" && (
        <form action={createTask} className="add-task" id="add-task">
          <input type="hidden" name="back" value={path} />
          <input type="hidden" name="projectId" value={project.id} />
          <div className="row">
            <input type="text" name="title" required maxLength={160} placeholder={tasks.length ? "Add a task" : "Add the first task, e.g. Confirm a speaker and date"} aria-label="New task" style={{ flex: 3, minWidth: 200 }} />
            {manages && <AssigneePicker people={pickable(execs)} meId={me.id} allowEveryone />}
            <input type="date" name="due" aria-label="Due date (optional)" title="Due date (optional)" style={{ flex: 1, minWidth: 130 }} />
            <button>Add</button>
          </div>
          <p className="small muted">Assigned tasks due by Sunday, or with no date, join the owner's current card if it has room. Later deadlines stay in check-in.</p>
          <details>
            <summary className="small">More options</summary>
            <div className="row" style={{ marginTop: 6 }}>
              {project.tasks.length > 0 && (
                <label style={{ flex: 1, margin: 0 }}>
                  Can&apos;t start until
                  <select name="waitingOnId" defaultValue="">
                    <option value="">Nothing</option>
                    {rows.map(({ task: t }) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </label>
              )}
              <label style={{ flex: 1, margin: 0 }}>Time<input type="time" name="dueTime" /></label>
            </div>

            <div style={{ marginTop: 8 }}>
              <label style={{ margin: 0 }}>Description<textarea name="description" maxLength={4000} placeholder="Details or context (optional)" /></label>
            </div>
          </details>
        </form>
      )}

      <div className="grid2" style={{ marginTop: 28 }}>
        <div>
          <h2>Files</h2>
          {project.links.map((l) => (
            <div key={l.id} className="file-row">
              <Icon name="link" />
              <a href={l.url} target="_blank" rel="noreferrer noopener">{l.title}</a>
              {(manages || l.addedById === me.id) && (
                <form action={removeLink} className="hover-reveal">
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="linkId" value={l.id} />
                  <ConfirmButton message="Remove this link?" className="link small muted">Remove</ConfirmButton>
                </form>
              )}
            </div>
          ))}
          <Menu label="Add a link" align="left" trigger={<span className="small add-link"><Icon name="plus" size={16} /> Add a link</span>}>
            <form action={addLink} className="menu-panel stack">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="projectId" value={project.id} />
              <input type="url" name="url" placeholder="Any web link: Drive, Docs, Canva, Notion…" required maxLength={2000} />
              <input type="text" name="title" placeholder="Name (optional)" maxLength={160} />
              <button>Add link</button>
            </form>
          </Menu>
        </div>
        <div>
          <h2>Discussion</h2>
          {project.comments.map((c) => (
            <div key={c.id} className="small" style={{ marginBottom: 10 }}>
              <strong>{c.author.name}</strong>{" "}
              <span className="muted">{c.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <CommentBody body={c.body} />
            </div>
          ))}
          <form action={addComment} className="row" style={{ flexWrap: "nowrap" }}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="projectId" value={project.id} />
            <MentionInput name="body" people={people} placeholder="Comment, or @mention to ping" required maxLength={4000} ariaLabel="Comment" />
            <button className="secondary">Post</button>
          </form>
        </div>
      </div>

      {query.task && <TaskPanel taskId={query.task} me={me} back={back} closeHref={link(null)} />}
    </>
  );
}
