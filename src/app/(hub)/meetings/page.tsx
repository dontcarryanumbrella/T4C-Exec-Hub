import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell";
import { Icon } from "@/components/icons";
import { requireMember } from "@/lib/auth";
import { formatDay, todayISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { createMeeting } from "../../actions";

export const metadata: Metadata = { title: "Meetings · T4C Exec Hub" };

export default async function MeetingsPage() {
  const me = await requireMember();
  const today = todayISO();
  const meetings = await db.meeting.findMany({
    include: { createdBy: true, tasks: { select: { status: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader
        title="Meetings"
        actions={
          can(me, "canWriteNotes") && (
            <form action={createMeeting}>
              <input type="hidden" name="date" value={today} />
              <button>New notes</button>
            </form>
          )
        }
      />

      {meetings.length === 0 ? (
        <div className="empty-state">
          <Icon name="notes" size={44} />
          <p>No meetings yet.</p>
        </div>
      ) : (
        <div className="list">
          <div className="list-head cols-meeting">
            <span>Meeting</span>
            <span>Date</span>
            <span>Action items</span>
            <span>Notes by</span>
          </div>
          {meetings.map((m) => {
            const open = m.tasks.filter((t) => t.status !== "done" && t.status !== "dropped").length;
            return (
              <Link key={m.id} href={`/meetings/${m.id}`} className="list-row cols-meeting">
                <span className="name"><Icon name="notes" /><span>{m.title}</span>{m.date === today && <span className="chip blue">Today</span>}</span>
                <span className="cell">{formatDay(m.date)}</span>
                <span className="cell optional">{m.tasks.length === 0 ? "—" : `${m.tasks.length - open} of ${m.tasks.length} done`}</span>
                <span className="cell optional">{m.createdBy?.name ?? "—"}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
