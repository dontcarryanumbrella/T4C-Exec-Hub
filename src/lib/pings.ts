import { db } from "./db";

// Sends one ping: it shows under the bell right away, and goes out in the
// person's next morning email (see lib/digest.ts). Never to yourself.
export async function notify(toId: string | null | undefined, fromId: string | null, text: string, href: string): Promise<void> {
  if (!toId || toId === fromId) return;
  await db.notification.create({ data: { toId, fromId, text: text.slice(0, 300), href, emailState: "pending" } });
}

// Who is @mentioned in a piece of text. "@Morgan" or "@morgan" both match a
// member whose first name (or full name) is Morgan.
export async function mentionedIn(text: string): Promise<{ id: string; name: string }[]> {
  if (!text.includes("@")) return [];
  const members = await db.member.findMany({ select: { id: true, name: true } });
  const lower = text.toLowerCase();
  return members.filter((m) => {
    const names = [m.name, m.name.split(/\s+/)[0]].map((n) => n.toLowerCase());
    return names.some((n) => {
      const at = lower.indexOf(`@${n}`);
      if (at === -1) return false;
      const after = lower[at + n.length + 1];
      return after === undefined || !/[a-z0-9]/.test(after);
    });
  });
}

// Pings everyone newly @mentioned in `text` (people already mentioned in
// `previous` aren't pinged again when the same notes are saved twice).
export async function pingMentions(
  text: string,
  from: { id: string; name: string },
  where: string,
  href: string,
  previous = "",
): Promise<string[]> {
  const before = new Set((await mentionedIn(previous)).map((m) => m.id));
  const people = (await mentionedIn(text)).filter((m) => !before.has(m.id) && m.id !== from.id);
  const snippet = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  for (const p of people) await notify(p.id, from.id, `${from.name} mentioned you ${where}: “${snippet}”`, href);
  return people.map((p) => p.name);
}
