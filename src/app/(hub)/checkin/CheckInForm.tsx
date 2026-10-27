"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { submitCheckIn, type CheckInResult } from "../../actions";
import { formatDay } from "@/lib/dates";

const TARGET = 3;
const MAX = 10;
const NEW_ROWS = 5;

type Props = {
  week: string;
  planningAhead: boolean;
  doneRecently: { id: string; title: string; project: string | null }[];
  openTasks: { id: string; title: string; project: string | null; projectId: string | null; due: string | null; checked: boolean; carried: boolean; assignedBy: string | null }[];
  upForGrabs: { id: string; title: string; project: string | null; due: string | null }[];
  projects: { id: string; title: string; folder: boolean }[];
  defaultProject: string;
  isUpdate: boolean;
};

export default function CheckInForm(p: Props) {
  const [state, action, pending] = useActionState<CheckInResult, FormData>(submitCheckIn, {});
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(p.openTasks.map((t) => [t.id, t.checked ? "week" : "later"])));
  const [claims, setClaims] = useState<Set<string>>(() => new Set());
  const [newTitles, setNewTitles] = useState<string[]>(Array(NEW_ROWS).fill(""));
  const [rows, setRows] = useState(1);
  const [details, setDetails] = useState<Set<number>>(() => new Set());
  const total = Object.values(choices).filter((c) => c === "week").length + claims.size + newTitles.filter((t) => t.trim()).length;
  const over = total > MAX;
  const weekLabel = p.planningAhead ? "Next week" : "This week";

  return (
    <form action={action} className="stack" data-own-pending>
      <input type="hidden" name="week" value={p.week} />
      {state.error && <div className="error" role="alert">{state.error}</div>}
      <div className="box">
        <h2>Your open tasks</h2>
        {p.openTasks.length === 0 && <p className="muted small">No open tasks. Add an outcome below or take on something up for grabs.</p>}
        {p.openTasks.map((t) => (
          <div key={t.id} className="plan-task">
            <input type="hidden" name="task" value={t.id} />
            <input type="hidden" name={`plan_${t.id}`} value={choices[t.id]} />
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <strong>{t.title}</strong>
                <div className="small muted">
                  {t.project}{t.due && ` · due ${formatDay(t.due)}`}
                  {t.carried && " · on the previous week's plan"}
                  {t.assignedBy && ` · assigned by ${t.assignedBy}`}
                </div>
              </div>
              <div className="segmented" role="group" aria-label={`Plan for ${t.title}`}>
                {[{ value: "week", label: weekLabel }, { value: "later", label: "Later" }, { value: "done", label: "Done" }].map((o) => (
                  <button type="button" key={o.value} aria-pressed={choices[t.id] === o.value} className={choices[t.id] === o.value ? "small" : "small secondary"}
                    onClick={() => setChoices({ ...choices, [t.id]: o.value })}>{o.label}</button>
                ))}
              </div>
            </div>
            {choices[t.id] !== "done" && (
              <details className="quiet-section" style={{ marginTop: 8 }}>
                <summary>Reschedule or ask for help</summary>
                <div className="stack" style={{ marginTop: 8 }}>
                  <label>Due date<input type="date" name={`date_${t.id}`} defaultValue={t.due ?? ""} /></label>
                  <label>Help needed (optional)<input type="text" name={`help_${t.id}`} maxLength={300} placeholder="What would help you move this forward?" /></label>
                  <Link href={t.projectId ? `/projects/${t.projectId}?task=${t.id}` : `/?task=${t.id}`} className="small">Open task to edit its outcome, hand it off, or delete it (save this plan first).</Link>
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
      <div className="box">
        <h2>Add an outcome</h2>
        <div className="small muted" style={{ marginBottom: 4 }}>{p.openTasks.length > 0 ? "Or add something new:" : "Add what you'll get done:"}</div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="new-item">
            <div className="row new-row">
              <input
                type="text"
                name={`new_title_${i}`}
                placeholder="e.g. Book room for Nov 14 workshop"
                aria-label="New commitment"
                maxLength={160}
                value={newTitles[i]}
                onChange={(e) => setNewTitles(newTitles.map((v, j) => (j === i ? e.target.value : v)))}
                style={{ flex: 3, minWidth: 200 }}
              />
              <select name={`new_project_${i}`} defaultValue={p.defaultProject} aria-label="Folder or project" style={{ flex: 2, minWidth: 140 }}>
                <optgroup label="Folders">
                  {p.projects.filter((pr) => pr.folder).map((pr) => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
                </optgroup>
                {p.projects.some((pr) => !pr.folder) && (
                  <optgroup label="Projects">
                    {p.projects.filter((pr) => !pr.folder).map((pr) => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
                  </optgroup>
                )}
              </select>
              <input type="date" name={`new_due_${i}`} style={{ flex: 1.3, minWidth: 130 }} aria-label="Due date (optional)" title="Due date (optional)" />
            </div>
            {details.has(i) ? (
              <textarea name={`new_details_${i}`} maxLength={4000} placeholder="Details (optional): context, links, what done looks like" aria-label="Details" style={{ marginTop: 6, minHeight: 50 }} autoFocus />
            ) : (
              newTitles[i].trim() && (
                <button type="button" className="link small" onClick={() => setDetails(new Set(details).add(i))}>+ Add details</button>
              )
            )}
          </div>
        ))}
        {rows < NEW_ROWS && (
          <button type="button" className="link small" onClick={() => setRows(rows + 1)}>+ Add another</button>
        )}
      </div>
      {p.upForGrabs.length > 0 && (
        <details className="box" id="up-for-grabs">
          <summary>Up for grabs · {p.upForGrabs.length} tasks</summary>
          <p className="small muted">Select a task to take ownership and add it to this plan.</p>
          {p.upForGrabs.map((t) => (
            <label key={t.id} className="inline">
              <input type="checkbox" name="claim" value={t.id} checked={claims.has(t.id)} onChange={(e) => {
                const next = new Set(claims);
                if (e.target.checked) next.add(t.id); else next.delete(t.id);
                setClaims(next);
              }} />
              {t.title}{t.project && <span className="muted"> — {t.project}</span>}
            </label>
          ))}
        </details>
      )}
      {p.doneRecently.length > 0 && (
        <details className="box">
          <summary>Recently finished · {p.doneRecently.length}</summary>
          <ul className="small">{p.doneRecently.map((t) => <li key={t.id}>✓ {t.title}</li>)}</ul>
        </details>
      )}
      <p className={`small ${total > TARGET ? "status attention" : "muted"}`}>
        {over ? `${total} is too many. Keep it to ${MAX} or fewer.`
          : total > TARGET ? `${total} commitments. ${TARGET} is the usual target; keep your plan realistic.`
          : total === 0 ? "No commitments selected. You can still check in for a quiet week."
          : `${total} commitment${total === 1 ? "" : "s"} on your ${p.planningAhead ? "next week's" : "weekly"} card`}
      </p>
      <button type="submit" disabled={over || pending}>{pending ? "Saving…" : p.isUpdate ? "Update plan" : "Save plan and check in"}</button>
    </form>
  );
}
