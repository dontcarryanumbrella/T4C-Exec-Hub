import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell";
import { can } from "@/lib/permissions";
import { ConfirmButton } from "@/components/client";
import { requireMember } from "@/lib/auth";
import {
  addTemplateTask,
  createTemplate,
  deleteTemplate,
  deleteTemplateTask,
  updateTemplate,
  updateTemplateTask,
} from "../../../actions";

function describeOffset(days: number): string {
  if (days === 0) return "on the day";
  const n = Math.abs(days);
  const amount = n % 7 === 0 ? `${n / 7} week${n === 7 ? "" : "s"}` : `${n} day${n === 1 ? "" : "s"}`;
  return days < 0 ? `${amount} before` : `${amount} after`;
}

export const metadata: Metadata = { title: "Templates · T4C Exec Hub" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const me = await requireMember();
  const { open } = await searchParams;
  const canEdit = can(me, "canManageTemplates");
  const [templates, members] = await Promise.all([
    db.template.findMany({ include: { tasks: { orderBy: { position: "asc" } } }, orderBy: { name: "asc" } }),
    db.member.findMany({ where: { kind: "exec" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const roles = [...new Set(members.map((m) => m.role).filter(Boolean))];
  const back = (id: string) => `/projects/templates?open=${id}`;

  return (
    <>
      <PageHeader title="Templates" back={{ href: "/projects", label: "Folders" }} sub={<>Reusable checklists. Dates count back from the event date.{!canEdit && " Ask an admin to change one."}</>} />

      <div className="stack" style={{ marginTop: 12 }}>
        {templates.map((t) => {
          const byPosition = new Map(t.tasks.map((x) => [x.position, x]));
          return (
            <details key={t.id} className="box" open={open === t.id}>
              <summary>
                <strong>{t.name}</strong> <span className="muted small">— {t.tasks.length} tasks{t.description && ` · ${t.description}`}</span>
              </summary>

              {canEdit ? (
                <>
                  <table style={{ marginTop: 8 }}>
                    <thead>
                      <tr><th style={{ width: "34%" }}>Outcome</th><th style={{ width: 90 }}>Days</th><th>Default owner (role)</th><th>Waiting on</th><th>Milestone</th><th></th></tr>
                    </thead>
                    <tbody>
                      {t.tasks.map((tt) => {
                        const formId = `tt-${tt.id}`;
                        return (
                          <tr key={tt.id}>
                            <td><input form={formId} type="text" name="title" defaultValue={tt.title} /></td>
                            <td>
                              <input form={formId} type="text" name="offsetDays" defaultValue={tt.offsetDays} />
                              <div className="small muted">{describeOffset(tt.offsetDays)}</div>
                            </td>
                            <td>
                              <select form={formId} name="role" defaultValue={tt.role}>
                                <option value="">Project owner</option>
                                {[...new Set([...roles, tt.role].filter(Boolean))].map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </td>
                            <td>
                              <select form={formId} name="waitingOnPosition" defaultValue={tt.waitingOnPosition ?? ""}>
                                <option value="">Nothing</option>
                                {t.tasks.filter((o) => o.id !== tt.id).map((o) => <option key={o.id} value={o.position}>{o.title}</option>)}
                              </select>
                            </td>
                            <td><input form={formId} type="checkbox" name="isMilestone" defaultChecked={tt.isMilestone} /></td>
                            <td>
                              <form id={formId} action={updateTemplateTask}>
                                <input type="hidden" name="templateTaskId" value={tt.id} />
                                <input type="hidden" name="back" value={back(t.id)} />
                              </form>
                              <div className="row" style={{ flexWrap: "nowrap" }}>
                                <button form={formId} className="secondary small">Save</button>
                                <form action={deleteTemplateTask}>
                                  <input type="hidden" name="templateTaskId" value={tt.id} />
                                  <input type="hidden" name="back" value={back(t.id)} />
                                  <ConfirmButton message="Remove this task from the template?" className="link small">Remove</ConfirmButton>
                                </form>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <h3 style={{ marginTop: 14 }}>Add a task</h3>
                  <form action={addTemplateTask} className="row" style={{ alignItems: "flex-end" }}>
                    <input type="hidden" name="templateId" value={t.id} />
                    <input type="hidden" name="back" value={back(t.id)} />
                    <label style={{ flex: 3 }}>Outcome<input type="text" name="title" required /></label>
                    <label style={{ width: 110 }}>Days (− = before)<input type="text" name="offsetDays" defaultValue="-7" /></label>
                    <label style={{ flex: 2 }}>
                      Role
                      <select name="role" defaultValue="">
                        <option value="">Project owner</option>
                        {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                    <label style={{ flex: 2 }}>
                      Waiting on
                      <select name="waitingOnPosition" defaultValue="">
                        <option value="">Nothing</option>
                        {t.tasks.map((o) => <option key={o.id} value={o.position}>{o.title}</option>)}
                      </select>
                    </label>
                    <label className="inline"><input type="checkbox" name="isMilestone" /> Milestone</label>
                    <button>Add</button>
                  </form>

                  <details style={{ marginTop: 12 }}>
                    <summary className="small">Rename or delete template</summary>
                    <form action={updateTemplate} className="stack" style={{ maxWidth: 520 }}>
                      <input type="hidden" name="templateId" value={t.id} />
                      <input type="hidden" name="back" value={back(t.id)} />
                      <label>Name<input type="text" name="name" defaultValue={t.name} /></label>
                      <label>Note<input type="text" name="description" defaultValue={t.description} /></label>
                      <button className="secondary">Save</button>
                    </form>
                    <form action={deleteTemplate} style={{ marginTop: 8 }}>
                      <input type="hidden" name="templateId" value={t.id} />
                      <input type="hidden" name="back" value="/projects/templates" />
                      <ConfirmButton message={`Delete the “${t.name}” template? Projects already made from it are not affected.`} className="link small">Delete this template</ConfirmButton>
                    </form>
                  </details>
                </>
              ) : (
                <ol className="small" style={{ marginTop: 8 }}>
                  {t.tasks.map((tt) => (
                    <li key={tt.id}>
                      {tt.title}
                      <span className="muted">
                        {" "}— {describeOffset(tt.offsetDays)} · {tt.role || "project owner"}
                        {tt.isMilestone && " · milestone"}
                        {tt.waitingOnPosition != null && byPosition.get(tt.waitingOnPosition) && ` · after “${byPosition.get(tt.waitingOnPosition)!.title}”`}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          );
        })}
      </div>

      {canEdit && (
        <details style={{ marginTop: 16 }}>
          <summary>+ New template</summary>
          <form action={createTemplate} className="box stack" style={{ maxWidth: 520 }}>
            <label>Name<input type="text" name="name" required placeholder="e.g. Panel discussion" /></label>
            <label>Note<input type="text" name="description" placeholder="e.g. Due date = the panel date." /></label>
            <button>Create template</button>
          </form>
        </details>
      )}
    </>
  );
}
