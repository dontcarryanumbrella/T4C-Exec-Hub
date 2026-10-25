// Seeds the exec roster with placeholder people, one per role. Safe to re-run:
// existing emails are left alone. Change the names and emails (here, or on the
// Admin page) before inviting real people.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roster = [
  { name: "Avery", role: "President", email: "president@example.com", isAdmin: true },
  { name: "Sam", role: "Vice President", email: "vp@example.com", isAdmin: true },
  { name: "Jordan", role: "Director of Professional Development", email: "profdev@example.com" },
  { name: "Riley", role: "Director of Partnerships & External Relations", email: "partnerships@example.com" },
  { name: "Casey", role: "Director of Internal Communications", email: "comms@example.com" },
  { name: "Morgan", role: "Director of Brand & Marketing", email: "brand@example.com" },
  { name: "Taylor", role: "Director of Finance & Development", email: "finance@example.com" },
  { name: "Quinn", role: "Director of Programming", email: "programming@example.com" },
  { name: "Rowan", role: "Director of Research", email: "research@example.com" },
];

// Mirrors PRESETS in src/lib/permissions.ts.
const ADMIN = { canPropose: true, canCreateProjects: true, canApprove: true, canManageTasks: true, canWriteNotes: true, canManageTemplates: true, canManageMembers: true };
const EXEC = { canPropose: true, canWriteNotes: true };

for (const [i, { isAdmin, ...m }] of roster.entries()) {
  await prisma.member.upsert({
    where: { email: m.email },
    update: {},
    create: { ...m, kind: "exec", sortOrder: i, ...(isAdmin ? ADMIN : EXEC) },
  });
}

console.log(`Seeded ${roster.length} members.`);

// Starter templates. Each task: [title, days relative to the event date,
// milestone?, default owner's role, position of the task it waits on].
const PD = "Director of Professional Development";
const PARTNER = "Director of Partnerships & External Relations";
const COMMS = "Director of Internal Communications";
const BRAND = "Director of Brand & Marketing";
const FIN = "Director of Finance & Development";
const PROG = "Director of Programming";
const RES = "Director of Research";

const templates = [
  {
    name: "Speaker event",
    description: "Due date = the event date.",
    tasks: [
      ["Confirm a speaker and date", -35, true, PROG, null],
      ["Book room and AV", -28, false, PROG, 0],
      ["Confirm budget for speaker gift and food", -28, false, FIN, null],
      ["Publish event announcement", -21, true, BRAND, 0],
      ["Send announcement to member list", -14, false, COMMS, 3],
      ["Order food", -7, false, FIN, 2],
      ["Send speaker logistics brief", -5, false, PARTNER, 1],
      ["Event happens", 0, true, PROG, null],
      ["Send thank-you note to speaker", 2, false, PARTNER, 7],
    ],
  },
  {
    name: "Workshop",
    description: "Due date = the workshop date.",
    tasks: [
      ["Lock workshop topic and facilitator", -28, true, PD, null],
      ["Book room", -21, false, PROG, 0],
      ["Publish workshop announcement", -14, true, BRAND, 0],
      ["Finalize workshop materials", -5, false, PD, 0],
      ["Workshop runs", 0, true, PD, null],
      ["Share feedback form results", 5, false, RES, 4],
    ],
  },
  {
    name: "Newsletter issue",
    description: "Due date = send date.",
    tasks: [
      ["Collect updates from each director", -7, false, COMMS, null],
      ["Draft newsletter", -4, false, COMMS, 0],
      ["Design and proofread", -2, false, BRAND, 1],
      ["Newsletter sent", 0, true, COMMS, 2],
    ],
  },
  {
    name: "Recruitment cycle",
    description: "Due date = decisions sent. Keep applications in a restricted Drive folder, not in the hub.",
    tasks: [
      ["Application form published", -28, true, "President", null],
      ["Publish recruitment posts", -26, false, BRAND, 0],
      ["Hold info session", -21, true, PROG, null],
      ["Applications close", -14, true, "President", null],
      ["Finish application reviews", -7, false, "Vice President", 3],
      ["Decisions sent", 0, true, "President", 4],
    ],
  },
];

if ((await prisma.template.count()) === 0) {
  for (const t of templates) {
    await prisma.template.create({
      data: {
        name: t.name,
        description: t.description,
        tasks: {
          create: t.tasks.map(([title, offsetDays, isMilestone, role, waitingOnPosition], position) => ({
            position,
            title,
            offsetDays,
            isMilestone,
            role,
            waitingOnPosition,
          })),
        },
      },
    });
  }
  console.log(`Seeded ${templates.length} templates.`);
}

// Standing folders (mirrors src/lib/folders.ts): one per area, owned by its role.
const FOLDERS = [
  ["Club Operations", "President", "Running the club: meetings, logistics, and anything that doesn't fit elsewhere."],
  ["Recruitment & Onboarding", "Vice President", "Bringing in new members and getting them started."],
  ["Events & Programming", "Director of Programming", "Speaker events, workshops, and socials."],
  ["Partnerships & Outreach", "Director of Partnerships & External Relations", "Sponsors, partner orgs, and speakers."],
  ["Internal Comms", "Director of Internal Communications", "Newsletters, announcements, and member updates."],
  ["Brand & Marketing", "Director of Brand & Marketing", "Design, social media, and how T4C shows up."],
  ["Finance & Fundraising", "Director of Finance & Development", "Budget, reimbursements, and funding."],
  ["Professional Development", "Director of Professional Development", "Skills, careers, and growth for members."],
  ["Research", "Director of Research", "Tech policy research and writing."],
];
let made = 0;
for (const [title, role, goal] of FOLDERS) {
  if (await prisma.project.findFirst({ where: { kind: "folder", title } })) continue;
  const owner = await prisma.member.findFirst({ where: { role } });
  await prisma.project.create({ data: { title, goal, kind: "folder", status: "active", ownerId: owner?.id ?? null } });
  made++;
}
if (made) console.log(`Seeded ${made} folders.`);

await prisma.$disconnect();
