import { db } from "./db";

// Experience points, worked out from what people have actually done, so they
// can't be farmed and an Undo takes the points back with it. Shown to each
// person for themselves only: encouragement, not a leaderboard.
export const XP = {
  checkIn: 10,
  taskDone: 20,
  milestoneBonus: 10,
  helpAccepted: 15,
  shoutoutReceived: 5,
  personThanked: 3,
  ideaApproved: 25,
} as const;

// Two levels per tier; Diamond is the top and keeps counting.
export type Tier = "bronze" | "silver" | "gold" | "diamond";
const TIER_NAMES: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", diamond: "Diamond" };
function tierFor(level: number): Tier {
  return level <= 2 ? "bronze" : level <= 4 ? "silver" : level <= 6 ? "gold" : "diamond";
}

// Level n starts at 25·n·(n−1) XP: 0, 50, 150, 300, 500, 750, …
const startOf = (level: number) => 25 * level * (level - 1);

export type Level = { xp: number; level: number; tier: Tier; title: string; into: number; span: number };

export function levelFor(xp: number): Level {
  let level = 1;
  while (xp >= startOf(level + 1)) level++;
  const into = xp - startOf(level);
  const span = startOf(level + 1) - startOf(level);
  const tier = tierFor(level);
  return { xp, level, tier, title: TIER_NAMES[tier], into, span };
}

export async function xpFor(memberId: string): Promise<number> {
  const [checkIns, done, milestones, helped, received, thanked, ideas] = await Promise.all([
    db.checkIn.count({ where: { memberId } }),
    db.task.count({ where: { ownerId: memberId, status: "done" } }),
    db.task.count({ where: { ownerId: memberId, status: "done", isMilestone: true } }),
    db.helpOffer.count({ where: { helperId: memberId, status: "accepted" } }),
    db.shoutout.count({ where: { toId: memberId } }),
    db.shoutout.groupBy({ by: ["toId"], where: { fromId: memberId } }),
    db.project.count({ where: { proposedById: memberId, status: { in: ["active", "done"] } } }),
  ]);
  return (
    checkIns * XP.checkIn +
    done * XP.taskDone +
    milestones * XP.milestoneBonus +
    helped * XP.helpAccepted +
    received * XP.shoutoutReceived +
    thanked.length * XP.personThanked +
    ideas * XP.ideaApproved
  );
}

// " +20 XP", or with a level-up or new tier (e.g. "You reached Silver!"), for a notice.
export async function xpNote(memberId: string, before: number): Promise<string> {
  const after = await xpFor(memberId);
  const gained = after - before;
  if (gained <= 0) return "";
  const a = levelFor(before);
  const b = levelFor(after);
  if (b.tier !== a.tier) return ` +${gained} XP. You reached ${b.title}!`;
  return b.level > a.level ? ` +${gained} XP. Level up: ${b.title} · Lv ${b.level}!` : ` +${gained} XP.`;
}
