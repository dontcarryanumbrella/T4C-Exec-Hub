import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { can, type Permission } from "./permissions";

const SESSION_COOKIE = "hub_session";
const SESSION_DAYS = 120; // stay signed in on your own device for the semester
export const INVITE_LINK_HOURS = 72;
export const LOGIN_LINK_MINUTES = 30;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Creates a single-use sign-in link for one member. Only the hash is stored.
// Sending a new link retires any older unused ones, so only the latest works.
export async function createLoginLink(memberId: string, minutesValid: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.loginToken.updateMany({ where: { memberId, usedAt: null }, data: { usedAt: new Date() } });
  await db.loginToken.create({
    data: {
      tokenHash: hash(token),
      memberId,
      expiresAt: new Date(Date.now() + minutesValid * 60_000),
    },
  });
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/auth/verify?token=${token}`;
}

// Consumes a sign-in token and returns the member id, or null if the link is
// unknown, expired, or already used.
export async function consumeLoginToken(token: string): Promise<string | null> {
  const row = await db.loginToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  // Conditional update so two clicks on the same link can't both succeed.
  const { count } = await db.loginToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? row.memberId : null;
}

// At most this many sign-in emails per member per window, so nobody can
// flood a member's inbox by repeatedly submitting their address.
const LINKS_PER_WINDOW = 3;
const LINK_WINDOW_MINUTES = 15;

export async function canSendLoginLink(memberId: string): Promise<boolean> {
  const since = new Date(Date.now() - LINK_WINDOW_MINUTES * 60_000);
  return (await db.loginToken.count({ where: { memberId, createdAt: { gte: since } } })) < LINKS_PER_WINDOW;
}

export async function startSession(memberId: string): Promise<void> {
  // Opportunistic cleanup of dead sessions and links.
  const now = new Date();
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.loginToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { tokenHash: hash(token), memberId, expiresAt } });
  await db.member.updateMany({ where: { id: memberId, joinedAt: null }, data: { joinedAt: new Date() } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function currentMember() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { member: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.member;
}

export async function requireMember() {
  const member = await currentMember();
  if (!member) redirect("/login");
  return member;
}

// Check-ins and weekly commitments belong to the exec board; advisers and
// faculty follow along, comment, offer help, and give shoutouts.
export async function requireExec() {
  const member = await requireMember();
  if (member.kind !== "exec") throw new Error("Only exec board members can do that.");
  return member;
}

export async function requirePermission(perm: Permission) {
  const member = await requireMember();
  if (!can(member, perm)) throw new Error("You don't have permission to do that.");
  return member;
}
