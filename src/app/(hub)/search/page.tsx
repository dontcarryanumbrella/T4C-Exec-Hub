import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { formatDay, todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/shell";
import { Avatar, StatusText, withTask } from "@/components/bits";
import { Icon } from "@/components/icons";
import TaskPanel from "@/components/TaskPanel";
import { peopleOn } from "@/lib/tasks";

export const metadata: Metadata = { title: "Search · T4C Exec Hub" };

// One box finds anything: tasks, projects, people, and meeting notes.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; task?: string }> }) {
  const me = await requireMember();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const today = todayISO();
  const link = (taskId: string | null) => withTask("/search", { q }, taskId);

  const has = (field: string) => ({ [field]: { contains: q } });
  const [tasks, projects, people, meetings] = q
    ? await Promise.all([
        db.task.findMany({
          where: { title: { contains: q }, status: { not: "dropped" } },
          include: { owner: true, coOwners: true, project: true, waitingOn: true, helpRequests: true },
          orderBy: [{ status: "asc" }, { due: "asc" }],
          take: 20,
        }),
        db.project.findMany({ where: { OR: [has("title"), has("goal")], status: { not: "declined" } }, include: { owner: true }, take: 10 }),
        db.member.findMany({ where: { OR: [has("name"), has("role"), has("askMeAbout"), has("wantToLearn")] }, take: 10 }),
        db.meeting.findMany({ where: { OR: [has("title"), has("notes"), has("decisions")] }, orderBy: { date: "desc" }, take: 10 }),
      ])
    : [[], [], [], []];
  const total = tasks.length + projects.length + people.length + meetings.length;

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title={q ? `Results for “${q}”` : "Search"} sub={q ? `${total} found` : "Type in the search bar above."} />

      {q && total === 0 && (
        <div className="empty-state">
          <Icon name="search" size={44} />
          <p>Nothing matches “{q}”. Try a shorter word, or a person&apos;s name.</p>
        </div>
      )}

      {people.length > 0 && (
        <>
          <div className="section-title"><h2>People</h2></div>
          <div className="list">
            {people.map((m) => (
              <Link key={m.id} href={`/people/${m.id}`} className="list-row cols-search">
                <span className="name"><Avatar name={m.name} look={m} /><span>{m.name}</span></span>
                <span className="cell">{m.role}{m.askMeAbout ? ` · ask about ${m.askMeAbout}` : ""}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {tasks.length > 0 && (
        <>
          <div className="section-title"><h2>Tasks</h2></div>
          <div className="list">
            {tasks.map((t) => (
              <Link key={t.id} href={link(t.id)} scroll={false} className="list-row cols-search">
                <span className="name"><Icon name={t.status === "done" ? "check" : "circle"} /><span>{t.title}</span></span>
                <span className="cell">
                  <StatusText task={t} today={today} short /> · {peopleOn(t, me.id)}
                  {t.project && ` · ${t.project.title}`}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {projects.length > 0 && (
        <>
          <div className="section-title"><h2>Projects</h2></div>
          <div className="list">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="list-row cols-search">
                <span className="name"><Icon name="folder" /><span>{p.title}</span></span>
                <span className="cell">
                  {{ proposed: "Idea", done: "Done" }[p.status] ?? "Active"}
                  {p.owner && ` · ${p.owner.name}`}
                  {p.due && ` · due ${formatDay(p.due)}`}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {meetings.length > 0 && (
        <>
          <div className="section-title"><h2>Meetings</h2></div>
          <div className="list">
            {meetings.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="list-row cols-search">
                <span className="name"><Icon name="notes" /><span>{m.title}</span></span>
                <span className="cell">{formatDay(m.date)}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {params.task && <TaskPanel taskId={params.task} me={me} back={link(params.task)} closeHref={link(null)} />}
    </div>
  );
}
