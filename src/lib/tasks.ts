import type { Prisma } from "@prisma/client";

// Tasks someone works on: as the owner, or as one of the others on it.
export const workingOn = (memberId: string): Prisma.TaskWhereInput => ({
  OR: [{ ownerId: memberId }, { coOwners: { some: { id: memberId } } }],
});

export const isOnTask = (t: { ownerId: string | null; coOwners?: { id: string }[] }, memberId: string) =>
  t.ownerId === memberId || !!t.coOwners?.some((c) => c.id === memberId);

// Whether someone leads a project or folder: as its owner or alongside them.
export const leadsProject = (p: { ownerId: string | null; coOwners?: { id: string }[] } | null | undefined, memberId: string) =>
  !!p && (p.ownerId === memberId || !!p.coOwners?.some((c) => c.id === memberId));

export const leading = (memberId: string): Prisma.ProjectWhereInput => ({
  OR: [{ ownerId: memberId }, { coOwners: { some: { id: memberId } } }],
});

// The other copies of a task given to Everyone: same name, folder and due
// date, made in the same moment, each with its own owner.
export const copiesOf = (t: { id: string; title: string; projectId: string | null; due: string | null; createdAt: Date }): Prisma.TaskWhereInput => ({
  id: { not: t.id },
  title: t.title,
  projectId: t.projectId,
  due: t.due,
  ownerId: { not: null },
  createdAt: { gte: new Date(t.createdAt.getTime() - 60_000), lte: new Date(t.createdAt.getTime() + 60_000) },
});

// Lists show a task given to Everyone once, not once per person: copies have
// the same name, folder, and due date and were made within a minute.
// The row opens your own copy when you have one.
type Groupable = { id: string; title: string; projectId: string | null; due: string | null; ownerId: string | null; createdAt: Date };
export function groupCopies<T extends Groupable>(tasks: T[], meId: string): { task: T; copies: T[] }[] {
  const groups: T[][] = [];
  for (const t of tasks) {
    const group = t.ownerId
      ? groups.find(([f]) =>
          !!f.ownerId && f.title === t.title && f.projectId === t.projectId && f.due === t.due &&
          Math.abs(f.createdAt.getTime() - t.createdAt.getTime()) <= 60_000)
      : undefined;
    if (group) group.push(t);
    else groups.push([t]);
  }
  return groups.map((copies) => ({ task: copies.find((c) => c.ownerId === meId) ?? copies[0], copies }));
}

// "Everyone" while every exec has a copy, otherwise how many people do.
export const copiesLabel = (n: number, execs: number) => (n >= execs ? "Everyone" : `${n} people`);

// "You + Sam, Priya" style label for a task's people; past two others it
// says how many, so long lists don't get cut off mid-name.
export function peopleOn(
  t: { ownerId: string | null; owner?: { name: string } | null; coOwners?: { id: string; name: string }[] },
  meId: string,
  unowned = "Up for grabs",
): string {
  if (!t.ownerId) return unowned;
  const lead = t.ownerId === meId ? "You" : (t.owner?.name ?? "Someone");
  const others = (t.coOwners ?? []).filter((c) => c.id !== t.ownerId).map((c) => (c.id === meId ? "you" : c.name));
  if (others.length > 2) return `${lead} + ${others.length} others`;
  return others.length ? `${lead} + ${others.join(", ")}` : lead;
}

// Just what the assignee picker shows, so nothing private reaches the browser.
export const pickable = (members: { id: string; name: string; avatarColor: string; avatarShape: string; avatarFace: string; avatarExtra: string }[]) =>
  members.map(({ id, name, avatarColor, avatarShape, avatarFace, avatarExtra }) => ({ id, name, avatarColor, avatarShape, avatarFace, avatarExtra }));
