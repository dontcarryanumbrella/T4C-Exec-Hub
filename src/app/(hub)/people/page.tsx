import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { Avatar } from "@/components/bits";
import { PageHeader } from "@/components/shell";
import { Icon } from "@/components/icons";
import { Menu } from "@/components/Menu";
import { giveShoutout } from "../../actions";

export const metadata: Metadata = { title: "People · T4C Exec Hub" };

// Knowing and supporting each other: who to ask, who wants to learn what,
// and recent thanks. Deliberately no counts or rankings.
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ shoutout?: string }> }) {
  const me = await requireMember();
  const showShoutout = !!(await searchParams).shoutout;
  const [members, recent] = await Promise.all([
    db.member.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    db.shoutout.findMany({ include: { from: true, to: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  return (
    <>
      <PageHeader
        title="People"
        actions={
          <>
            <Link href="/people?shoutout=1" className="button">Give a shoutout</Link>
            <Menu>
              <Link href={`/people/${me.id}`} className="menu-item"><Icon name="user" /> Your profile</Link>
            </Menu>
          </>
        }
      />

      {showShoutout && (
        <form action={giveShoutout} className="box row" style={{ margin: "12px 0" }}>
          <input type="hidden" name="back" value="/people" />
          <select name="toId" required defaultValue="" aria-label="Who" style={{ flex: 1, minWidth: 150 }}>
            <option value="" disabled>Who?</option>
            {members.filter((m) => m.id !== me.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="text" name="message" required autoFocus maxLength={200} placeholder="Thanks for…" aria-label="Message" style={{ flex: 3, minWidth: 220 }} />
          <button>Send</button>
          <Link href="/people" className="button secondary">Cancel</Link>
        </form>
      )}

      <div className="people" style={{ marginTop: 8 }}>
        {members.map((m) => (
          <Link key={m.id} href={`/people/${m.id}`} className="box person-card">
            <div className="card-head" style={{ marginBottom: m.askMeAbout ? 8 : 0 }}>
              <Avatar name={m.name} look={m} seen={m.lastSeenAt} />
              <div>
                <div className="card-name">{m.name}{m.id === me.id && <span className="you">You</span>}</div>
                <div className="card-role">{m.role}{m.kind !== "exec" ? ` · ${m.kind}` : ""}</div>
              </div>
            </div>
            {m.askMeAbout && <p className="small clamp" style={{ margin: 0 }}><span className="muted">Ask about</span> {m.askMeAbout}</p>}
          </Link>
        ))}
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-title"><h2>Recent thanks</h2></div>
          {recent.map((s) => (
            <p key={s.id} className="small" style={{ margin: "0 0 6px" }}>
              <Link href={`/people/${s.to.id}`}>{s.to.name}</Link> · “{s.message}” <span className="muted">from {s.from.name}</span>
            </p>
          ))}
        </>
      )}
    </>
  );
}
