"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createMeeting } from "@/app/actions";
import { Icon, type IconName } from "./icons";
import { Menu } from "./Menu";
import { Brand } from "./shell";

type Props = {
  isExec: boolean;
  checkedIn: boolean;
  planWeek: string;
  planningAhead: boolean;
  seesAdmin: boolean;
  canCreate: boolean;
  canPropose: boolean;
  canWriteNotes: boolean;
};

// Drive-style left rail: one "New" button for every way to add something,
// then the places you can go. Nothing else competes for attention.
export default function Sidebar(p: Props) {
  const path = usePathname();
  const items: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: "This Week", icon: "week" },
    { href: "/projects", label: "Folders", icon: "folder" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/meetings", label: "Meetings", icon: "notes" },
    { href: "/people", label: "People", icon: "people" },
    ...(p.seesAdmin ? [{ href: "/admin", label: "Admin", icon: "shield" as const }] : []),
  ];
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="sidebar" aria-label="Main">
      <Brand />
      <Menu
        label="Create something new"
        align="left"
        className="new-menu"
        trigger={
          <span className="new-button">
            <Icon name="plus" size={20} /> New
          </span>
        }
      >
        {p.isExec && (
          <Link href={`/checkin?week=${p.planWeek}`} className="menu-item">
            <Icon name="check" /> {p.checkedIn ? `Edit ${p.planningAhead ? "next" : "this"} week's plan` : `Plan ${p.planningAhead ? "next" : "this"} week`}
          </Link>
        )}
        {p.canCreate && (
          <>
            <Link href="/projects/new" className="menu-item">
              <Icon name="flag" /> Project (has an end date)
            </Link>
            <Link href="/projects/new?kind=folder" className="menu-item">
              <Icon name="folder" /> General folder
            </Link>
          </>
        )}
        {p.canPropose && (
          <Link href="/projects/new?idea=1" className="menu-item">
            <Icon name="idea" /> Idea to propose
          </Link>
        )}
        {p.canWriteNotes && (
          <form action={createMeeting}>
            <button className="menu-item">
              <Icon name="notes" /> Meeting notes
            </button>
          </form>
        )}
        <Link href="/people?shoutout=1" className="menu-item">
          <Icon name="heart" /> Shoutout
        </Link>
      </Menu>

      <nav className="side-nav">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className={`side-link${active(it.href) ? " active" : ""}`} aria-current={active(it.href) ? "page" : undefined}>
            <Icon name={it.icon} />
            <span>{it.label}</span>
          </Link>
        ))}
      </nav>

      <Link href="/guide" className={`side-link side-guide${active("/guide") ? " active" : ""}`}>
        <Icon name="help" />
        <span>Guide</span>
      </Link>

      {p.isExec &&
        (p.checkedIn ? (
          <Link href={`/checkin?week=${p.planWeek}`} className="side-done">
            <Icon name="check" size={16} /> {p.planningAhead ? "Next week planned" : "Plan saved"} · <span>Edit</span>
          </Link>
        ) : (
          <Link href={`/checkin?week=${p.planWeek}`} className="side-nudge">
            <span className="dot" aria-hidden /> Plan {p.planningAhead ? "next" : "this"} week
          </Link>
        ))}
    </aside>
  );
}
