import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { levelFor, xpFor } from "@/lib/xp";
import { LevelCard } from "@/components/Level";
import AvatarEditor from "@/components/AvatarEditor";
import { ConfirmButton } from "@/components/client";
import { requireMember } from "@/lib/auth";
import { activeWeek, formatDay, todayISO } from "@/lib/dates";
import { isOnline, presenceText } from "@/lib/presence";
import { Avatar, StatusText } from "@/components/bits";
import { workingOn } from "@/lib/tasks";
import { deleteShoutout, giveShoutout, updateProfile } from "../../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const person = await db.member.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: `${person?.name ?? "Profile"} · T4C Exec Hub` };
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const { id } = await params;
  const isMe = id === me.id;
  const path = `/people/${id}`;
  const today = todayISO();

  const person = await db.member.findUnique({
    where: { id },
    include: {
      shoutoutsGot: { include: { from: true }, orderBy: { createdAt: "desc" } },
      commitments: {
        where: { weekStart: activeWeek(), task: workingOn(id) },
        include: { task: { include: { waitingOn: true, helpRequests: true, project: true } } },
      },
    },
  });
  if (!person) notFound();
  const level = isMe ? levelFor(await xpFor(me.id)) : null;

  return (
    <div style={{ maxWidth: 820 }}>
      <Link href="/people" className="back-link">← People</Link>
      {/* Name on the left; your level on the right (only you see it). */}
      <div className="profile-head">
        <div className="card-head" style={{ margin: 0 }}>
          <Avatar name={person.name} look={person} size={56} seen={person.lastSeenAt} />
          <div>
            <h1 style={{ margin: 0 }}>{person.name}</h1>
            <div className="muted">
              {person.role}
              {person.kind !== "exec" ? ` · ${person.kind}` : ""} · <a href={`mailto:${person.email}`}>{person.email}</a>
              {" · "}
              <span className={isOnline(person.lastSeenAt) ? "status ok" : undefined}>{presenceText(person.lastSeenAt)}</span>
            </div>
          </div>
        </div>
        {isMe && level && (
          <div className="profile-level">
            <LevelCard level={level} />
          </div>
        )}
      </div>

      {isMe && (
        <>
          <details className="box" style={{ marginTop: 22 }} open={!me.bio && !me.askMeAbout}>
            <summary><strong>Edit my profile</strong> <span className="small muted">· bio, LinkedIn, what you know</span></summary>
            <form action={updateProfile} className="stack" style={{ marginTop: 12, maxWidth: 560 }}>
              <input type="hidden" name="back" value={path} />
              <label>Short bio<textarea name="bio" defaultValue={me.bio} placeholder="Year, major, what you're into" /></label>
              <label>LinkedIn (optional)<input type="url" name="linkedin" defaultValue={me.linkedin} placeholder="https://www.linkedin.com/in/your-name" /></label>
              <label>Ask me about…<input type="text" name="askMeAbout" defaultValue={me.askMeAbout} placeholder="e.g. Canva, cold-emailing speakers, policy research" /></label>
              <label>I&apos;d like to learn…<input type="text" name="wantToLearn" defaultValue={me.wantToLearn} placeholder="e.g. budgeting, running a workshop" /></label>
              <button>Save profile</button>
            </form>
          </details>
          <details className="box buddy-box" style={{ marginTop: 12 }}>
            <summary><strong>Build your buddy</strong> <span className="small muted">· your avatar</span></summary>
            <div style={{ marginTop: 12 }}>
              <AvatarEditor
                name={me.name}
                initial={{ avatarColor: me.avatarColor, avatarShape: me.avatarShape, avatarFace: me.avatarFace, avatarExtra: me.avatarExtra }}
              />
            </div>
          </details>
        </>
      )}

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="stack">
          {person.bio && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{person.bio}</p>}
          {person.linkedin && (
            <p><strong>LinkedIn:</strong> <a href={person.linkedin} target="_blank" rel="noreferrer noopener">{person.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></p>
          )}
          {person.askMeAbout && <p><strong>Ask me about:</strong> {person.askMeAbout}</p>}
          {person.wantToLearn && <p><strong>I&apos;d like to learn:</strong> {person.wantToLearn}</p>}
          {!person.bio && !person.linkedin && !person.askMeAbout && !person.wantToLearn && (
            <p className="muted">{isMe ? "Your profile is empty. Fill it in below." : "No profile yet."}</p>
          )}
        </div>
        <div className="box">
          <h3>This week</h3>
          {person.commitments.length === 0 ? (
            <p className="muted small">No commitments this week.</p>
          ) : (
            <ul className="commits">
              {person.commitments.map(({ task }) => (
                <li key={task.id}>
                  <Link href={`/?task=${task.id}`}>
                    <div>{task.title}</div>
                    <StatusText task={task} today={today} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>Shoutouts</h2>
      {person.shoutoutsGot.length === 0 && <p className="muted small">None yet.</p>}
      {person.shoutoutsGot.map((s) => (
        <div key={s.id} className="small" style={{ marginBottom: 8 }}>
          “{s.message}” <span className="muted">— {s.from.name}, {s.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          {(s.fromId === me.id || can(me, "canManageMembers")) && (
            <form action={deleteShoutout} style={{ display: "inline", marginLeft: 6 }}>
              <input type="hidden" name="back" value={path} />
              <input type="hidden" name="shoutoutId" value={s.id} />
              <ConfirmButton message="Remove this shoutout?" className="link small muted">remove</ConfirmButton>
            </form>
          )}
        </div>
      ))}
      {!isMe && (
        <form action={giveShoutout} className="row" style={{ marginTop: 8, flexWrap: "nowrap" }}>
          <input type="hidden" name="back" value={path} />
          <input type="hidden" name="toId" value={person.id} />
          <input type="text" name="message" required maxLength={200} placeholder={`Thank ${person.name} for something specific`} />
          <button>Send shoutout</button>
        </form>
      )}

    </div>
  );
}
