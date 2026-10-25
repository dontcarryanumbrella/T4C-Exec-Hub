import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { formatDay, todayISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { projectBrief } from "@/lib/status";
import { PageHeader } from "@/components/shell";
import { Icon } from "@/components/icons";
import { Menu } from "@/components/Menu";
import { FOLDERS } from "@/lib/folders";

const FOLDER_ORDER = (title: string) => {
  const i = FOLDERS.findIndex((f) => f.title === title);
  return i === -1 ? 99 : i;
};

export const metadata: Metadata = { title: "Folders · T4C Exec Hub" };

type Row = {
  id: string;
  title: string;
  owner: string;
  due: string;
  where: React.ReactNode;
};

// Drive-style list: click a row to open it; nothing else to read or press.
function ProjectList({ rows, emptyText }: { rows: Row[]; emptyText: string }) {
  if (rows.length === 0) return <p className="muted small" style={{ padding: "8px 12px" }}>{emptyText}</p>;
  return (
    <div className="list">
      <div className="list-head cols-project">
        <span>Name</span>
        <span>Owner</span>
        <span>Due</span>
        <span>Where it stands</span>
        <span />
      </div>
      {rows.map((r) => (
        <Link key={r.id} href={`/projects/${r.id}`} className="list-row cols-project">
          <span className="name"><Icon name="folder" /><span>{r.title}</span></span>
          <span className="cell optional">{r.owner}</span>
          <span className="cell optional">{r.due}</span>
          <span className="cell">{r.where}</span>
          <span className="row-actions"><Icon name="right" /></span>
        </Link>
      ))}
    </div>
  );
}

export default async function ProjectsPage() {
  const me = await requireMember();
  const today = todayISO();
  const canCreate = can(me, "canCreateProjects");
  const projects = await db.project.findMany({
    include: { owner: true, proposedBy: true, tasks: { include: { waitingOn: true, helpRequests: true } } },
    orderBy: [{ due: "asc" }, { createdAt: "desc" }],
  });
  const who = (m: { id: string; name: string } | null) => (m ? (m.id === me.id ? "You" : m.name) : "—");
  const row = (p: (typeof projects)[number]): Row => {
    const open = p.tasks.filter((t) => !t.ownerId && t.status !== "done" && t.status !== "dropped").length;
    const brief = projectBrief(p.tasks, today);
    return {
      id: p.id,
      title: p.title,
      owner: who(p.owner),
      due: p.due ? formatDay(p.due) : "—",
      where: (
        <>
          {brief.progress}
          {brief.attention > 0 && <> · <span className="status attention">{brief.attention} need attention</span></>}
          {open > 0 && <> · <span className="status ok">{open} open</span></>}
        </>
      ),
    };
  };
  const folders = projects.filter((p) => p.kind === "folder").sort((a, b) => FOLDER_ORDER(a.title) - FOLDER_ORDER(b.title));
  const active = projects.filter((p) => p.status === "active" && p.kind !== "folder");
  const proposed = projects.filter((p) => p.status === "proposed" && p.kind !== "folder");
  const past = projects.filter((p) => (p.status === "done" || p.status === "declined") && p.kind !== "folder");

  return (
    <>
      <PageHeader
        title="Folders"
        actions={
          <>
            <Link href={canCreate ? "/projects/new" : "/projects/new?idea=1"} className="button">
              {canCreate ? "New folder" : "Propose an idea"}
            </Link>
            <Menu>
              {canCreate && can(me, "canPropose") && (
                <Link href="/projects/new?idea=1" className="menu-item"><Icon name="idea" /> Propose an idea</Link>
              )}
              <Link href="/projects/templates" className="menu-item"><Icon name="task" /> Templates</Link>
            </Menu>
          </>
        }
      />

      {folders.length > 0 && (
        <>
          <div className="section-title"><h2>Roles</h2></div>
          <div className="folder-grid">
            {folders.map((f) => {
              const open = f.tasks.filter((t) => t.status !== "done" && t.status !== "dropped").length;
              return (
                <Link key={f.id} href={`/projects/${f.id}`} className="folder-tile">
                  <Icon name="folder" size={22} />
                  <span className="folder-name">{f.title}</span>
                  <span className="folder-meta">{open ? `${open} open` : "Empty"}</span>
                </Link>
              );
            })}
          </div>
          <div className="section-title"><h2>Projects</h2></div>
        </>
      )}

      {active.length === 0 && proposed.length === 0 ? (
        <div className="empty-state">
          <Icon name="folder" size={44} />
          <p>No project folders yet.</p>
          <Link href={canCreate ? "/projects/new" : "/projects/new?idea=1"} className="button">
            {canCreate ? "Start the first one" : "Propose the first one"}
          </Link>
        </div>
      ) : (
        <>
          <ProjectList rows={active.map(row)} emptyText="No active project folders." />

          {proposed.length > 0 && (
            <>
              <div className="section-title"><h2>Ideas waiting for approval</h2></div>
              <ProjectList
                rows={proposed.map((p) => ({
                  id: p.id,
                  title: p.title,
                  owner: `Idea by ${who(p.proposedBy)}`,
                  due: "—",
                  where: <span className="chip blue">{can(me, "canApprove") ? "Needs your decision" : "Waiting for approval"}</span>,
                }))}
                emptyText=""
              />
            </>
          )}
        </>
      )}

      {past.length > 0 && (
        <details className="quiet-section">
          <summary>Finished and declined ({past.length})</summary>
          <ProjectList
            rows={past.map((p) => ({ ...row(p), where: p.status === "done" ? <span className="chip">Done</span> : <span className="chip">Not now</span> }))}
            emptyText=""
          />
        </details>
      )}
    </>
  );
}
