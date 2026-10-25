import { addDays, formatDay } from "./dates";

export type Tone = "done" | "ok" | "attention" | "muted";

type StatusInput = {
  status: string;
  due: string | null;
  blockedReason: string;
  waitingOn?: { title: string; status: string } | null;
  helpRequests?: { status: string }[];
};

// One plain-language line per task, e.g. "Blocked — waiting on Book room".
export function taskStatus(t: StatusInput, today: string): { text: string; tone: Tone } {
  if (t.status === "done") return { text: "Done", tone: "done" };
  if (t.status === "dropped") return { text: "Dropped", tone: "muted" };
  // Waiting on an earlier step is normal sequencing; it only becomes a blocker
  // once this task is due within a week (or overdue).
  if (t.waitingOn && t.waitingOn.status !== "done" && t.waitingOn.status !== "dropped") {
    if (!t.due || t.due > addDays(today, 7))
      return { text: `Waiting on ${t.waitingOn.title}${t.due ? ` · due ${formatDay(t.due)}` : ""}`, tone: "muted" };
    return { text: `Blocked — waiting on ${t.waitingOn.title}`, tone: "attention" };
  }
  if (t.status === "blocked")
    return { text: `Blocked${t.blockedReason ? ` — ${t.blockedReason}` : ""}`, tone: "attention" };
  if (t.helpRequests?.some((h) => h.status === "open")) return { text: "Needs help", tone: "attention" };
  if (t.due && t.due < today) return { text: `Overdue (was due ${formatDay(t.due)})`, tone: "attention" };
  const dueText = t.due ? ` · due ${formatDay(t.due)}` : "";
  if (t.status === "in_progress") return { text: `In progress${dueText}`, tone: "ok" };
  return { text: `Not started${dueText}`, tone: "muted" };
}

// One or two words for tight spots (lists); the full sentence goes in a tooltip.
export function shortStatus(text: string): string {
  if (text.startsWith("Blocked")) return "Blocked";
  if (text.startsWith("Overdue")) return "Overdue";
  if (text.startsWith("In progress")) return "In progress";
  if (text.startsWith("Not started")) return "Not started";
  if (text.startsWith("Waiting on")) return "Waiting";
  return text;
}

// For list rows: progress plus how many tasks need attention,
// e.g. { progress: "2 of 9 done", attention: 3 }.
export function projectBrief(tasks: StatusInput[], today: string): { progress: string; attention: number } {
  const live = tasks.filter((t) => t.status !== "dropped");
  const done = live.filter((t) => t.status === "done").length;
  const attention = live.filter((t) => t.status !== "done" && taskStatus(t, today).tone === "attention").length;
  return { progress: live.length ? `${done} of ${live.length} done` : "No tasks yet", attention };
}
