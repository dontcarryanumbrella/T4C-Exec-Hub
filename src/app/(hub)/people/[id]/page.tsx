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
import { suggestionsFor } from "@/lib/accomplishments";
import { isOnline, presenceText } from "@/lib/presence";
import { Avatar, StatusText } from "@/components/bits";
import {
  addAccomplishment,
  decideSuggestion,
  deleteAccomplishment,
  deleteShoutout,
  giveShoutout,
  updateAccomplishment,
  updateProfile,
} from "../../../actions";

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
      accomplishments: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      shoutoutsGot: { include: { from: true }, orderBy: { createdAt: "desc" } },
      commitments: {
        where: { weekStart: activeWeek(), task: { ownerId: id } },
        include: { task: { include: { waitingOn: true, helpRequests: true, project: true } } },
      },
    },
  });
  if (!person) notFound();
  const suggestions = isMe ? await suggestionsFor(me.id) : [];
  const level = isMe ? levelFor(await xpFor(me.id)) : null;
  const shown = person.accomplishments.filter((a) => a.shown);

  return (
    <div style={{ maxWidth: 820 }}>
      <Link href="/people" className="back-link">← People</Link>
      <div className="card-head" style={{ marginBottom: 4 }}>
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
        <>
          <details style={{ marginTop: 14, maxWidth: 420 }}>
            <summary>Your XP and level</summary>
            <LevelCard level={level} />
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
          {person.bio && <p>{person.bio}</p>}
          {person.lore && <p><strong>Lore:</strong> {person.lore}</p>}
          {person.askMeAbout && <p><strong>Ask me about:</strong> {person.askMeAbout}</p>}
          {person.wantToLearn && <p><strong>I&apos;d like to learn:</strong> {person.wantToLearn}</p>}
          {!person.bio && !person.lore && !person.askMeAbout && !person.wantToLearn && (
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

      {isMe && suggestions.length > 0 && (
        <div className="notice notice-success" style={{ marginTop: 20 }}>
          <h2>From your finished work — add to your profile?</h2>
          {suggestions.map((s) => (
            <form key={`${s.source}:${s.sourceId}`} action={decideSuggestion} className="stack" style={{ borderTop: "1px solid #f0dca8", paddingTop: 10, marginTop: 10 }}>
              <input type="hidden" name="back" value={path} />
              <input type="hidden" name="source" value={s.source} />
              <input type="hidden" name="sourceId" value={s.sourceId} />
              <div className="row small muted">{formatDay(s.date)}</div>
              <input type="text" name="title" defaultValue={s.title} />
              <input type="text" name="description" defaultValue={s.description} placeholder="A line of detail (optional)" />
              <div className="row">
                <button name="decision" value="add">Add to my profile</button>
                <button name="decision" value="hide" className="secondary">Not this one</button>
              </div>
            </form>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>Accomplishments</h2>
      {shown.length === 0 && <p className="muted small">Nothing yet.</p>}
      <ul style={{ paddingLeft: 18 }}>
        {shown.map((a) => (
          <li key={a.id} style={{ marginBottom: 6 }}>
            <strong>{a.title}</strong> <span className="muted small">— {formatDay(a.date)}</span>
            {a.description && <div className="small">{a.description}</div>}
          </li>
        ))}
      </ul>

      {isMe && (
        <>
          <details>
            <summary>+ Add a win from outside the hub</summary>
            <form action={addAccomplishment} className="box stack" style={{ maxWidth: 560 }}>
              <input type="hidden" name="back" value={path} />
              <label>What happened<input type="text" name="title" required placeholder="e.g. Accepted to the Duke Tech Policy Lab" /></label>
              <label>Detail (optional)<input type="text" name="description" /></label>
              <label>Date<input type="date" name="date" defaultValue={today} /></label>
              <button>Add</button>
            </form>
          </details>
          {person.accomplishments.length > 0 && (
            <details>
              <summary>Edit or hide accomplishments</summary>
              <div className="stack">
                {person.accomplishments.map((a) => (
                  <div key={a.id} className="box">
                    <form action={updateAccomplishment} className="stack">
                      <input type="hidden" name="back" value={path} />
                      <input type="hidden" name="accomplishmentId" value={a.id} />
                      <input type="text" name="title" defaultValue={a.title} />
                      <input type="text" name="description" defaultValue={a.description} placeholder="Detail" />
                      <div className="row">
                        <input type="date" name="date" defaultValue={a.date} style={{ width: "auto" }} />
                        <label className="inline" style={{ margin: 0 }}><input type="checkbox" name="shown" defaultChecked={a.shown} /> Show on profile</label>
                        <button className="secondary">Save</button>
                      </div>
                    </form>
                    {a.source === "manual" && (
                      <form action={deleteAccomplishment} style={{ marginTop: 6 }}>
                        <input type="hidden" name="back" value={path} />
                        <input type="hidden" name="accomplishmentId" value={a.id} />
                        <ConfirmButton message="Delete this accomplishment?" className="link small">Delete</ConfirmButton>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

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

      {isMe && (
        <details style={{ marginTop: 24 }} open={!me.bio && !me.askMeAbout}>
          <summary>Edit my profile</summary>
          <form action={updateProfile} className="box stack" style={{ maxWidth: 560 }}>
            <input type="hidden" name="back" value={path} />
            <label>Short bio<textarea name="bio" defaultValue={me.bio} placeholder="Year, major, what you're into" /></label>
            <label>Lore (optional)<textarea name="lore" defaultValue={me.lore} placeholder="Club history, a fun fact, the story people should know" /></label>
            <label>Ask me about…<input type="text" name="askMeAbout" defaultValue={me.askMeAbout} placeholder="e.g. Canva, cold-emailing speakers, policy research" /></label>
            <label>I&apos;d like to learn…<input type="text" name="wantToLearn" defaultValue={me.wantToLearn} placeholder="e.g. budgeting, running a workshop" /></label>
            <button>Save profile</button>
          </form>
        </details>
      )}
    </div>
  );
}
