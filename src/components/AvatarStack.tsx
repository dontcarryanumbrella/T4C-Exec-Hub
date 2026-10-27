import type { AvatarLook } from "@/lib/avatar";
import { AvatarArt } from "./AvatarArt";

// Overlapping faces for everyone on a task, with "+N" past `max`.
// The names are in the tooltip.
export function AvatarStack({ people, size = 24, max = 4 }: { people: ({ id: string; name: string } & AvatarLook)[]; size?: number; max?: number }) {
  if (!people.length) return null;
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const extra = people.length - shown.length;
  return (
    <span className="avatar-stack" title={people.map((p) => p.name).join(", ")} style={{ "--s": `${size}px` } as React.CSSProperties}>
      {shown.map((p) => (
        <span key={p.id} className="avatar-stack-face"><AvatarArt name={p.name} look={p} size={size} /></span>
      ))}
      {extra > 0 && <span className="avatar-stack-more">+{extra}</span>}
    </span>
  );
}
