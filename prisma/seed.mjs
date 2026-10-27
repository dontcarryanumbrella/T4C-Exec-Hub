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
const ADMIN = { canPropose: true, canCreateProjects: true, canApprove: true, canManageTasks: true, canWriteNotes: true, canManageMembers: true };
const EXEC = { canPropose: true, canWriteNotes: true };

for (const [i, { isAdmin, ...m }] of roster.entries()) {
  await prisma.member.upsert({
    where: { email: m.email },
    update: {},
    create: { ...m, kind: "exec", sortOrder: i, ...(isAdmin ? ADMIN : EXEC) },
  });
}

console.log(`Seeded ${roster.length} members.`);

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
