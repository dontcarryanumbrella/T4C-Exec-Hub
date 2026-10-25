import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shell";
import { createProject, proposeProject } from "../../../actions";

export const metadata: Metadata = { title: "New · T4C Exec Hub" };

// One short form at a time: either start a project or propose an idea.
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ idea?: string }> }) {
  const me = await requireMember();
  const wantsIdea = !!(await searchParams).idea;
  const canCreate = can(me, "canCreateProjects");
  const idea = wantsIdea || !canCreate;
  if (idea && !can(me, "canPropose")) redirect("/projects");

  if (idea) {
    return (
      <div style={{ maxWidth: 560 }}>
        <PageHeader title="Propose an idea" back={{ href: "/projects", label: "Folders" }} sub="An approver will review it. You keep the credit." />
        <form action={proposeProject} className="box stack" style={{ marginTop: 12 }}>
          <label>Idea<input type="text" name="title" required autoFocus maxLength={160} placeholder="e.g. AI policy hackathon with Sanford" /></label>
          <label>Pitch<textarea name="goal" maxLength={4000} placeholder="What is it, why now, who would it serve?" /></label>
          <button>Propose</button>
        </form>
      </div>
    );
  }

  const [execs, templates] = await Promise.all([
    db.member.findMany({ where: { kind: "exec" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.template.findMany({ include: { _count: { select: { tasks: true } } }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="New project folder" back={{ href: "/projects", label: "Folders" }} />
      <form action={createProject} className="box stack" style={{ marginTop: 12 }}>
        <label>Name<input type="text" name="title" required autoFocus maxLength={160} placeholder="e.g. Fall speaker event" /></label>
        <div className="grid2">
          <label>
            Owner
            <select name="ownerId" defaultValue={me.id}>
              {execs.map((m) => <option key={m.id} value={m.id}>{m.id === me.id ? "You" : m.name}</option>)}
            </select>
          </label>
          <label>Event or due date<input type="date" name="due" /></label>
        </div>
        <label>
          Start from
          <select name="templateId" defaultValue="">
            <option value="">A blank project</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} template ({t._count.tasks} tasks)</option>)}
          </select>
        </label>
        <details>
          <summary className="small">Add a goal (optional)</summary>
          <input type="text" name="goal" maxLength={300} placeholder="What does success look like?" style={{ marginTop: 6 }} />
        </details>
        <button>Create folder</button>
      </form>
    </div>
  );
}
