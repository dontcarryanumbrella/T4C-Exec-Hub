import { shortStatus, taskStatus } from "@/lib/status";
import type { AvatarLook } from "@/lib/avatar";
import { AvatarArt } from "./AvatarArt";
import { isOnline, presenceText } from "@/lib/presence";

// Pass the member (or anything with their avatar fields) as `look` to show
// the avatar they picked; without it you get their initials on blue.
// Pass `seen` (their lastSeenAt) to add a green dot while they're online.
export function Avatar({ name, look, size, seen }: { name: string; look?: AvatarLook; size?: number; seen?: Date | null }) {
  const online = seen !== undefined && isOnline(seen);
  return (
    <span className="avatar" aria-hidden={seen === undefined} title={seen !== undefined ? presenceText(seen) : undefined}>
      <AvatarArt name={name} look={look} size={size} />
      {online && <span className="online-dot" aria-label="Online" />}
    </span>
  );
}

// `noDue` drops the "· due Thu" suffix where a table already has a Due column.
// `short` shows one or two words (full text on hover), for lists.
export function StatusText({ task, today, noDue, short }: { task: Parameters<typeof taskStatus>[0]; today: string; noDue?: boolean; short?: boolean }) {
  const s = taskStatus(task, today);
  if (short) return <span className={`status ${s.tone}`} title={s.text}>{shortStatus(s.text)}</span>;
  return <span className={`status ${s.tone}`}>{noDue ? s.text.replace(/ · due .*$/, "") : s.text}</span>;
}

// Adds or replaces ?task= on a path while keeping the rest of the query.
export function withTask(path: string, query: Record<string, string | undefined>, taskId: string | null): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v && k !== "task") params.set(k, v);
  if (taskId) params.set("task", taskId);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// Long comments collapse so one essay can't bury the rest of the discussion.
export function CommentBody({ body }: { body: string }) {
  const style = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;
  if (body.length <= 500) return <div style={style}>{body}</div>;
  return (
    <details style={style}>
      <summary style={{ listStyle: "none", color: "inherit" }}>
        {body.slice(0, 400)}… <span style={{ color: "#1a4fd6" }}>Show all</span>
      </summary>
      {body.slice(400)}
    </details>
  );
}
