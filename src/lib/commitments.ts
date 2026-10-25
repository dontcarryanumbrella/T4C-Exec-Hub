import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { activeWeek, addDays } from "./dates";

export const MAX_COMMITMENTS = 10;

// The same rule applies to self-created, assigned, and template tasks.
export async function joinWeek(
  memberId: string | null, taskId: string, due: string | null,
  client: Prisma.TransactionClient = db, week = activeWeek(),
): Promise<boolean> {
  if (!memberId) return false;
  const member = await client.member.findUnique({ where: { id: memberId }, select: { kind: true } });
  if (member?.kind !== "exec") return false;
  const key = { memberId, taskId, weekStart: week };
  if (await client.commitment.findUnique({ where: { memberId_taskId_weekStart: key } })) return true;
  if (due && due > addDays(week, 6)) return false;
  if (await client.commitment.count({ where: { memberId, weekStart: week, task: { status: { notIn: ["done", "dropped"] } } } }) >= MAX_COMMITMENTS) return false;
  await client.commitment.upsert({ where: { memberId_taskId_weekStart: key }, update: {}, create: key });
  return true;
}

// Called inside the ownership-change transaction. Past weeks stay as history;
// current and future commitments follow the new owner, subject to their cap.
export async function moveCommitments(client: Prisma.TransactionClient, taskId: string, ownerId: string | null) {
  const current = activeWeek();
  const previous = await client.commitment.findMany({ where: { taskId, weekStart: { gte: current } } });
  await client.commitment.deleteMany({ where: { taskId, weekStart: { gte: current } } });
  for (const week of new Set(previous.map((c) => c.weekStart))) {
    await joinWeek(ownerId, taskId, null, client, week);
  }
  return previous;
}
