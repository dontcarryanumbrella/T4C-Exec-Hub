"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  INVITE_LINK_HOURS,
  LOGIN_LINK_MINUTES,
  canSendLoginLink,
  consumeLoginToken,
  createLoginLink,
  currentMember,
  endSession,
  requireExec,
  requireMember,
  requirePermission,
  startSession,
} from "@/lib/auth";
import { randomBytes } from "node:crypto";
import { PERMISSIONS, PRESETS, can, presetName, type Permission, type PermissionSet } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import { activeWeek, addDays, daysBetween, isISODate, todayISO } from "@/lib/dates";
import { suggestionsFor } from "@/lib/accomplishments";
import { LIMIT, MEMBER_KINDS, isEmail, memberExists, projectExists, safePath, validWaitingOn } from "@/lib/guards";
import { setFlash, type Flash } from "@/lib/flash";
import { applyUndo, recordUndo } from "@/lib/undo";
import { notify, pingMentions } from "@/lib/pings";
import { xpFor, xpNote } from "@/lib/xp";
import { AVATAR_COLORS, AVATAR_EXTRAS, AVATAR_FACES, AVATAR_SHAPES } from "@/lib/avatar";
import { DEFAULT_FOLDER } from "@/lib/folders";
import { joinWeek, moveCommitments, MAX_COMMITMENTS } from "@/lib/commitments";

// Three commitments is the target that keeps priorities credible; people can
// take on more when they choose to, up to a sanity cap.
const TARGET_COMMITMENTS = 3;
const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "dropped"];
const STATUS_WORDS: Record<string, string> = {
  todo: "not started",
  in_progress: "in progress",
  blocked: "blocked",
  done: "done",
  dropped: "dropped",
};

// ---------- helpers ----------

// Every text input is trimmed and capped, so oversized posts can't bloat the database.
function str(fd: FormData, key: string, max: number = LIMIT.title): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function optDate(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return isISODate(v) ? v : null;
}

function optTime(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
}

// Where a task goes when no project was picked: the folder you own, or
// Club Operations.
async function homeFolder(memberId: string): Promise<string | null> {
  const mine = await db.project.findFirst({ where: { kind: "folder", ownerId: memberId }, select: { id: true } });
  if (mine) return mine.id;
  const ops = await db.project.findFirst({ where: { kind: "folder", title: DEFAULT_FOLDER }, select: { id: true } });
  return ops?.id ?? null;
}

function done(fd: FormData, fallback = "/"): never {
  revalidatePath("/", "layout");
  redirect(safePath(str(fd, "back", 500)) ?? fallback);
}

type Note = {
  tone?: Flash["tone"];
  next?: Flash["next"];
  // How to take this back; shown as an Undo button in the notice.
  undo?: { kind: string; label: string; payload: object; needs?: Permission };
};

// Every action ends by telling the person what just happened.
// The change has already happened by now, so a failure to record the undo
// must never turn a success into an error: the notice just goes without Undo.
async function tell(me: { id: string } | null, text: string, note: Note = {}): Promise<void> {
  let undoId: string | undefined;
  if (note.undo && me) {
    try {
      undoId = await recordUndo(me, note.undo.kind, note.undo.label, note.undo.payload, note.undo.needs);
    } catch (err) {
      console.error("Could not record undo", err);
    }
  }
  await setFlash({ text, tone: note.tone ?? "success", undoId, next: note.next });
}

// A request that fails validation: say why, and leave everything as it was.
async function refuse(fd: FormData, text: string, fallback = "/"): Promise<never> {
  await setFlash({ text, tone: "error" });
  done(fd, fallback);
}

// Shown on the error page; only reachable through forged or stale requests.
function forbid(): never {
  throw new Error("You don't have permission to do that.");
}

// Who can change a task: its owner, the project's owner, or anyone with the
// "manage tasks" permission.
async function taskForEdit(taskId: string) {
  const me = await requireMember();
  const task = await db.task.findUnique({ where: { id: taskId }, include: { project: { select: { ownerId: true } } } });
  if (!task) throw new Error("That task no longer exists.");
  const manages = can(me, "canManageTasks") || (!!task.project && task.project.ownerId === me.id);
  const canEdit = task.ownerId === me.id || manages;
  return { me, task, canEdit, manages };
}

// "open" in an owner field means "up for grabs" (no owner yet).
const OPEN = "open";
// "everyone" gives each exec their own copy of a new task, so each person
// ticks off their part separately.
const EVERYONE = "everyone";

async function ownersFor(wanted: string, me: { id: string }): Promise<(string | null)[]> {
  if (wanted === EVERYONE) return (await db.member.findMany({ where: { kind: "exec" }, select: { id: true } })).map((m) => m.id);
  return [wanted === OPEN ? null : (await memberExists(wanted)) ? wanted : me.id];
}

function cardPlacement(onCards: number, total: number): string {
  if (onCards === total) return total === 1 ? "It's on the owner's card this week." : "All copies are on their owners' cards this week.";
  if (!onCards) return "Not on a weekly card yet. The owner can select it in check-in; later deadlines and full weeks stay off the card.";
  return `${onCards} of ${total} copies joined this week's cards. The rest can be selected in check-in.`;
}

async function nameOf(id: string | null): Promise<string> {
  if (!id) return "nobody";
  return (await db.member.findUnique({ where: { id }, select: { name: true } }))?.name ?? "someone";
}

const snapshotTask = (t: {
  title: string;
  description: string;
  dueTime: string | null;
  ownerId: string | null;
  assignedById: string | null;
  due: string | null;
  status: string;
  blockedReason: string;
  isMilestone: boolean;
  waitingOnId: string | null;
  completedAt: Date | null;
}) => ({
  title: t.title,
  description: t.description,
  dueTime: t.dueTime,
  ownerId: t.ownerId,
  assignedById: t.assignedById,
  due: t.due,
  status: t.status,
  blockedReason: t.blockedReason,
  isMilestone: t.isMilestone,
  waitingOnId: t.waitingOnId,
  completedAt: t.completedAt?.toISOString() ?? null,
});

// Best-effort per-IP throttle for the public sign-in form (on top of the
// per-member limit in the database).
const loginHits = new Map<string, number[]>();
async function ipAllowed(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (loginHits.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  recent.push(now);
  loginHits.set(ip, recent);
  return recent.length <= 20;
}

// ---------- undo ----------

export async function undo(fd: FormData) {
  const me = await requireMember();
  const label = await applyUndo(me, str(fd, "undoId", 40));
  if (label) await tell(me, `Undone: ${label}.`, { tone: "info" });
  else await tell(me, "That can't be undone anymore. It may be too old or already changed.", { tone: "error" });
  done(fd);
}

// ---------- sign-in ----------

// Duke NetID addresses (letters then digits, like abc123@duke.edu) reach the
// same inbox as the person's alias, but members are saved by alias.
const NETID_EMAIL = /^[a-z]{2,4}\d+@duke\.edu$/;

export async function requestLogin(fd: FormData) {
  const email = str(fd, "email", 254).toLowerCase();
  if (isEmail(email) && (await ipAllowed())) {
    const member = await db.member.findUnique({ where: { email } });
    // Point NetID addresses to the alias instead of silently sending nothing.
    // A member saved under their NetID still signs in normally.
    if (!member && NETID_EMAIL.test(email)) redirect("/login?error=netid");
    if (member && (await canSendLoginLink(member.id))) {
      const link = await createLoginLink(member.id, LOGIN_LINK_MINUTES);
      await sendEmail(
        member.email,
        "Your T4C Hub sign-in link",
        `Hi ${member.name},\n\nSign in here (link works once, for ${LOGIN_LINK_MINUTES} minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.`,
      );
    }
  }
  // Same response in every case, so the form never reveals who is a member.
  // No email in the URL: it would end up in browser history and logs.
  redirect("/login?sent=1");
}

export async function confirmLogin(fd: FormData) {
  const memberId = await consumeLoginToken(str(fd, "token", 100));
  if (!memberId) redirect("/login?error=expired");
  const member = await db.member.findUnique({ where: { id: memberId } });
  await startSession(memberId);
  await tell(null, member?.joinedAt ? `Welcome back, ${member.name}.` : `Welcome to the T4C Hub, ${member?.name}!`, { tone: "info" });
  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  await endSession();
  await tell(null, "You're signed out. Come back anytime with a new sign-in link.", { tone: "info" });
  revalidatePath("/", "layout");
  redirect("/login");
}

// ---------- admin ----------

async function sendInvite(member: { id: string; name: string; email: string }, inviter: string) {
  const link = await createLoginLink(member.id, INVITE_LINK_HOURS * 60);
  await sendEmail(
    member.email,
    "You're invited to the T4C Exec Hub",
    `Hi ${member.name},\n\n${inviter} invited you to the T4C Exec Hub.\n\nJoin here (this link is just for you, works once, and expires in ${INVITE_LINK_HOURS} hours):\n${link}\n\nAfter that you'll stay signed in on this device.`,
  );
}

function memberFields(fd: FormData) {
  const kind = str(fd, "kind");
  const order = Math.trunc(Number(str(fd, "sortOrder")));
  return {
    name: str(fd, "name", 80),
    email: str(fd, "email", 254).toLowerCase(),
    role: str(fd, "role", 100),
    kind: (MEMBER_KINDS as readonly string[]).includes(kind) ? kind : "exec",
    sortOrder: Number.isFinite(order) && order >= 0 && order <= 999 ? order : 100,
  };
}

function presetFor(fd: FormData, kind: string) {
  const name = str(fd, "preset");
  if (name === "admin" || name === "exec" || name === "adviser") return PRESETS[name].perms;
  return kind === "exec" ? PRESETS.exec.perms : PRESETS.adviser.perms;
}

export async function inviteMember(fd: FormData) {
  const me = await requirePermission("canManageMembers");
  const fields = memberFields(fd);
  if (!fields.name || !isEmail(fields.email)) return refuse(fd, "Add a name and a valid email to send an invite.", "/admin");
  if (await db.member.findUnique({ where: { email: fields.email } })) return refuse(fd, `${fields.email} is already a member.`, "/admin");
  const member = await db.member.create({ data: { ...fields, ...presetFor(fd, fields.kind) } });
  await sendInvite(member, me.name);
  await tell(me, `Invite sent to ${member.name}. Their link works once and expires in ${INVITE_LINK_HOURS} hours.`);
  done(fd, "/admin");
}

export async function resendInvite(fd: FormData) {
  const me = await requirePermission("canManageMembers");
  const member = await db.member.findUnique({ where: { id: str(fd, "memberId") } });
  if (member) {
    await sendInvite(member, me.name);
    await tell(me, `Sent ${member.name} a fresh sign-in link. Any older link stops working.`);
  }
  done(fd, "/admin");
}

export async function updateMember(fd: FormData) {
  const me = await requirePermission("canManageMembers");
  const id = str(fd, "memberId");
  const fields = memberFields(fd);
  if (!fields.name || !isEmail(fields.email)) return refuse(fd, "A name and a valid email are required.", "/admin");
  const clash = await db.member.findUnique({ where: { email: fields.email } });
  if (clash && clash.id !== id) return refuse(fd, `${fields.email} already belongs to ${clash.name}.`, "/admin");
  const prev = await db.member.findUnique({ where: { id }, select: { name: true, email: true, role: true, kind: true, sortOrder: true } });
  if (!prev) done(fd, "/admin");
  await db.member.update({ where: { id }, data: fields });
  await tell(me, `Saved ${fields.name}'s details.`, {
    undo: { kind: "member.fields", label: `changes to ${prev.name}`, payload: { id, prev }, needs: "canManageMembers" },
  });
  done(fd, "/admin");
}

// Saves one person's permissions, either from a preset button or from the
// individual checkboxes.
export async function setPermissions(fd: FormData) {
  const me = await requirePermission("canManageMembers");
  const id = str(fd, "memberId");
  const preset = str(fd, "preset");
  const perms: Record<string, boolean> =
    preset === "admin" || preset === "exec" || preset === "adviser"
      ? { ...PRESETS[preset].perms }
      : Object.fromEntries(PERMISSIONS.map(({ key }) => [key, fd.get(key) === "on"]));
  // Nobody can lock themselves (and so possibly everyone) out of member management.
  if (id === me.id) perms.canManageMembers = true;
  const member = await db.member.findUnique({ where: { id } });
  if (!member) done(fd, "/admin");
  const prev = Object.fromEntries(PERMISSIONS.map(({ key }) => [key, member[key]]));
  await db.member.update({ where: { id }, data: perms });
  await tell(me, `${member.name} is now set to: ${presetName(perms as PermissionSet)}.`, {
    undo: { kind: "member.perms", label: `permission change for ${member.name}`, payload: { id, prev }, needs: "canManageMembers" },
  });
  done(fd, "/admin");
}

// Their tasks stay in place as "up for grabs", so nothing is lost.
export async function removeMember(fd: FormData) {
  const me = await requirePermission("canManageMembers");
  const id = str(fd, "memberId");
  const member = id !== me.id ? await db.member.findUnique({ where: { id } }) : null;
  if (member) {
    const open = await db.task.count({ where: { ownerId: id, status: { notIn: ["done", "dropped"] } } });
    await db.member.delete({ where: { id } });
    await tell(me, `Removed ${member.name}.${open ? ` Their ${open} open task${open === 1 ? " is" : "s are"} now up for grabs.` : ""}`, {
      tone: "info",
      next: { label: "Invite someone", href: "/admin" },
    });
  }
  done(fd, "/admin");
}

// ---------- people ----------

export async function updateProfile(fd: FormData) {
  const me = await requireMember();
  const prev = { bio: me.bio, lore: me.lore, askMeAbout: me.askMeAbout, wantToLearn: me.wantToLearn };
  await db.member.update({
    where: { id: me.id },
    data: {
      bio: str(fd, "bio", LIMIT.text),
      lore: str(fd, "lore", LIMIT.text),
      askMeAbout: str(fd, "askMeAbout", LIMIT.line),
      wantToLearn: str(fd, "wantToLearn", LIMIT.line),
    },
  });
  await tell(me, "Profile saved. Everyone on the board can see it now.", {
    undo: { kind: "profile", label: "profile changes", payload: { prev } },
    next: { label: "Back to This Week", href: "/" },
  });
  done(fd, `/people/${me.id}`);
}

// ---------- accomplishments & shoutouts ----------

// Adds (shown) or hides a suggested win. The suggestion is looked up again
// server-side, so people can only claim work the hub actually saw them do.
export async function decideSuggestion(fd: FormData) {
  const me = await requireMember();
  const source = str(fd, "source");
  const sourceId = str(fd, "sourceId");
  const suggestion = (await suggestionsFor(me.id)).find((s) => s.source === source && s.sourceId === sourceId);
  if (suggestion) {
    const shown = str(fd, "decision") === "add";
    const a = await db.accomplishment.create({
      data: {
        memberId: me.id,
        source,
        sourceId,
        title: str(fd, "title") || suggestion.title,
        description: str(fd, "description", LIMIT.line),
        date: suggestion.date,
        shown,
      },
    });
    await tell(me, shown ? `Added “${a.title}” to your profile.` : "Hidden. It won't be suggested again.", {
      undo: { kind: "accomp.create", label: shown ? "adding that accomplishment" : "hiding that suggestion", payload: { id: a.id } },
    });
  }
  done(fd, `/people/${me.id}`);
}

export async function addAccomplishment(fd: FormData) {
  const me = await requireMember();
  const title = str(fd, "title");
  if (!title) return refuse(fd, "Say what happened first.", `/people/${me.id}`);
  const a = await db.accomplishment.create({
    data: { memberId: me.id, title, description: str(fd, "description", LIMIT.line), date: optDate(fd, "date") ?? todayISO() },
  });
  await tell(me, `Added “${a.title}” to your profile.`, { undo: { kind: "accomp.create", label: "adding that win", payload: { id: a.id } } });
  done(fd, `/people/${me.id}`);
}

export async function updateAccomplishment(fd: FormData) {
  const me = await requireMember();
  const a = await db.accomplishment.findUnique({ where: { id: str(fd, "accomplishmentId") } });
  if (a && a.memberId === me.id) {
    const shown = fd.get("shown") === "on";
    await db.accomplishment.update({
      where: { id: a.id },
      data: { title: str(fd, "title") || a.title, description: str(fd, "description", LIMIT.line), date: optDate(fd, "date") ?? a.date, shown },
    });
    await tell(me, shown ? "Saved." : "Saved and hidden from your profile.", {
      undo: { kind: "accomp.fields", label: "that edit", payload: { id: a.id, prev: { title: a.title, description: a.description, date: a.date, shown: a.shown } } },
    });
  }
  done(fd, `/people/${me.id}`);
}

export async function deleteAccomplishment(fd: FormData) {
  const me = await requireMember();
  // Only manual wins are deleted; suggested ones are hidden instead, so they
  // don't keep coming back as suggestions.
  const a = await db.accomplishment.findFirst({ where: { id: str(fd, "accomplishmentId"), memberId: me.id, source: "manual" } });
  if (a) {
    await db.accomplishment.delete({ where: { id: a.id } });
    await tell(me, `Deleted “${a.title}”.`, { tone: "info", undo: { kind: "accomp.delete", label: "the delete", payload: { data: a } } });
  }
  done(fd, `/people/${me.id}`);
}

export async function giveShoutout(fd: FormData) {
  const me = await requireMember();
  const toId = str(fd, "toId");
  const message = str(fd, "message", 200);
  if (!toId || toId === me.id || !(await memberExists(toId))) return refuse(fd, "Pick who the shoutout is for.", "/people");
  if (!message) return refuse(fd, "Write a line of thanks first.", "/people");
  const s = await db.shoutout.create({ data: { fromId: me.id, toId, message } });
  await notify(toId, me.id, `${me.name} gave you a shoutout: “${message}”`, `/people/${toId}`);
  await tell(me, `Shoutout sent to ${await nameOf(toId)}. It's on their profile now.`, {
    undo: { kind: "shoutout.give", label: "that shoutout", payload: { id: s.id } },
  });
  done(fd, "/people");
}

export async function deleteShoutout(fd: FormData) {
  const me = await requireMember();
  const s = await db.shoutout.findUnique({ where: { id: str(fd, "shoutoutId") } });
  if (s && (s.fromId === me.id || can(me, "canManageMembers"))) {
    await db.shoutout.delete({ where: { id: s.id } });
    await tell(me, "Shoutout removed.", { tone: "info", undo: { kind: "shoutout.delete", label: "removing that shoutout", payload: { data: s } } });
  }
  done(fd, "/people");
}

// ---------- projects ----------

export async function createProject(fd: FormData) {
  const me = await requirePermission("canCreateProjects");
  const title = str(fd, "title");
  if (!title) return refuse(fd, "Give the project a name first.", "/projects");
  const due = optDate(fd, "due");
  const templateId = str(fd, "templateId");
  if (templateId && !due) return refuse(fd, "Templates count back from the event date, so pick a due date.", "/projects");
  const wanted = str(fd, "ownerId");
  const ownerId = (await memberExists(wanted)) ? wanted : me.id;
  const project = await db.project.create({
    data: { title, goal: str(fd, "goal", LIMIT.line), due, ownerId, status: "active" },
  });
  const made = templateId && due ? await applyTemplate(templateId, project.id, due, me.id) : 0;
  await tell(me, made ? `Created “${title}” with ${made} tasks from the template.` : `Created “${title}”.`, {
    undo: { kind: "project.create", label: `creating “${title}”`, payload: { id: project.id }, needs: "canCreateProjects" },
    next: made ? undefined : { label: "Add the first task", href: `/projects/${project.id}#add-task` },
  });
  revalidatePath("/", "layout");
  redirect(`/projects/${project.id}`);
}

// Copies a template's tasks into a project: dates count back from the
// project's due date, owners come from matching exec roles (tasks whose role
// nobody holds are left up for grabs), and "waiting on" links are rebuilt.
async function applyTemplate(templateId: string, projectId: string, projectDue: string, assignerId: string): Promise<number> {
  const template = await db.template.findUnique({
    where: { id: templateId },
    include: { tasks: { orderBy: { position: "asc" } } },
  });
  if (!template) return 0;
  const members = await db.member.findMany({ where: { kind: "exec" } });
  const ownerFor = (role: string) =>
    members.find((m) => role && m.role.trim().toLowerCase() === role.trim().toLowerCase())?.id ?? null;

  const idByPosition = new Map<number, string>();
  const handedOut = new Map<string, number>();
  for (const tt of template.tasks) {
    const ownerId = ownerFor(tt.role);
    const task = await db.task.create({
      data: {
        title: tt.title,
        projectId,
        ownerId,
        assignedById: ownerId && ownerId !== assignerId ? assignerId : null,
        due: addDays(projectDue, tt.offsetDays),
        isMilestone: tt.isMilestone,
      },
    });
    idByPosition.set(tt.position, task.id);
    await joinWeek(ownerId, task.id, task.due);
    if (ownerId && ownerId !== assignerId) {
      handedOut.set(ownerId, (handedOut.get(ownerId) ?? 0) + 1);
    }
  }
  // One ping per person, not one per task.
  const project = await db.project.findUnique({ where: { id: projectId }, select: { title: true } });
  const assigner = await nameOf(assignerId);
  for (const [who, n] of handedOut)
    await notify(who, assignerId, `${assigner} gave you ${n} task${n === 1 ? "" : "s"} in “${project?.title}”.`, `/projects/${projectId}`);
  for (const tt of template.tasks) {
    const target = tt.waitingOnPosition == null ? undefined : idByPosition.get(tt.waitingOnPosition);
    const id = idByPosition.get(tt.position)!;
    const waitingOnId = target ? await validWaitingOn(id, target, projectId) : null;
    if (waitingOnId) await db.task.update({ where: { id }, data: { waitingOnId } });
  }
  return template.tasks.length;
}

// ---------- templates ----------

export async function createTemplate(fd: FormData) {
  const me = await requirePermission("canManageTemplates");
  const name = str(fd, "name", 80);
  if (!name) return refuse(fd, "Name the template first.", "/projects/templates");
  const t = await db.template.create({ data: { name, description: str(fd, "description", LIMIT.line) } });
  await tell(me, `Template “${name}” created. Add its tasks below.`);
  revalidatePath("/", "layout");
  redirect(`/projects/templates?open=${t.id}`);
}

export async function updateTemplate(fd: FormData) {
  const me = await requirePermission("canManageTemplates");
  const name = str(fd, "name", 80);
  await db.template.updateMany({
    where: { id: str(fd, "templateId") },
    data: { ...(name ? { name } : {}), description: str(fd, "description", LIMIT.line) },
  });
  await tell(me, "Template saved.");
  done(fd, "/projects/templates");
}

export async function deleteTemplate(fd: FormData) {
  const me = await requirePermission("canManageTemplates");
  await db.template.deleteMany({ where: { id: str(fd, "templateId") } });
  await tell(me, "Template deleted. Projects made from it are unchanged.", { tone: "info" });
  done(fd, "/projects/templates");
}

function templateTaskFields(fd: FormData) {
  const waiting = str(fd, "waitingOnPosition");
  const offset = Math.trunc(Number(str(fd, "offsetDays")));
  return {
    title: str(fd, "title"),
    offsetDays: Number.isFinite(offset) ? Math.max(-365, Math.min(365, offset)) : 0,
    isMilestone: fd.get("isMilestone") === "on",
    role: str(fd, "role", 100),
    waitingOnPosition: waiting === "" || !Number.isInteger(Number(waiting)) ? null : Number(waiting),
  };
}

export async function addTemplateTask(fd: FormData) {
  const me = await requirePermission("canManageTemplates");
  const templateId = str(fd, "templateId");
  const fields = templateTaskFields(fd);
  if (!fields.title) return refuse(fd, "Write the task's outcome first.", "/projects/templates");
  if (await db.template.count({ where: { id: templateId } })) {
    const last = await db.templateTask.findFirst({ where: { templateId }, orderBy: { position: "desc" } });
    await db.templateTask.create({ data: { ...fields, templateId, position: (last?.position ?? -1) + 1 } });
    await tell(me, "Task added to the template.");
  }
  done(fd, "/projects/templates");
}

export async function updateTemplateTask(fd: FormData) {
  const me = await requirePermission("canManageTemplates");
  const current = await db.templateTask.findUnique({ where: { id: str(fd, "templateTaskId") } });
  if (current) {
    const fields = templateTaskFields(fd);
    if (fields.waitingOnPosition === current.position) fields.waitingOnPosition = null;
    await db.templateTask.update({ where: { id: current.id }, data: { ...fields, title: fields.title || current.title } });
    await tell(me, "Template task saved.");
  }
  done(fd, "/projects/templates");
}

export async function deleteTemplateTask(fd: FormData) {
  const me = await requirePermission("canManageTemplates");
  const tt = await db.templateTask.findUnique({ where: { id: str(fd, "templateTaskId") } });
  if (tt) {
    await db.templateTask.updateMany({
      where: { templateId: tt.templateId, waitingOnPosition: tt.position },
      data: { waitingOnPosition: null },
    });
    await db.templateTask.delete({ where: { id: tt.id } });
    await tell(me, `Removed “${tt.title}” from the template.`, { tone: "info" });
  }
  done(fd, "/projects/templates");
}

// Turns a finished (or well-planned) project into a reusable template.
export async function saveProjectAsTemplate(fd: FormData) {
  const me = await requirePermission("canManageTemplates");
  const project = await db.project.findUnique({
    where: { id: str(fd, "projectId") },
    include: { tasks: { where: { status: { not: "dropped" } }, include: { owner: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!project) redirect("/projects");
  if (!project.due) return refuse(fd, "Give the project a due date first, so task dates can be saved relative to it.", `/projects/${project.id}`);
  const positionById = new Map(project.tasks.map((t, i) => [t.id, i]));
  const t = await db.template.create({
    data: {
      name: str(fd, "name", 80) || project.title,
      description: `Made from “${project.title}”. Due date = the event date.`,
      tasks: {
        create: project.tasks.map((task, position) => ({
          position,
          title: task.title,
          offsetDays: task.due ? daysBetween(project.due!, task.due) : 0,
          isMilestone: task.isMilestone,
          role: task.owner?.role ?? "",
          waitingOnPosition: task.waitingOnId ? (positionById.get(task.waitingOnId) ?? null) : null,
        })),
      },
    },
  });
  await tell(me, `Saved as the template “${t.name}”. New projects can start from it.`);
  revalidatePath("/", "layout");
  redirect(`/projects/templates?open=${t.id}`);
}

export async function proposeProject(fd: FormData) {
  const me = await requirePermission("canPropose");
  const title = str(fd, "title");
  if (!title) return refuse(fd, "Give your idea a short name first.", "/projects");
  const p = await db.project.create({ data: { title, goal: str(fd, "goal", LIMIT.text), status: "proposed", proposedById: me.id } });
  await tell(me, `Proposed “${title}”. An approver will review it; it's under Proposed until then.`, {
    undo: { kind: "project.propose", label: `proposing “${title}”`, payload: { id: p.id }, needs: "canPropose" },
  });
  done(fd, "/projects");
}

// Approving turns a proposal into an active project with an owner. Only
// proposals can be approved, so this can't revive or take over other projects.
export async function approveProposal(fd: FormData) {
  const me = await requirePermission("canApprove");
  const id = str(fd, "projectId");
  const project = await db.project.findFirst({ where: { id, status: "proposed" } });
  if (!project) return refuse(fd, "That proposal was already decided.", "/projects");
  const wanted = str(fd, "ownerId");
  const ownerId = (await memberExists(wanted)) ? wanted : me.id;
  await db.project.update({ where: { id }, data: { status: "active", ownerId } });
  await notify(project.proposedById, me.id, `${me.name} approved your idea “${project.title}”.`, `/projects/${id}`);
  if (ownerId !== project.proposedById) await notify(ownerId, me.id, `${me.name} made you the owner of “${project.title}”.`, `/projects/${id}`);
  await tell(me, `Approved “${project.title}”. ${ownerId === me.id ? "You own" : `${await nameOf(ownerId)} owns`} it now.`, {
    undo: { kind: "project.approve", label: `approving “${project.title}”`, payload: { id, prevOwnerId: project.ownerId }, needs: "canApprove" },
    next: { label: "Add tasks", href: `/projects/${id}#add-task` },
  });
  done(fd, "/projects");
}

export async function declineProposal(fd: FormData) {
  const me = await requirePermission("canApprove");
  const id = str(fd, "projectId");
  const project = await db.project.findFirst({ where: { id, status: "proposed" } });
  if (!project) return refuse(fd, "That proposal was already decided.", "/projects");
  await db.project.update({ where: { id }, data: { status: "declined" } });
  const reason = str(fd, "reason", LIMIT.line);
  const comment = reason ? await db.comment.create({ data: { projectId: id, authorId: me.id, body: `Not now: ${reason}` } }) : null;
  await notify(project.proposedById, me.id, `${me.name} said not now to “${project.title}”${reason ? `: ${reason}` : "."}`, `/projects/${id}`);
  await tell(me, `Declined “${project.title}” for now.${reason ? " Your reason is in its discussion." : ""}`, {
    tone: "info",
    undo: { kind: "project.decline", label: `declining “${project.title}”`, payload: { id, commentId: comment?.id }, needs: "canApprove" },
  });
  done(fd, "/projects");
}

export async function updateProject(fd: FormData) {
  const me = await requireMember();
  const project = await db.project.findUnique({ where: { id: str(fd, "projectId") } });
  if (!project) throw new Error("That project no longer exists.");
  if (project.ownerId !== me.id && !can(me, "canManageTasks") && !can(me, "canCreateProjects")) forbid();
  const status = str(fd, "status");
  const wanted = str(fd, "ownerId");
  const next = {
    title: str(fd, "title") || project.title,
    goal: str(fd, "goal", LIMIT.text),
    due: optDate(fd, "due"),
    ownerId: (await memberExists(wanted)) ? wanted : project.ownerId,
    // Proposals change status only through approve/decline.
    status:
      project.kind !== "folder" && ["active", "done"].includes(status) && ["active", "done"].includes(project.status) ? status : project.status,
  };
  await db.project.update({ where: { id: project.id }, data: next });
  const finished = next.status === "done" && project.status !== "done";
  await tell(me, finished ? `“${next.title}” is marked done. Nice work!` : "Project saved.", {
    undo: {
      kind: "project.fields",
      label: "those project changes",
      payload: { id: project.id, prev: { title: project.title, goal: project.goal, due: project.due, ownerId: project.ownerId, status: project.status } },
    },
    next: finished ? { label: "Add it to your profile", href: `/people/${me.id}` } : undefined,
  });
  done(fd, `/projects/${project.id}`);
}

// Deleting a project folder takes its tasks, links, and discussion with it.
// Role folders are standing areas and can't be deleted.
export async function deleteProject(fd: FormData) {
  const me = await requireMember();
  const project = await db.project.findUnique({ where: { id: str(fd, "projectId") }, include: { _count: { select: { tasks: true } } } });
  if (!project) redirect("/projects");
  if (project.kind === "folder") forbid();
  const mayDelete =
    project.ownerId === me.id || can(me, "canCreateProjects") || (project.status === "proposed" && project.proposedById === me.id);
  if (!mayDelete) forbid();
  await db.project.delete({ where: { id: project.id } });
  const n = project._count.tasks;
  await tell(me, `Deleted “${project.title}”${n ? ` and its ${n} task${n === 1 ? "" : "s"}` : ""}.`, { tone: "info" });
  revalidatePath("/", "layout");
  redirect("/projects");
}

// ---------- tasks ----------

// Execs can add tasks for themselves anywhere. Assigning someone else, or
// leaving a task up for grabs, takes the project's owner or "manage tasks".
export async function createTask(fd: FormData) {
  const me = await requireExec();
  const title = str(fd, "title");
  const projectId = str(fd, "projectId");
  if (!title) return refuse(fd, "Write the task's outcome first.");
  const project = projectId ? await db.project.findUnique({ where: { id: projectId } }) : null;
  if (projectId && (!project || project.status !== "active")) forbid();
  const manages = can(me, "canManageTasks") || project?.ownerId === me.id;
  const owners = manages ? await ownersFor(str(fd, "ownerId"), me) : [me.id];
  const taskIds: string[] = [];
  let onCards = 0;
  for (const ownerId of owners) {
    const task = await db.task.create({
      data: {
        title,
        projectId: projectId || null,
        ownerId,
        assignedById: ownerId && ownerId !== me.id ? me.id : null,
        description: str(fd, "description", LIMIT.text),
        due: optDate(fd, "due"),
        dueTime: optTime(fd, "dueTime"),
      },
    });
    taskIds.push(task.id);
    const waitingOnId = await validWaitingOn(task.id, str(fd, "waitingOnId"), task.projectId);
    if (waitingOnId) await db.task.update({ where: { id: task.id }, data: { waitingOnId } });
    const onCard = await joinWeek(ownerId, task.id, task.due);
    onCards += Number(onCard);
    if (ownerId && ownerId !== me.id) {
      await notify(ownerId, me.id, `${me.name} gave you “${title}”${project ? ` in ${project.title}` : ""}. ${cardPlacement(Number(onCard), 1)}`, `/?task=${task.id}`);
    }
  }
  const [ownerId] = owners;
  const who =
    owners.length > 1 ? `Everyone has their own copy (${owners.length} people)`
    : !ownerId ? "It's up for grabs" : ownerId === me.id ? "It's yours" : `It's assigned to ${await nameOf(ownerId)}`;
  await tell(me, `Added “${title}”. ${who}. ${ownerId || owners.length > 1 ? cardPlacement(onCards, owners.length) : "An exec can take it on from the task panel."}`, { undo: { kind: "task.create", label: `adding “${title}”`, payload: { taskIds } } });
  done(fd);
}

export async function updateTask(fd: FormData) {
  const { me, task, canEdit } = await taskForEdit(str(fd, "taskId"));
  if (!canEdit) forbid();
  const status = TASK_STATUSES.includes(str(fd, "status")) ? str(fd, "status") : task.status;
  const wanted = str(fd, "ownerId");
  // Owners can hand a task to someone or release it; both count as assigning.
  const ownerId = wanted === OPEN ? null : (await memberExists(wanted)) ? wanted : task.ownerId;
  const reassigned = ownerId !== task.ownerId;
  const due = optDate(fd, "due");
  const waitingOnId = await validWaitingOn(task.id, str(fd, "waitingOnId"), task.projectId);
  let result: { commitments?: Awaited<ReturnType<typeof moveCommitments>>; onCard: boolean };
  try {
    result = await db.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id, ownerId: task.ownerId },
        data: {
          title: str(fd, "title") || task.title,
          description: str(fd, "description", LIMIT.text),
          ownerId,
          ...(reassigned ? { assignedById: ownerId && ownerId !== me.id ? me.id : null } : {}),
          due,
          dueTime: optTime(fd, "dueTime"),
          status,
          blockedReason: status === "blocked" ? str(fd, "blockedReason", LIMIT.line) : "",
          waitingOnId,
          completedAt: status === "done" ? (task.completedAt ?? new Date()) : null,
        },
      });
      const commitments = reassigned ? await moveCommitments(tx, task.id, ownerId) : undefined;
      const onCard = reassigned && status !== "done" && status !== "dropped"
        ? await joinWeek(ownerId, task.id, due, tx) : false;
      return { commitments, onCard };
    });
  } catch (err) {
    // Someone handed the task to another person while this form was open.
    if ((err as { code?: string }).code === "P2025")
      return refuse(fd, "Someone changed who owns this task while you were editing, so nothing was saved. Have a look and try again.");
    throw err;
  }
  if (reassigned && ownerId && ownerId !== me.id) {
    await notify(ownerId, me.id, `${me.name} gave you “${task.title}”. ${cardPlacement(Number(result.onCard), 1)}`, `/?task=${task.id}`);
  }
  const handed = reassigned
    ? ownerId ? ` ${ownerId === me.id ? "You own it now" : `${await nameOf(ownerId)} owns it now`}. ${cardPlacement(Number(result.onCard), 1)}`
      : " It's up for grabs now and off the previous owner's current and future cards."
    : "";
  await tell(me, `Saved.${handed}`, {
    undo: { kind: "task.fields", label: "those task changes", payload: { taskId: task.id, ownerAfter: ownerId, prev: snapshotTask(task), commitments: result.commitments } },
  });
  done(fd);
}

// One-click status change from the task panel.
export async function setTaskStatus(fd: FormData) {
  const { me, task, canEdit } = await taskForEdit(str(fd, "taskId"));
  if (!canEdit) forbid();
  const status = str(fd, "status");
  if (!TASK_STATUSES.includes(status) || status === task.status && status !== "blocked") done(fd);
  const xpBefore = task.ownerId ? await xpFor(task.ownerId) : 0;
  await db.task.update({
    where: { id: task.id },
    data: {
      status,
      blockedReason: status === "blocked" ? str(fd, "blockedReason", LIMIT.line) : "",
      completedAt: status === "done" ? (task.completedAt ?? new Date()) : null,
    },
  });
  // Finishing a task closes its open help requests.
  let reopenRequests: string[] = [];
  if (status === "done" || status === "dropped") {
    reopenRequests = (await db.helpRequest.findMany({ where: { taskId: task.id, status: "open" }, select: { id: true } })).map((r) => r.id);
    await db.helpRequest.updateMany({ where: { id: { in: reopenRequests } }, data: { status: "resolved" } });
  }
  const text =
    status === "done"
      ? `Marked “${task.title}” done.${task.ownerId === me.id ? await xpNote(me.id, xpBefore) : ""}`
      : status === "dropped"
        ? `Dropped “${task.title}”. It stays in the project as dropped.`
        : status === "blocked"
          ? `Marked blocked. It's flagged on This Week so people can help.`
          : `Marked ${STATUS_WORDS[status]}.`;
  await tell(me, text, {
    tone: status === "dropped" ? "info" : "success",
    undo: {
      kind: "task.status",
      label: `marking it ${STATUS_WORDS[status]}`,
      payload: { taskId: task.id, status: task.status, blockedReason: task.blockedReason, completedAt: task.completedAt?.toISOString() ?? null, reopenRequests },
    },
  });
  done(fd);
}

// "Take this on": claims an up-for-grabs task, optionally straight into this
// week's commitments. Only works while nobody owns it, so two people can't
// both end up with it.
export async function claimTask(fd: FormData) {
  const me = await requireExec();
  const taskId = str(fd, "taskId");
  const task = await db.task.findUnique({ where: { id: taskId } });
  const { count } = await db.task.updateMany({
    where: { id: taskId, ownerId: null, status: { notIn: ["done", "dropped"] } },
    data: { ownerId: me.id, assignedById: null },
  });
  if (!count || !task) return refuse(fd, "Someone else just took that one. Have a look at what's still up for grabs.");
  let commitmentId: string | undefined;
  let full = false;
  if (str(fd, "commit") === "yes") {
    const week = activeWeek();
    const count = await db.commitment.count({ where: { memberId: me.id, weekStart: week, task: { status: { notIn: ["done", "dropped"] } } } });
    if (count < MAX_COMMITMENTS) commitmentId = (await db.commitment.create({ data: { memberId: me.id, taskId, weekStart: week } })).id;
    else full = true;
  }
  await tell(
    me,
    commitmentId
      ? `You took on “${task.title}”. It's on your card this week.`
      : full
        ? `You took on “${task.title}”. Your week is full, so it's waiting in your check-in.`
        : `You took on “${task.title}”. Pick it as a commitment in your next check-in.`,
    { undo: { kind: "task.claim", label: `taking on “${task.title}”`, payload: { taskId, commitmentId } } },
  );
  done(fd);
}

// Adds a task you own to this week's card, or takes it off. Lets people
// adjust their week without redoing the whole check-in.
export async function toggleThisWeek(fd: FormData) {
  const me = await requireExec();
  const task = await db.task.findUnique({ where: { id: str(fd, "taskId") } });
  if (!task || task.ownerId !== me.id) return refuse(fd, "Only the task's owner can add it to their week.");
  const week = activeWeek();
  const existing = await db.commitment.findFirst({ where: { memberId: me.id, taskId: task.id, weekStart: week } });
  if (existing) {
    await db.commitment.delete({ where: { id: existing.id } });
    await tell(me, `Took “${task.title}” off your card this week.`, { tone: "info" });
  } else {
    const count = await db.commitment.count({ where: { memberId: me.id, weekStart: week, task: { status: { notIn: ["done", "dropped"] } } } });
    if (count >= MAX_COMMITMENTS) return refuse(fd, `Your week already has ${count} things on it. Take something off first.`);
    await db.commitment.create({ data: { memberId: me.id, taskId: task.id, weekStart: week } });
    await tell(
      me,
      count + 1 > TARGET_COMMITMENTS
        ? `Added “${task.title}” to your week. That's ${count + 1} things; make sure they're all realistic.`
        : `Added “${task.title}” to your card this week.`,
    );
  }
  done(fd);
}

// A nudge to a task's owner, e.g. "any update on the room booking?".
export async function pingOwner(fd: FormData) {
  const me = await requireMember();
  const task = await db.task.findUnique({ where: { id: str(fd, "taskId") } });
  if (!task?.ownerId || task.ownerId === me.id) return refuse(fd, "That task has no one else to ping.");
  const recent = await db.notification.count({
    where: { toId: task.ownerId, fromId: me.id, href: `/?task=${task.id}`, createdAt: { gte: new Date(Date.now() - 6 * 3600_000) } },
  });
  if (recent) return refuse(fd, "You already pinged them about this in the last few hours.");
  const note = str(fd, "message", 200);
  await notify(task.ownerId, me.id, `${me.name} pinged you about “${task.title}”${note ? `: ${note}` : "."}`, `/?task=${task.id}`);
  await tell(me, `Pinged ${await nameOf(task.ownerId)}. They'll see it under the bell.`);
  done(fd);
}

// ---------- help ----------

export async function requestHelp(fd: FormData) {
  const { me, task, canEdit } = await taskForEdit(str(fd, "taskId"));
  if (!canEdit) forbid();
  const message = str(fd, "message", LIMIT.line);
  if (!message) return refuse(fd, "Say what help would unblock this.");
  const r = await db.helpRequest.create({ data: { taskId: task.id, requestedById: me.id, message } });
  await pingMentions(message, me, `in a help request on “${task.title}”`, `/?task=${task.id}`);
  await tell(me, "Help request posted. It's at the top of This Week under Help wanted.", {
    undo: { kind: "help.request", label: "that help request", payload: { id: r.id } },
  });
  done(fd);
}

export async function resolveHelpRequest(fd: FormData) {
  const me = await requireMember();
  const req = await db.helpRequest.findUnique({ where: { id: str(fd, "requestId") } });
  if (req) {
    const { canEdit } = await taskForEdit(req.taskId);
    if (!canEdit) forbid();
    await db.helpRequest.update({ where: { id: req.id }, data: { status: "resolved" } });
    await tell(me, "Marked as handled. It's off the Help wanted list.", {
      undo: { kind: "help.resolve", label: "marking it handled", payload: { id: req.id } },
    });
  }
  done(fd);
}

export async function offerHelp(fd: FormData) {
  const me = await requireMember();
  const contribution = str(fd, "contribution", LIMIT.line);
  const task = await db.task.findUnique({ where: { id: str(fd, "taskId") } });
  // Open tasks have no owner to help; people take them on instead.
  if (!task || !task.ownerId || task.ownerId === me.id || task.status === "done" || task.status === "dropped")
    return refuse(fd, "That task isn't taking help offers right now.");
  if (!contribution) return refuse(fd, "Say what you'll do, so the owner knows what to expect.");
  // One live offer per person per task: offering again updates it.
  const existing = await db.helpOffer.findFirst({ where: { taskId: task.id, helperId: me.id, status: { not: "declined" } } });
  const offer = existing
    ? await db.helpOffer.update({ where: { id: existing.id }, data: { contribution } })
    : await db.helpOffer.create({ data: { taskId: task.id, helperId: me.id, contribution } });
  const owner = await nameOf(task.ownerId);
  if (!existing) await notify(task.ownerId, me.id, `${me.name} offered to help with “${task.title}”: ${contribution}`, `/?task=${task.id}`);
  await tell(me, existing ? "Offer updated." : `Offer sent. ${owner} can accept it or let you know it's covered.`, {
    undo: { kind: "offer", label: "that offer", payload: { id: offer.id, prevContribution: existing?.contribution ?? null } },
  });
  done(fd);
}

export async function respondToOffer(fd: FormData) {
  const me = await requireMember();
  const offer = await db.helpOffer.findUnique({ where: { id: str(fd, "offerId") }, include: { helper: true } });
  if (offer) {
    const { canEdit } = await taskForEdit(offer.taskId);
    if (!canEdit) forbid();
    const status = str(fd, "response") === "accept" ? "accepted" : "declined";
    await db.helpOffer.update({ where: { id: offer.id }, data: { status } });
    const task = await db.task.findUnique({ where: { id: offer.taskId }, select: { title: true } });
    await notify(
      offer.helperId,
      me.id,
      status === "accepted" ? `${me.name} accepted your help on “${task?.title}”.` : `${me.name} has “${task?.title}” covered. Thanks for offering!`,
      `/?task=${offer.taskId}`,
    );
    await tell(me, status === "accepted" ? `Accepted ${offer.helper.name}'s help. You still own the outcome.` : `Let ${offer.helper.name} know it's covered.`, {
      undo: { kind: "offer.respond", label: "that reply", payload: { id: offer.id } },
      next: status === "accepted" ? { label: `Thank ${offer.helper.name}`, href: `/people/${offer.helperId}` } : undefined,
    });
  }
  done(fd);
}

// ---------- comments & links ----------

// Comments and links attach to exactly one existing task or project.
async function attachTarget(fd: FormData): Promise<{ taskId: string | null; projectId: string | null }> {
  const taskId = str(fd, "taskId");
  const projectId = str(fd, "projectId");
  if (taskId && !projectId && (await db.task.count({ where: { id: taskId } }))) return { taskId, projectId: null };
  if (projectId && !taskId && (await projectExists(projectId))) return { taskId: null, projectId };
  forbid();
}

export async function addComment(fd: FormData) {
  const me = await requireMember();
  const body = str(fd, "body", LIMIT.text);
  if (!body) return refuse(fd, "Write something first.");
  const c = await db.comment.create({ data: { body, authorId: me.id, ...(await attachTarget(fd)) } });
  const on = c.taskId
    ? await db.task.findUnique({ where: { id: c.taskId }, select: { title: true } })
    : await db.project.findUnique({ where: { id: c.projectId! }, select: { title: true } });
  const pinged = await pingMentions(body, me, `on “${on?.title}”`, c.taskId ? `/?task=${c.taskId}` : `/projects/${c.projectId}`);
  await tell(me, pinged.length ? `Comment posted. Pinged ${pinged.join(", ")}.` : "Comment posted.", {
    undo: { kind: "comment", label: "that comment", payload: { id: c.id } },
  });
  done(fd);
}

export async function addLink(fd: FormData) {
  const me = await requireMember();
  const url = str(fd, "url", 2000);
  let ok = false;
  try {
    ok = ["http:", "https:"].includes(new URL(url).protocol);
  } catch {}
  if (!ok) return refuse(fd, "That doesn't look like a web link. Paste the full address, starting with https://");
  const link = await db.link.create({ data: { url, title: str(fd, "title") || url.slice(0, LIMIT.title), addedById: me.id, ...(await attachTarget(fd)) } });
  await tell(me, `Link added: ${link.title}.`, { undo: { kind: "link.add", label: "adding that link", payload: { id: link.id } } });
  done(fd);
}

export async function removeLink(fd: FormData) {
  const me = await requireMember();
  const link = await db.link.findUnique({
    where: { id: str(fd, "linkId") },
    include: { task: { include: { project: true } }, project: true },
  });
  if (link) {
    // The person who added it, the task or project owner, or a task manager.
    const allowed =
      can(me, "canManageTasks") ||
      link.addedById === me.id ||
      link.task?.ownerId === me.id ||
      link.task?.project?.ownerId === me.id ||
      link.project?.ownerId === me.id;
    if (!allowed) forbid();
    await db.link.delete({ where: { id: link.id } });
    const { task: _t, project: _p, ...data } = link;
    await tell(me, `Removed the link “${link.title}”.`, { tone: "info", undo: { kind: "link.remove", label: "removing that link", payload: { data } } });
  }
  done(fd);
}

// ---------- weekly check-in ----------

export type CheckInResult = { error?: string };

export async function submitCheckIn(_prev: CheckInResult, fd: FormData): Promise<CheckInResult> {
  const me = await requireExec();
  const current = activeWeek();
  const week = str(fd, "week");
  if (week !== current && week !== addDays(current, 7))
    return { error: "The week has changed. Refresh to plan this week or next week." };

  const ids = [...new Set(fd.getAll("task").map(String))];
  const claimIds = [...new Set(fd.getAll("claim").map(String))];
  const tasks = await db.task.findMany({ where: { id: { in: ids }, ownerId: me.id, status: { notIn: ["done", "dropped"] } } });
  if (tasks.length !== ids.length) return { error: "Some tasks changed ownership or status. Refresh to see your latest work." };
  const plans = tasks.map((task) => ({ task, choice: str(fd, `plan_${task.id}`), due: optDate(fd, `date_${task.id}`), help: str(fd, `help_${task.id}`, LIMIT.line) }));
  if (plans.some((p) => !["week", "later", "done"].includes(p.choice))) return { error: "Choose This week, Later, or Done for each task." };

  const newRows = [0, 1, 2, 3, 4].map((i) => ({
    title: str(fd, `new_title_${i}`), description: str(fd, `new_details_${i}`, LIMIT.text),
    projectId: str(fd, `new_project_${i}`), due: optDate(fd, `new_due_${i}`),
  })).filter((r) => r.title);
  const total = plans.filter((p) => p.choice === "week").length + claimIds.length + newRows.length;
  if (total > MAX_COMMITMENTS) return { error: `That's ${total} commitments. Keep it to ${MAX_COMMITMENTS} or fewer.` };
  for (const r of newRows) {
    if (r.projectId && !(await projectExists(r.projectId, "active")))
      return { error: "One of the selected folders is no longer active. Refresh and choose another." };
  }
  const home = await homeFolder(me.id);
  const xpBefore = await xpFor(me.id);
  const stale = "A task changed while you were saving. Refresh and try again.";
  let saved: { count: number; lost: number; finished: object[] };
  try {
    saved = await db.$transaction(async (tx) => {
      const taskIds: string[] = [];
      const finishedTasks: object[] = [];
      for (const { task, choice, due, help } of plans) {
        const finished = choice === "done";
        if (finished) {
          // Remember enough to put it back if they press Undo.
          const reopen = await tx.helpRequest.findMany({ where: { taskId: task.id, status: "open" }, select: { id: true } });
          const later = await tx.commitment.findMany({ where: { taskId: task.id, weekStart: { gt: current } } });
          finishedTasks.push({
            taskId: task.id, status: task.status, blockedReason: task.blockedReason,
            reopenRequests: reopen.map((r) => r.id), commitments: later.map((c) => ({ memberId: c.memberId, taskId: c.taskId, weekStart: c.weekStart })),
          });
        }
        const { count } = await tx.task.updateMany({
          where: { id: task.id, ownerId: me.id, status: task.status },
          data: finished ? { status: "done", completedAt: new Date(), blockedReason: "" } : { due },
        });
        if (!count) throw new Error(stale);
        if (finished) {
          await tx.helpRequest.updateMany({ where: { taskId: task.id, status: "open" }, data: { status: "resolved" } });
          await tx.commitment.deleteMany({ where: { taskId: task.id, weekStart: { gt: current } } });
        } else if (help) {
          await tx.helpRequest.create({ data: { taskId: task.id, requestedById: me.id, message: help } });
        }
        if (choice === "week") taskIds.push(task.id);
      }
      let lost = 0;
      for (const id of claimIds) {
        const { count } = await tx.task.updateMany({
          where: { id, ownerId: null, status: { notIn: ["done", "dropped"] } },
          data: { ownerId: me.id, assignedById: null },
        });
        if (count) taskIds.push(id); else lost++;
      }
      for (const r of newRows) {
        const task = await tx.task.create({ data: { ...r, projectId: r.projectId || home, ownerId: me.id } });
        taskIds.push(task.id);
      }
      // Preserve completed work on the current card; replace only the open plan.
      await tx.commitment.deleteMany({ where: { memberId: me.id, weekStart: week, ...(week === current ? { task: { status: { not: "done" } } } : {}) } });
      for (const taskId of taskIds) {
        const key = { memberId: me.id, taskId, weekStart: week };
        await tx.commitment.upsert({ where: { memberId_taskId_weekStart: key }, update: {}, create: key });
      }
      const count = await tx.commitment.count({ where: { memberId: me.id, weekStart: week, task: { status: { notIn: ["done", "dropped"] } } } });
      if (count > MAX_COMMITMENTS) throw new Error(`Your card has ${count} items of open work. Keep it to ${MAX_COMMITMENTS} or fewer.`);
      await tx.checkIn.upsert({
        where: { memberId_weekStart: { memberId: me.id, weekStart: week } },
        update: { submittedAt: new Date() }, create: { memberId: me.id, weekStart: week },
      });
      return { count: taskIds.length, lost, finished: finishedTasks };
    });
  } catch (error) {
    if (error instanceof Error && (error.message === stale || error.message.startsWith("Your card has"))) return { error: error.message };
    throw error;
  }
  for (const { task, choice, help } of plans) {
    if (choice !== "done" && help) await pingMentions(help, me, `in a help request on “${task.title}”`, `/?task=${task.id}`);
  }
  await tell(me, `${week === current ? "This week's" : "Next week's"} plan saved: ${saved.count} commitment${saved.count === 1 ? "" : "s"}.${saved.lost ? ` ${saved.lost} up-for-grabs task${saved.lost === 1 ? " was" : "s were"} already taken.` : ""}${await xpNote(me.id, xpBefore)}`, {
    next: { label: "Edit plan", href: `/checkin?week=${week}` },
    ...(saved.finished.length
      ? { undo: { kind: "checkin.done", label: `marking ${saved.finished.length === 1 ? "that task" : `${saved.finished.length} tasks`} done`, payload: { tasks: saved.finished } } }
      : {}),
  });
  revalidatePath("/", "layout");
  redirect(week === current ? "/" : `/?week=${week}`);
}

// ---------- calendar ----------

// Creates (or replaces) the secret key in this person's calendar feed URL.
// Replacing it stops any old copy of the link from working.
export async function resetCalendarToken() {
  const me = await requireMember();
  const had = !!me.calendarToken;
  await db.member.update({ where: { id: me.id }, data: { calendarToken: randomBytes(24).toString("base64url") } });
  await tell(me, had ? "New calendar link ready. The old one no longer works, so subscribe again with this one." : "Your private calendar link is ready. Add it to Google Calendar below.");
  revalidatePath("/", "layout");
  redirect("/calendar?subscribe=1#subscribe");
}

// ---------- meetings ----------

export async function createMeeting(fd: FormData) {
  const me = await requirePermission("canWriteNotes");
  const meeting = await db.meeting.create({
    data: { date: optDate(fd, "date") ?? todayISO(), time: optTime(fd, "time"), title: str(fd, "title", 120) || "Exec meeting", createdById: me.id },
  });
  await tell(me, "Meeting page started. The agenda is pulled from the board; take notes below.", { tone: "info" });
  revalidatePath("/", "layout");
  redirect(`/meetings/${meeting.id}`);
}

export async function updateMeeting(fd: FormData) {
  const me = await requirePermission("canWriteNotes");
  const id = str(fd, "meetingId");
  const meeting = await db.meeting.findUnique({ where: { id } });
  if (!meeting) redirect("/meetings");
  const date = optDate(fd, "date");
  await db.meeting.update({
    where: { id },
    data: {
      ...(date ? { date } : {}),
      time: optTime(fd, "time"),
      title: str(fd, "title", 120) || "Exec meeting",
      notes: str(fd, "notes", 20000),
      decisions: str(fd, "decisions", LIMIT.text),
    },
  });
  const pinged = await pingMentions(
    `${str(fd, "notes", 20000)}\n${str(fd, "decisions", LIMIT.text)}`,
    me,
    `in the notes for “${meeting.title}”`,
    `/meetings/${id}`,
    `${meeting.notes}\n${meeting.decisions}`,
  );
  await tell(me, pinged.length ? `Notes saved. Pinged ${pinged.join(", ")}.` : "Notes saved. Everyone can read them on this page.", {
    undo: {
      kind: "meeting.fields",
      label: "those note changes",
      payload: { id, prev: { date: meeting.date, time: meeting.time, title: meeting.title, notes: meeting.notes, decisions: meeting.decisions } },
      needs: "canWriteNotes",
    },
  });
  done(fd, `/meetings/${id}`);
}

export async function deleteMeeting(fd: FormData) {
  const me = await requirePermission("canWriteNotes");
  const meeting = await db.meeting.findUnique({ where: { id: str(fd, "meetingId") }, include: { tasks: { select: { id: true } } } });
  if (meeting) {
    const { tasks, ...data } = meeting;
    // Action items stay on the board; they just lose the link to the meeting.
    await db.meeting.delete({ where: { id: meeting.id } });
    await tell(me, `Deleted the notes for “${meeting.title}”. Its action items are still on the board.`, {
      tone: "info",
      undo: { kind: "meeting.delete", label: "deleting those notes", payload: { data, taskIds: tasks.map((t) => t.id) }, needs: "canWriteNotes" },
    });
  }
  revalidatePath("/", "layout");
  redirect("/meetings");
}

// Action items are ordinary tasks, so they show up on This Week and the calendar.
export async function addActionItem(fd: FormData) {
  const me = await requirePermission("canWriteNotes");
  const meetingId = str(fd, "meetingId");
  const title = str(fd, "title");
  if (!(await db.meeting.count({ where: { id: meetingId } }))) redirect("/meetings");
  if (!title) return refuse(fd, "Write the action item first.", `/meetings/${meetingId}`);
  const owners = await ownersFor(str(fd, "ownerId"), me);
  const wantedProject = str(fd, "projectId");
  const projectId =
    wantedProject && (await projectExists(wantedProject, "active"))
      ? wantedProject
      : ((await db.project.findFirst({ where: { kind: "folder", title: DEFAULT_FOLDER }, select: { id: true } }))?.id ?? null);
  const taskIds: string[] = [];
  let onCards = 0;
  for (const ownerId of owners) {
    const task = await db.task.create({
      data: { title, meetingId, ownerId, assignedById: ownerId && ownerId !== me.id ? me.id : null, due: optDate(fd, "due"), projectId },
    });
    taskIds.push(task.id);
    const onCard = await joinWeek(ownerId, task.id, task.due);
    onCards += Number(onCard);
    if (ownerId && ownerId !== me.id) {
      await notify(ownerId, me.id, `${me.name} gave you an action item: “${title}”. ${cardPlacement(Number(onCard), 1)}`, `/?task=${task.id}`);
    }
  }
  const [ownerId] = owners;
  const who =
    owners.length > 1 ? `Everyone has their own copy (${owners.length} people)`
    : !ownerId ? "It's up for grabs on the board" : ownerId === me.id ? "It's yours" : `${await nameOf(ownerId)} has been pinged`;
  await tell(me, `Action item added. ${who}. ${ownerId || owners.length > 1 ? cardPlacement(onCards, owners.length) : "An exec can take it on from the task panel."}`, { undo: { kind: "task.create", label: `adding “${title}”`, payload: { taskIds } } });
  done(fd, `/meetings/${meetingId}`);
}

// ---------- pings & profile ----------

// Called once a minute by an open hub tab, to show you as online.
export async function heartbeat() {
  const me = await currentMember();
  if (!me) return;
  await db.member.update({ where: { id: me.id }, data: { lastSeenAt: new Date() } });
}

export async function markNotificationsRead() {
  const me = await requireMember();
  await db.notification.updateMany({ where: { toId: me.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function updateAvatar(fd: FormData) {
  const me = await requireMember();
  const color = str(fd, "avatarColor");
  const shape = str(fd, "avatarShape");
  const face = str(fd, "avatarFace");
  const extra = str(fd, "avatarExtra");
  await db.member.update({
    where: { id: me.id },
    data: {
      avatarColor: color in AVATAR_COLORS ? color : me.avatarColor,
      avatarShape: (AVATAR_SHAPES as readonly string[]).includes(shape) ? shape : me.avatarShape,
      avatarFace: (AVATAR_FACES as readonly string[]).includes(face) ? face : me.avatarFace,
      avatarExtra: (AVATAR_EXTRAS as readonly string[]).includes(extra) ? extra : me.avatarExtra,
    },
  });
  await tell(me, "Your buddy is saved. It shows everywhere your avatar appears.", {
    undo: { kind: "profile", label: "the new look", payload: { prev: { avatarColor: me.avatarColor, avatarShape: me.avatarShape, avatarFace: me.avatarFace, avatarExtra: me.avatarExtra } } },
  });
  done(fd, `/people/${me.id}`);
}

// The welcome tour was finished or skipped; don't show it again.
export async function finishTour() {
  const me = await requireMember();
  await db.member.update({ where: { id: me.id }, data: { tutorialSeenAt: new Date() } });
}
