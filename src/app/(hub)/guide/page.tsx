import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { PageHeader } from "@/components/shell";
import { ReplayTour } from "@/components/Tour";
import { MiniBuddy, MiniCalendar, MiniCheckin, MiniFolders, MiniNew, MiniPanel, MiniPing, MiniUndo, MiniWeek } from "@/components/Minis";

export const metadata: Metadata = { title: "Guide · T4C Exec Hub" };

const SECTIONS: { id: string; title: string; steps: string[]; visual: React.ReactNode }[] = [
  { id: "week", title: "See the week", steps: ["This Week shows everyone's commitments.", "This Week stays on the current week through Sunday. Use Plan next week to prepare ahead."], visual: <MiniWeek /> },
  { id: "checkin", title: "Check in", steps: ["Open Plan this week or Plan next week.", "Choose This week / Later / Done, add any new outcomes, and save. Later keeps the task yours but off that plan."], visual: <MiniCheckin /> },
  { id: "new", title: "Add something", steps: ["+ New for a check-in, project, idea, meeting notes, or shoutout.", "New tasks due by Sunday (or with no date) join the owner's current card if it has room. Later deadlines stay available in check-in."], visual: <MiniNew /> },
  { id: "task", title: "Update a task", steps: ["Open it, then Not started / In progress / Done.", "Ask for help is next to the status controls. ⋯ has blocked, Google Calendar, and drop."], visual: <MiniPanel /> },
  { id: "folders", title: "Folders and projects", steps: ["General folders are standing areas (one per role, plus any you add) and never end.", "Projects have an end date; approve ideas to make new ones."], visual: <MiniFolders /> },
  { id: "ping", title: "Ping someone", steps: ["Type @ and a name in any comment or note.", "Or open their task and press Ping. They see it under the bell."], visual: <MiniPing /> },
  { id: "calendar", title: "Calendar", steps: ["Calendar shows your week: your tasks, your project deadlines, and meetings.", "⋯ → Download (.ics) or Subscribe for Google Calendar."], visual: <MiniCalendar /> },
  { id: "undo", title: "Undo a mistake", steps: ["When a change offers Undo, press it in the notice within 30 minutes."], visual: <MiniUndo /> },
  { id: "buddy", title: "Your buddy", steps: ["Profile → Build your buddy. Its color becomes your theme.", "Earn XP and climb Bronze → Silver → Gold → Diamond."], visual: <MiniBuddy /> },
];

export default async function GuidePage() {
  await requireMember();
  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title="Guide" actions={<ReplayTour />} />
      <nav className="guide-toc" aria-label="Guide sections">
        {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="chip">{s.title}</a>)}
      </nav>
      <div className="guide-grid">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="guide-item">
            <div className="guide-visual">{s.visual}</div>
            <div>
              <h2>{s.title}</h2>
              <ol>
                {s.steps.map((t) => <li key={t}>{t}</li>)}
              </ol>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
