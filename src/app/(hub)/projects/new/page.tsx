import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shell";
import { createProject, proposeProject } from "../../../actions";

export const metadata: Metadata = { title: "New · T4C Exec Hub" };

// One short form at a time: start a project, add a general folder, or propose an idea.
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ idea?: string; kind?: string }> }) {
  const me = await requireMember();
  const query = await searchParams;
  const wantsIdea = !!query.idea;
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

  if (query.kind === "folder") {
    const execs = await db.member.findMany({ where: { kind: "exec" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return (
      <div style={{ maxWidth: 560 }}>
        <PageHeader title="New general folder" back={{ href: "/projects", label: "Folders" }} sub="A standing area with no end date, listed under General." />
        <form action={createProject} className="box stack" style={{ marginTop: 12 }}>
          <input type="hidden" name="kind" value="folder" />
          <label>Name<input type="text" name="title" required autoFocus maxLength={160} placeholder="e.g. Alumni Relations" /></label>
          <label>
            Owner
            <select name="ownerId" defaultValue={me.id}>
              {execs.map((m) => <option key={m.id} value={m.id}>{m.id === me.id ? "You" : m.name}</option>)}
            </select>
          </label>
          <label>What goes here (optional)<input type="text" name="goal" maxLength={300} placeholder="e.g. Keeping in touch with past members" /></label>
          <button>Create folder</button>
        </form>
      </div>
    );
  }

  const execs = await db.member.findMany({ where: { kind: "exec" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="New project" back={{ href: "/projects", label: "Folders" }} sub="Something with an end date. For an ongoing area, make a general folder instead." />
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
        <details>
          <summary className="small">Add a goal (optional)</summary>
          <input type="text" name="goal" maxLength={300} placeholder="What does success look like?" style={{ marginTop: 6 }} />
        </details>
        <button>Create project</button>
      </form>
    </div>
  );
}
