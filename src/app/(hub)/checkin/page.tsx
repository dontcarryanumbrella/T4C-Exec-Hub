import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { activeWeek, addDays, formatWeek, planningWeek } from "@/lib/dates";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import CheckInForm from "./CheckInForm";
import { PageHeader } from "@/components/shell";
import { DEFAULT_FOLDER } from "@/lib/folders";

export const metadata: Metadata = { title: "Check in · T4C Exec Hub" };

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ week?: string; from?: string }> }) {
  const me = await requireMember();
  if (me.kind !== "exec") redirect("/");
  const current = activeWeek();
  const next = addDays(current, 7);
  const query = await searchParams;
  // Opens on the week to plan (next week on Sundays). Only this week and next
  // can be chosen; old links fall back to the planning week, never history.
  const week = query.week === current || query.week === next ? query.week : planningWeek();
  const planningAhead = week === next;
  const lastWeek = addDays(week, -7);

  const [doneRecently, commitments, openTasks, projects, existing, upForGrabs] = await Promise.all([
    db.task.findMany({
      where: { ownerId: me.id, status: "done", completedAt: { gte: new Date(`${lastWeek}T00:00:00Z`) } },
      include: { project: true }, orderBy: { completedAt: "desc" },
    }),
    db.commitment.findMany({ where: { memberId: me.id, weekStart: { in: [lastWeek, week] } } }),
    db.task.findMany({
      where: { ownerId: me.id, status: { notIn: ["done", "dropped"] } },
      include: { project: true, assignedBy: true }, orderBy: [{ due: "asc" }, { createdAt: "asc" }],
    }),
    db.project.findMany({ where: { status: "active" }, orderBy: [{ kind: "desc" }, { title: "asc" }] }),
    db.checkIn.findUnique({ where: { memberId_weekStart: { memberId: me.id, weekStart: week } } }),
    db.task.findMany({
      where: { ownerId: null, status: { notIn: ["done", "dropped"] } },
      include: { project: true }, orderBy: [{ due: "asc" }, { createdAt: "asc" }], take: 15,
    }),
  ]);
  const selected = new Set(commitments.filter((c) => c.weekStart === week).map((c) => c.taskId));
  const carried = new Set(commitments.filter((c) => c.weekStart === lastWeek).map((c) => c.taskId));

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title={planningAhead ? "Plan next week" : "Your weekly plan"}
        sub={`${formatWeek(week)} · aim for 1–3 outcomes`}
        back={{ href: planningAhead ? `/?week=${week}` : "/", label: planningAhead ? "Next week's board" : "This Week" }}
      />
      <div className="row" style={{ marginBottom: 16 }}>
        <Link href={`/checkin?week=${current}`} className={`button ${planningAhead ? "secondary" : ""}`}>{planningWeek() === current ? "This week" : "Week ending today"}</Link>
        <Link href={`/checkin?week=${next}`} className={`button ${planningAhead ? "" : "secondary"}`}>Plan next week</Link>
      </div>
      <p className="muted small">Choose what belongs on your card. Later keeps the task yours without putting it on this plan. Done finishes it everywhere.</p>
      {existing && <p className="small muted">Already checked in for these dates. Edit your plan anytime.</p>}
      <CheckInForm
        key={week}
        week={week}
        planningAhead={planningAhead}
        doneRecently={doneRecently.map((t) => ({ id: t.id, title: t.title, project: t.project?.title ?? null }))}
        openTasks={openTasks.map((t) => ({
          id: t.id, title: t.title, project: t.project?.title ?? null, projectId: t.projectId,
          due: t.due, checked: selected.has(t.id), carried: carried.has(t.id),
          assignedBy: t.assignedBy && t.assignedById !== me.id ? t.assignedBy.name : null,
        }))}
        upForGrabs={upForGrabs.map((t) => ({ id: t.id, title: t.title, project: t.project?.title ?? null, due: t.due }))}
        projects={projects.map((p) => ({ id: p.id, title: p.title, folder: p.kind === "folder" }))}
        defaultProject={(projects.find((p) => p.kind === "folder" && p.ownerId === me.id) ?? projects.find((p) => p.kind === "folder" && p.title === DEFAULT_FOLDER))?.id ?? ""}
        isUpdate={!!existing}
      />
    </div>
  );
}
