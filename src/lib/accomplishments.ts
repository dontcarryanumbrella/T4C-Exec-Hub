import { db } from "./db";
import { isoFromDate, todayISO } from "./dates";

export type Suggestion = {
  source: "project" | "task" | "help";
  sourceId: string;
  title: string;
  description: string;
  date: string;
};

// Wins the hub can see from finished work that the person hasn't yet added
// or hidden. Nothing appears on a profile until they choose it.
export async function suggestionsFor(memberId: string): Promise<Suggestion[]> {
  const [decided, projects, milestones, helped] = await Promise.all([
    db.accomplishment.findMany({ where: { memberId, sourceId: { not: null } }, select: { source: true, sourceId: true } }),
    db.project.findMany({
      where: {
        status: "done",
        OR: [{ ownerId: memberId }, { tasks: { some: { ownerId: memberId, status: "done" } } }],
      },
      include: { tasks: { where: { status: "done" } } },
    }),
    db.task.findMany({
      where: { ownerId: memberId, isMilestone: true, status: "done", NOT: { project: { status: "done" } } },
      include: { project: true },
    }),
    db.helpOffer.findMany({
      where: { helperId: memberId, status: "accepted", task: { status: "done" } },
      include: { task: { include: { owner: true } } },
    }),
  ]);
  const seen = new Set(decided.map((a) => `${a.source}:${a.sourceId}`));
  const out: Suggestion[] = [];

  for (const p of projects) {
    const mine = p.tasks.filter((t) => t.ownerId === memberId);
    const led = p.ownerId === memberId;
    out.push({
      source: "project",
      sourceId: p.id,
      title: led ? `Led ${p.title}` : `Contributed to ${p.title}`,
      description: led
        ? [p.goal, `${p.tasks.length} task${p.tasks.length === 1 ? "" : "s"} delivered by the team`].filter(Boolean).join(" · ")
        : mine.map((t) => t.title).join(" · "),
      date: p.due ?? todayISO(),
    });
  }
  for (const t of milestones) {
    out.push({
      source: "task",
      sourceId: t.id,
      title: t.title,
      description: t.project ? `Milestone for ${t.project.title}` : "Milestone",
      date: t.completedAt ? isoFromDate(t.completedAt) : todayISO(),
    });
  }
  for (const h of helped) {
    out.push({
      source: "help",
      sourceId: h.id,
      title: `Helped ${h.task.owner?.name ?? "the team"} with “${h.task.title}”`,
      description: h.contribution,
      date: h.task.completedAt ? isoFromDate(h.task.completedAt) : todayISO(),
    });
  }
  return out.filter((s) => !seen.has(`${s.source}:${s.sourceId}`)).sort((a, b) => b.date.localeCompare(a.date));
}
