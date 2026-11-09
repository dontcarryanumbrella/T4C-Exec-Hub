"use client";

import { useEffect, useState, useTransition } from "react";
import { moveTasksToGroup, reorderGroups } from "@/app/actions";

export type GroupRow = { key: string; ids: string[]; node: React.ReactNode };
export type GroupSection = { id: string | null; name: string; menu?: React.ReactNode; rows: GroupRow[] };

type Drag = { kind: "row"; key: string } | { kind: "group"; id: string } | null;

// Tasks on a folder's page, split into named groups. People who can edit the
// folder drag a task onto another group to move it, or drag a group's
// header to reorder groups. Changes show at once and save in the background.
export default function TaskGroups({ projectId, sections, editable }: { projectId: string; sections: GroupSection[]; editable: boolean }) {
  const initial = () => sections.map((s) => ({ ...s, keys: s.rows.map((r) => r.key) }));
  const [state, setState] = useState(initial);
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();
  const sig = sections.map((s) => `${s.id}:${s.rows.map((r) => r.key).join(",")}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setState(initial()), [sig]);
  const rows = new Map(sections.flatMap((s) => s.rows.map((r) => [r.key, r] as const)));
  const grouped = sections.length > 1;
  const sid = (id: string | null) => id ?? "_none";

  const dropRow = (target: string | null) => {
    if (drag?.kind !== "row") return;
    const from = state.find((s) => s.keys.includes(drag.key));
    if (!from || from.id === target) return;
    setState((st) => st.map((s) => ({ ...s, keys: s.id === target ? [...s.keys, drag.key] : s.keys.filter((k) => k !== drag.key) })));
    const ids = rows.get(drag.key)?.ids ?? [];
    start(() => moveTasksToGroup(projectId, ids, target));
  };
  const overGroup = (target: string) => {
    if (drag?.kind !== "group" || drag.id === target) return;
    setState((st) => {
      const moving = st.find((s) => s.id === drag.id)!;
      const rest = st.filter((s) => s.id !== drag.id);
      const at = rest.findIndex((s) => s.id === target) + (st.indexOf(moving) < st.findIndex((s) => s.id === target) ? 1 : 0);
      rest.splice(at, 0, moving);
      return rest;
    });
  };

  return (
    <div className="task-groups">
      {state.map((s) => {
        if (!grouped && s.keys.length === 0) return null;
        return (
          <section
            key={sid(s.id)}
            className={`task-group${over === sid(s.id) && drag?.kind === "row" ? " is-over" : ""}${drag?.kind === "group" && drag.id === s.id ? " is-dragging" : ""}`}
            onDragOver={(e) => {
              if (!editable || !drag) return;
              if (drag.kind === "row") { e.preventDefault(); setOver(sid(s.id)); }
              else if (s.id) { e.preventDefault(); overGroup(s.id); }
            }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); setOver(null); dropRow(s.id); }}
          >
            {grouped && (
              <div
                className="group-head"
                draggable={editable && !!s.id}
                onDragStart={(e) => { if (!s.id) return; e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "group", id: s.id }); }}
                onDragEnd={() => {
                  setDrag(null);
                  const ids = state.flatMap((x) => (x.id ? [x.id] : []));
                  start(() => reorderGroups(projectId, ids));
                }}
              >
                <h3>{s.name}</h3>
                <span className="muted small">{s.keys.length || ""}</span>
                {s.menu}
              </div>
            )}
            <div className="list">
              {s.keys.map((k) => (
                <div
                  key={k}
                  className={`reorder-item${drag?.kind === "row" && drag.key === k ? " is-dragging" : ""}`}
                  draggable={editable && grouped}
                  onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "row", key: k }); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                >
                  {rows.get(k)?.node}
                </div>
              ))}
              {grouped && s.keys.length === 0 && <p className="muted small group-empty">{editable ? "Drag tasks here" : "No tasks yet"}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
