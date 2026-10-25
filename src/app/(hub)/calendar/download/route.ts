import { currentMember } from "@/lib/auth";
import { buildIcs } from "@/lib/calendar";
import { eventsFor } from "@/lib/calendarEvents";

// Your calendar as a file to import into Google Calendar (Settings → Import).
// Works anywhere, including while the hub runs on a laptop; the
// subscription link only works once the hub is online.
export async function GET() {
  const me = await currentMember();
  if (!me) return new Response("Sign in first", { status: 401 });
  return new Response(buildIcs(`T4C Hub — ${me.name}`, await eventsFor(me.id)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="t4c-hub.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
