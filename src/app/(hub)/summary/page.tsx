import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { withTask } from "@/components/bits";
import TaskPanel from "@/components/TaskPanel";
import { PageHeader } from "@/components/shell";
import SummaryOverview, { type StatusCounts } from "@/components/SummaryOverview";
import TaskMap, { type MapHub, type MapPerson, type MapTask } from "@/components/TaskMap";
import { AVATAR_COLORS } from "@/lib/avatar";

export const metadata: Metadata = { title: "Summary · T4C Exec Hub" };

// Folder and project colors on the map, in a fixed order by creation date so a
// folder keeps its color as others come and go. Checked for color-blind
// separation against white.
const HUB_COLORS = ["#2451d6", "#0e6b3e", "#d9a514", "#d65fa3", "#6c4bd1", "#0f8a7c"];

// Everything at a glance: how many tasks are live, overdue, and done, and a
// map of who's working on what, where. Dropped tasks are left out.
export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const me = await requireMember();
  const query = await searchParams;
  const today = todayISO();

  const [tasks, projects, members] = await Promise.all([
    db.task.findMany({
      where: { status: { not: "dropped" } },
      select: { id: true, title: true, status: true, due: true, projectId: true, ownerId: true, coOwners: { select: { id: true } } },
    }),
    db.project.findMany({
      where: { status: { in: ["active", "done"] } },
      select: { id: true, title: true, kind: true },
      orderBy: { createdAt: "asc" },
    }),
    db.member.findMany({
      select: { id: true, name: true, role: true, avatarColor: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const mapTasks: MapTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    state: t.status === "done" ? "done" : t.due && t.due < today ? "overdue" : "live",
    project: t.projectId,
    people: [...(t.ownerId ? [t.ownerId] : []), ...t.coOwners.map((c) => c.id).filter((id) => id !== t.ownerId)],
  }));
  const counts: StatusCounts = { live: 0, overdue: 0, done: 0 };
  for (const t of mapTasks) counts[t.state]++;

  const hubs: MapHub[] = projects.map((p, i) => ({ id: p.id, name: p.title, kind: p.kind === "folder" ? "folder" : "project", color: HUB_COLORS[i % HUB_COLORS.length] }));
  const people: MapPerson[] = members.map((m) => {
    const c = AVATAR_COLORS[m.avatarColor] ?? AVATAR_COLORS.blue;
    return { id: m.id, name: m.name, role: m.role, color: c.body, ink: c.ink };
  });

  return (
    <>
      <PageHeader title="Summary" sub="Every task across folders and projects, and who's working on what." />
      <SummaryOverview
        counts={counts}
        assigned={tasks.filter((t) => t.ownerId).length}
        upForGrabs={tasks.filter((t) => !t.ownerId && t.status !== "done").length}
      />

      <div className="section-title">
        <h2>Map</h2>
        <span className="muted small">Bigger circles have more tasks. Hover to trace connections, drag to fling, Ctrl + scroll to zoom.</span>
      </div>
      {mapTasks.length === 0 ? (
        <div className="empty-state"><p>No tasks yet. Once folders have tasks, they show up here.</p></div>
      ) : (
        <TaskMap hubs={hubs} people={people} tasks={mapTasks} />
      )}

      {query.task && <TaskPanel taskId={query.task} me={me} back={withTask("/summary", {}, query.task)} closeHref="/summary" />}
    </>
  );
}
