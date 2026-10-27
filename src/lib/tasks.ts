import type { Prisma } from "@prisma/client";

// Tasks someone works on: as the owner, or as one of the others on it.
export const workingOn = (memberId: string): Prisma.TaskWhereInput => ({
  OR: [{ ownerId: memberId }, { coOwners: { some: { id: memberId } } }],
});

export const isOnTask = (t: { ownerId: string | null; coOwners?: { id: string }[] }, memberId: string) =>
  t.ownerId === memberId || !!t.coOwners?.some((c) => c.id === memberId);

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

// "You + Sam, Priya" style label for a task's people.
export function peopleOn(
  t: { ownerId: string | null; owner?: { name: string } | null; coOwners?: { id: string; name: string }[] },
  meId: string,
  unowned = "Up for grabs",
): string {
  if (!t.ownerId) return unowned;
  const lead = t.ownerId === meId ? "You" : (t.owner?.name ?? "Someone");
  const others = (t.coOwners ?? []).filter((c) => c.id !== t.ownerId).map((c) => (c.id === meId ? "you" : c.name));
  return others.length ? `${lead} + ${others.join(", ")}` : lead;
}

// Just what the assignee picker shows, so nothing private reaches the browser.
export const pickable = (members: { id: string; name: string; avatarColor: string; avatarShape: string; avatarFace: string; avatarExtra: string }[]) =>
  members.map(({ id, name, avatarColor, avatarShape, avatarFace, avatarExtra }) => ({ id, name, avatarColor, avatarShape, avatarFace, avatarExtra }));
