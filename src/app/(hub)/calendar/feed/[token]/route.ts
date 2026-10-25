import { db } from "@/lib/db";
import { buildIcs } from "@/lib/calendar";
import { eventsFor } from "@/lib/calendarEvents";

// Private iCalendar feed for one person, read by Google Calendar. The secret
// token in the URL is the only credential, so it's long, random, and resettable.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  const member = token.length >= 20 ? await db.member.findUnique({ where: { calendarToken: token } }) : null;
  if (!member) return new Response("Not found", { status: 404 });

  const events = await eventsFor(member.id);

  return new Response(buildIcs(`T4C Hub — ${member.name}`, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="t4c-hub.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
