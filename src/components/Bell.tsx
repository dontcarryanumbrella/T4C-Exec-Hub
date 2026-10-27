"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markNotificationsRead } from "@/app/actions";
import { Menu } from "./Menu";

type Ping = { id: string; text: string; href: string; unread: boolean; ago: string };

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9zM10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

// Your pings: @mentions, assignments, nudges, decisions on your ideas.
// Opening the list marks them read.
export default function Bell({ pings, unread }: { pings: Ping[]; unread: number }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <span className="bell">
      <Menu
        onOpen={() => {
          if (unread > 0) start(async () => { await markNotificationsRead(); router.refresh(); });
        }}
        label={unread ? `${unread} new ping${unread === 1 ? "" : "s"}` : "Pings"}
        trigger={
          <>
            <BellIcon />
            {unread > 0 && <span className="count">{unread > 9 ? "9+" : unread}</span>}
          </>
        }
      >
        <div className="ping-list">
          <div className="menu-head"><strong>Pings</strong></div>
          {pings.length === 0 && <p className="muted small" style={{ padding: "8px 16px" }}>Nothing yet. When someone @mentions you or hands you something, it shows up here.</p>}
          {pings.map((p) => (
            <Link key={p.id} href={p.href} className={`ping${p.unread ? " unread" : ""}`}>
              <span>
                {p.text}
                <span className="ago">{p.ago}</span>
              </span>
            </Link>
          ))}
        </div>
      </Menu>
    </span>
  );
}
