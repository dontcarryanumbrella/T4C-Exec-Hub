// Someone counts as online while the hub is open and in front of them: the
// page checks in every minute (see components/Presence.tsx), so a gap of a
// couple of minutes means the tab was closed or put away.
export const HEARTBEAT_MS = 60_000;
const ONLINE_MS = 150_000;

export function isOnline(seen: Date | null | undefined): boolean {
  return !!seen && Date.now() - seen.getTime() < ONLINE_MS;
}

export function presenceText(seen: Date | null | undefined): string {
  if (isOnline(seen)) return "Online";
  if (!seen) return "Offline";
  const mins = Math.round((Date.now() - seen.getTime()) / 60000);
  if (mins < 60) return `Active ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Active ${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Active yesterday" : `Active ${days} days ago`;
}
