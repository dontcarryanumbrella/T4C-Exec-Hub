// Standing folders: one ongoing home per area of the club, so every task has
// a place even when it isn't part of a bigger project. Each is owned by the
// role responsible for it. Kept in sync with prisma/seed.mjs.
export const FOLDERS = [
  { title: "Club Operations", role: "President", goal: "Running the club: meetings, logistics, and anything that doesn't fit elsewhere." },
  { title: "Recruitment & Onboarding", role: "Vice President", goal: "Bringing in new members and getting them started." },
  { title: "Events & Programming", role: "Director of Programming", goal: "Speaker events, workshops, and socials." },
  { title: "Partnerships & Outreach", role: "Director of Partnerships & External Relations", goal: "Sponsors, partner orgs, and speakers." },
  { title: "Internal Comms", role: "Director of Internal Communications", goal: "Newsletters, announcements, and member updates." },
  { title: "Brand & Marketing", role: "Director of Brand & Marketing", goal: "Design, social media, and how T4C shows up." },
  { title: "Finance & Fundraising", role: "Director of Finance & Development", goal: "Budget, reimbursements, and funding." },
  { title: "Professional Development", role: "Director of Professional Development", goal: "Skills, careers, and growth for members." },
  { title: "Research", role: "Director of Research", goal: "Tech policy research and writing." },
] as const;

export const DEFAULT_FOLDER = "Club Operations";

// The folders above are permanent; general folders people add later can be deleted.
export const isBuiltInFolder = (p: { kind: string; title: string }) =>
  p.kind === "folder" && FOLDERS.some((f) => f.title === p.title);
