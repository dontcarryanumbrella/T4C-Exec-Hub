import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { activeWeek, planningWeek } from "@/lib/dates";
import { can, seesAdmin } from "@/lib/permissions";
import { logout } from "../actions";
import Sidebar from "@/components/Sidebar";
import { Menu } from "@/components/Menu";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/bits";
import SearchBox from "@/components/SearchBox";
import Bell from "@/components/Bell";
import { LevelLine } from "@/components/Level";
import { levelFor, xpFor } from "@/lib/xp";
import { accentFor } from "@/lib/avatar";
import Tour from "@/components/Tour";
import Presence from "@/components/Presence";

// The signed-in app: a left rail for getting around, a search bar on top,
// and your account tucked into the avatar menu.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  const isExec = me.kind === "exec";
  const accent = accentFor(me.avatarColor);
  // On Sundays the nudge is about planning the coming week, like the morning email.
  const planWeek = planningWeek();
  const checkedIn = isExec && (await db.checkIn.count({ where: { memberId: me.id, weekStart: planWeek } })) > 0;
  const pings = await db.notification.findMany({ where: { toId: me.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <div className="app">
      <style>{`:root{--accent:${accent.accent};--accent-text:${accent.text}}`}</style>
      <Sidebar
        isExec={isExec}
        checkedIn={checkedIn}
        planWeek={planWeek}
        planningAhead={planWeek !== activeWeek()}
        seesAdmin={seesAdmin(me)}
        canCreate={can(me, "canCreateProjects")}
        canPropose={can(me, "canPropose")}
        canWriteNotes={can(me, "canWriteNotes")}
      />
      <div className="main">
        <header className="topbar">
          <form action="/search" className="search" role="search">
            <Icon name="search" />
            <Suspense fallback={<input type="search" name="q" placeholder="Search the hub" aria-label="Search" />}>
              <SearchBox />
            </Suspense>
          </form>
          <Bell
            unread={pings.filter((p) => !p.readAt).length}
            pings={pings.map((p) => ({ id: p.id, text: p.text, href: p.href, unread: !p.readAt, ago: ago(p.createdAt) }))}
          />
          <Menu label="Your account" trigger={<Avatar name={me.name} look={me} />}>
            <div className="menu-head">
              <strong>{me.name}</strong>
              <span className="muted small">{me.role || me.email}</span>
              <LevelLine level={levelFor(await xpFor(me.id))} />
            </div>
            <Link href={`/people/${me.id}`} className="menu-item"><Icon name="user" /> Your profile</Link>
            <form action={logout}>
              <button className="menu-item"><Icon name="out" /> Sign out</button>
            </form>
          </Menu>
        </header>
        <main className="page">{children}</main>
        <Presence />
        <Tour
          autoOpen={!me.tutorialSeenAt}
          steps={[
            { target: ".new-button", title: "+ New adds anything", text: "Plan your week, start a project folder, propose an idea, take meeting notes, or send a shoutout." },
            { target: '.side-nav a[href="/"]', title: "This is your week", text: "Everyone's cards show what they're working on. Click any task to update it or ask for help." },
            { target: '.side-nav a[href="/projects"]', title: "Folders hold the work", text: "General folders never end (one per role, plus any you add); projects have an end date." },
            { target: '.side-nav a[href="/calendar"]', title: "Calendar", text: "Every due date and meeting in one week view. You can sync it to your own calendar." },
            { target: '.side-nav a[href="/meetings"]', title: "Meetings", text: "Notes from each meeting, with the action items turned into tasks." },
            { target: '.side-nav a[href="/people"]', title: "People", text: "See what each exec is up to, who's online, and send a shoutout." },
            { target: ".side-nudge, .side-done", title: "Plan each week", text: "Choose This week, Later, or Done for your tasks. Aim for 1–3 outcomes; you can change your plan anytime." },
            { target: ".topbar .search", title: "Search anything", text: "Find tasks, folders, people, and meeting notes from one box." },
            { target: ".topbar .bell", title: "Your pings", text: "Assignments, @mentions, and pings show up here, and in your morning email." },
            { target: ".side-guide", title: "Stuck? Open the Guide", text: "Short how-tos for everything, and you can replay this tour from there." },
          ]}
        />
      </div>
    </div>
  );
}

function ago(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
