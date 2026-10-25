import { sendDailyDigests } from "@/lib/digest";

// The morning email, run once a day by a scheduler (see vercel.json; 13:00
// UTC is 9 AM Eastern in summer, 8 AM in winter). Each person gets one email
// with what's due tomorrow, their new pings, a Sunday check-in reminder
// (Monday follow-up if still missing), and their
// other open tasks. Protected by CRON_SECRET so only the scheduler can run it.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  return Response.json({ emails: await sendDailyDigests() });
}
