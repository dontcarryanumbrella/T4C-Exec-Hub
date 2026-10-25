import { db } from "./db";

// Field limits. Inputs are trimmed and cut to these lengths so nobody can
// store megabytes of text in a comment or title.
export const LIMIT = { title: 160, line: 300, text: 4000 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(s: string): boolean {
  return s.length <= 254 && EMAIL.test(s);
}

export const MEMBER_KINDS = ["exec", "adviser", "faculty"] as const;

// Returns a same-origin path (with query) or null. Rejects "//host",
// "/\host", and anything else a browser could treat as another site.
export function safePath(raw: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const u = new URL(raw, "http://hub.local");
    return u.origin === "http://hub.local" ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

export async function memberExists(id: string): Promise<boolean> {
  return !!id && (await db.member.count({ where: { id } })) > 0;
}

export async function projectExists(id: string, status?: string): Promise<boolean> {
  return !!id && (await db.project.count({ where: { id, ...(status ? { status } : {}) } })) > 0;
}

// A task can only wait on another task in the same project, and never in a
// loop (A waits on B waits on A). Returns the id to store, or null.
export async function validWaitingOn(taskId: string | null, waitingOnId: string, projectId: string | null): Promise<string | null> {
  if (!waitingOnId || !projectId || waitingOnId === taskId) return null;
  let cursor = await db.task.findUnique({ where: { id: waitingOnId }, select: { id: true, projectId: true, waitingOnId: true } });
  if (!cursor || cursor.projectId !== projectId) return null;
  for (let steps = 0; cursor && steps < 200; steps++) {
    if (taskId && cursor.id === taskId) return null;
    if (!cursor.waitingOnId) return waitingOnId;
    cursor = await db.task.findUnique({ where: { id: cursor.waitingOnId }, select: { id: true, projectId: true, waitingOnId: true } });
  }
  return null;
}

// Ids of tasks that already (directly or indirectly) wait on taskId; picking
// any of them as taskId's "waiting on" would create a loop.
export function dependents(taskId: string, tasks: { id: string; waitingOnId: string | null }[]): Set<string> {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) {
      if (!out.has(t.id) && t.waitingOnId && (t.waitingOnId === taskId || out.has(t.waitingOnId))) {
        out.add(t.id);
        grew = true;
      }
    }
  }
  return out;
}
