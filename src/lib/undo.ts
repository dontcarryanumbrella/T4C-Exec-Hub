import { db } from "./db";
import { can, type Permission } from "./permissions";
import { activeWeek } from "./dates";
import { workingOn } from "./tasks";

// How long the Undo button in a notice keeps working.
export const UNDO_MINUTES = 30;

type Me = { id: string } & Record<Permission, boolean>;

// Records how to reverse something `me` just did. `needs` is re-checked at
// undo time, so losing a permission also means losing the undo.
export async function recordUndo(me: { id: string }, kind: string, label: string, payload: object, needs?: Permission): Promise<string> {
  const entry = await db.undoEntry.create({
    data: { memberId: me.id, kind, label, payload: JSON.stringify({ ...payload, needs }) },
  });
  // Keep the log small: drop anything past its undo window.
  await db.undoEntry.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - UNDO_MINUTES * 60_000) } } });
  return entry.id;
}

const date = (v: string | null | undefined) => (v ? new Date(v) : null);

// Reverses one recorded action. Returns what was undone, or null if the entry
// isn't this person's, is too old, was already used, or no longer applies.
export async function applyUndo(me: Me, undoId: string): Promise<string | null> {
  const entry = await db.undoEntry.findUnique({ where: { id: undoId } });
  if (!entry || entry.memberId !== me.id || entry.usedAt) return null;
  if (entry.createdAt < new Date(Date.now() - UNDO_MINUTES * 60_000)) return null;
  const p = JSON.parse(entry.payload);
  if (p.needs && !can(me, p.needs)) return null;
  // Claim the entry first, so a double click can't undo twice.
  const { count } = await db.undoEntry.updateMany({ where: { id: entry.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!count) return null;

  switch (entry.kind) {
    case "task.status":
      await db.task.updateMany({
        where: { id: p.taskId },
        data: { status: p.status, blockedReason: p.blockedReason, completedAt: date(p.completedAt) },
      });
      if (p.reopenRequests?.length) await db.helpRequest.updateMany({ where: { id: { in: p.reopenRequests } }, data: { status: "open" } });
      break;
    case "task.fields": {
      const restored = await db.$transaction(async (tx) => {
        const { count } = await tx.task.updateMany({
          where: { id: p.taskId, ...(p.ownerAfter !== undefined ? { ownerId: p.ownerAfter } : {}) },
          data: { ...p.prev, completedAt: date(p.prev.completedAt) },
        });
        if (!count) return false; // A later handoff must not be overwritten.
        if (p.prevCoOwners) await tx.task.update({ where: { id: p.taskId }, data: { coOwners: { set: (p.prevCoOwners as string[]).map((id) => ({ id })) } } });
        for (const { id, ...prev } of (p.copies ?? []) as { id: string; title: string; description: string; due: string | null; dueTime: string | null }[]) {
          await tx.task.updateMany({ where: { id }, data: prev });
        }
        if (p.commitments) {
          const week = activeWeek();
          await tx.commitment.deleteMany({ where: { taskId: p.taskId, weekStart: { gte: week } } });
          for (const c of p.commitments as { memberId: string; taskId: string; weekStart: string }[]) {
            if (c.weekStart < week || c.memberId !== p.prev.ownerId) continue;
            const key = { memberId: c.memberId, taskId: c.taskId, weekStart: c.weekStart };
            await tx.commitment.upsert({ where: { memberId_taskId_weekStart: key }, update: {}, create: key });
          }
        }
        return true;
      });
      if (!restored) return null;
      break;
    }
    case "task.create":
      await db.task.deleteMany({ where: { id: { in: p.taskIds ?? [p.taskId] } } });
      break;
    case "checkin.done":
      // Only tasks that are still yours and still done go back; anything
      // changed since is left alone.
      await db.$transaction(async (tx) => {
        for (const t of p.tasks as { taskId: string; status: string; blockedReason: string; reopenRequests: string[]; commitments: { memberId: string; taskId: string; weekStart: string }[] }[]) {
          const { count } = await tx.task.updateMany({
            where: { id: t.taskId, ...workingOn(me.id), status: "done" },
            data: { status: t.status, blockedReason: t.blockedReason, completedAt: null },
          });
          if (!count) continue;
          await tx.helpRequest.updateMany({ where: { id: { in: t.reopenRequests } }, data: { status: "open" } });
          for (const c of t.commitments) {
            await tx.commitment.upsert({ where: { memberId_taskId_weekStart: c }, update: {}, create: c });
          }
        }
      });
      break;
    case "task.claim":
      await db.$transaction(async (tx) => {
        const { count } = await tx.task.updateMany({ where: { id: p.taskId, ownerId: me.id }, data: { ownerId: null } });
        if (count) await tx.commitment.deleteMany({ where: { taskId: p.taskId, weekStart: { gte: activeWeek() } } });
      });
      break;
    case "help.request":
      await db.helpRequest.deleteMany({ where: { id: p.id } });
      break;
    case "help.resolve":
      await db.helpRequest.updateMany({ where: { id: p.id }, data: { status: "open" } });
      break;
    case "offer":
      if (p.prevContribution == null) await db.helpOffer.deleteMany({ where: { id: p.id, helperId: me.id } });
      else await db.helpOffer.updateMany({ where: { id: p.id, helperId: me.id }, data: { contribution: p.prevContribution } });
      break;
    case "offer.respond":
      await db.helpOffer.updateMany({ where: { id: p.id }, data: { status: "offered" } });
      break;
    case "comment":
      await db.comment.deleteMany({ where: { id: p.id, authorId: me.id } });
      break;
    case "link.add":
      await db.link.deleteMany({ where: { id: p.id, addedById: me.id } });
      break;
    case "link.remove":
      await db.link.create({ data: p.data });
      break;
    case "shoutout.give":
      await db.shoutout.deleteMany({ where: { id: p.id, fromId: me.id } });
      break;
    case "shoutout.delete":
      await db.shoutout.create({ data: { ...p.data, createdAt: new Date(p.data.createdAt) } });
      break;
    case "project.create":
    case "project.propose":
      await db.project.deleteMany({ where: { id: p.id } });
      break;
    case "project.approve":
      await db.project.updateMany({ where: { id: p.id, status: "active" }, data: { status: "proposed", ownerId: p.prevOwnerId } });
      break;
    case "project.decline":
      await db.project.updateMany({ where: { id: p.id, status: "declined" }, data: { status: "proposed" } });
      if (p.commentId) await db.comment.deleteMany({ where: { id: p.commentId } });
      break;
    case "project.fields":
      await db.project.updateMany({ where: { id: p.id }, data: p.prev });
      break;
    case "member.fields":
    case "member.perms":
      await db.member.updateMany({ where: { id: p.id }, data: p.prev });
      break;
    case "profile":
      await db.member.update({ where: { id: me.id }, data: p.prev });
      break;
    case "accomp.create":
      await db.accomplishment.deleteMany({ where: { id: p.id, memberId: me.id } });
      break;
    case "accomp.fields":
      await db.accomplishment.updateMany({ where: { id: p.id, memberId: me.id }, data: p.prev });
      break;
    case "accomp.delete":
      await db.accomplishment.create({ data: { ...p.data, createdAt: new Date(p.data.createdAt) } });
      break;
    case "meeting.fields":
      await db.meeting.updateMany({ where: { id: p.id }, data: p.prev });
      break;
    case "meeting.delete":
      await db.meeting.create({ data: { ...p.data, createdAt: new Date(p.data.createdAt) } });
      if (p.taskIds?.length) await db.task.updateMany({ where: { id: { in: p.taskIds } }, data: { meetingId: p.data.id } });
      break;
    default:
      return null;
  }
  return entry.label;
}
