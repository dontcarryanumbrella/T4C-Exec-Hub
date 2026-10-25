import { AVATAR_COLORS, type AvatarLook } from "@/lib/avatar";

// Little geometric characters on a 48×48 grid: a body in a bright color,
// a simple face, and an optional extra drawn in the same ink as the face.
type Body = { eyes: number; top: number; draw: (fill: string) => React.ReactNode };

const lighter = "rgba(255,255,255,.35)";

const BODIES: Record<string, Body> = {
  circle: { eyes: 25, top: 7, draw: (f) => <circle cx="24" cy="26" r="19" fill={f} /> },
  squircle: { eyes: 25, top: 8, draw: (f) => <rect x="6" y="8" width="36" height="36" rx="13" fill={f} /> },
  arch: { eyes: 27, top: 7, draw: (f) => <path d="M7 45V24a17 17 0 0 1 34 0v21z" fill={f} /> },
  triangle: {
    eyes: 31,
    top: 7,
    draw: (f) => <path d="M24 5c1.4 0 2.6.8 3.3 2l16 32c1.3 2.7-.6 5-3.3 5H8c-2.7 0-4.6-2.3-3.3-5l16-32C21.4 5.8 22.6 5 24 5z" fill={f} />,
  },
  bear: {
    eyes: 27,
    top: 11,
    draw: (f) => (
      <>
        <circle cx="12" cy="13" r="6.5" fill={f} />
        <circle cx="36" cy="13" r="6.5" fill={f} />
        <circle cx="12" cy="13" r="3" fill={lighter} />
        <circle cx="36" cy="13" r="3" fill={lighter} />
        <circle cx="24" cy="28" r="17" fill={f} />
      </>
    ),
  },
  bunny: {
    eyes: 31,
    top: 19,
    draw: (f) => (
      <>
        <rect x="13.5" y="2" width="7.5" height="22" rx="3.75" fill={f} />
        <rect x="27" y="2" width="7.5" height="22" rx="3.75" fill={f} />
        <rect x="15.75" y="5" width="3" height="13" rx="1.5" fill={lighter} />
        <rect x="29.25" y="5" width="3" height="13" rx="1.5" fill={lighter} />
        <ellipse cx="24" cy="32" rx="17" ry="14" fill={f} />
      </>
    ),
  },
  chick: {
    eyes: 26,
    top: 9,
    draw: (f) => (
      <>
        <circle cx="22" cy="8" r="3.2" fill={f} />
        <circle cx="27" cy="8.5" r="2.5" fill={f} />
        <circle cx="23" cy="27" r="18" fill={f} />
        <path d="M39.5 25.5l7 2.5-7 2.5z" fill="#f79a2e" stroke="#00000022" strokeWidth=".5" />
      </>
    ),
  },
  ghost: { eyes: 25, top: 8, draw: (f) => <path d="M8 45V24a16 16 0 0 1 32 0v21l-5.33-4-5.33 4-5.34-4-5.33 4-5.34-4z" fill={f} /> },
};

function Face({ face, y, ink, name }: { face: string; y: number; ink: string; name: string }) {
  const line = { stroke: ink, strokeWidth: 2.1, strokeLinecap: "round" as const, fill: "none" };
  const dots = (
    <>
      <circle cx="19" cy={y} r="2.3" fill={ink} />
      <circle cx="29" cy={y} r="2.3" fill={ink} />
    </>
  );
  const smile = <path d={`M20 ${y + 5}q4 3.5 8 0`} {...line} />;
  switch (face) {
    case "dots":
      return <>{dots}{smile}</>;
    case "happy":
      return <><path d={`M16.5 ${y + 1}q2.5-3.2 5 0M26.5 ${y + 1}q2.5-3.2 5 0`} {...line} /><path d={`M19 ${y + 5}q5 5 10 0`} {...line} /></>;
    case "wink":
      return <><circle cx="19" cy={y} r="2.3" fill={ink} /><path d={`M26.5 ${y}h5`} {...line} />{smile}</>;
    case "grin":
      return <>{dots}<path d={`M18.5 ${y + 4}h11q0 6-5.5 6t-5.5-6z`} fill={ink} /></>;
    case "cheeky":
      return <>{dots}{smile}<path d={`M23 ${y + 7.2}q1.5 3.4 3 0z`} fill="#ff7a9a" /></>;
    case "sleepy":
      return <><path d={`M16.5 ${y}q2.5 2.6 5 0M26.5 ${y}q2.5 2.6 5 0`} {...line} /><path d={`M22 ${y + 6}h4`} {...line} /></>;
    case "surprised":
      return <><circle cx="19" cy={y} r="2.6" fill={ink} /><circle cx="29" cy={y} r="2.6" fill={ink} /><circle cx="24" cy={y + 7} r="2.3" {...line} /></>;
    case "blush":
      return (
        <>
          {dots}
          {smile}
          <circle cx="14" cy={y + 4} r="2.8" fill="#ff8fb1" opacity=".6" />
          <circle cx="34" cy={y + 4} r="2.8" fill="#ff8fb1" opacity=".6" />
        </>
      );
    default:
      return (
        <text x="24" y={y + 4} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="800" fill={ink} fontFamily="system-ui, sans-serif">
          {initialsOf(name)}
        </text>
      );
  }
}

function Extra({ extra, y, top, ink, body }: { extra: string; y: number; top: number; ink: string; body: string }) {
  const line = { stroke: ink, strokeWidth: 2, strokeLinecap: "round" as const, fill: "none" };
  switch (extra) {
    case "glasses":
      return <><circle cx="19" cy={y} r="4.6" {...line} /><circle cx="29" cy={y} r="4.6" {...line} /><path d={`M23.6 ${y}h0.8`} {...line} /></>;
    case "headphones":
      return (
        <>
          <path d={`M8.5 ${y + 1}a15.5 15.5 0 0 1 31 0`} {...line} strokeWidth={2.4} />
          <rect x="5" y={y - 2} width="6.5" height="10" rx="3.2" fill={ink} />
          <rect x="36.5" y={y - 2} width="6.5" height="10" rx="3.2" fill={ink} />
        </>
      );
    case "cap":
      return <><path d={`M14.5 ${top + 5}a9.5 8.5 0 0 1 19 0z`} fill={ink} /><path d={`M31 ${top + 5}h9`} {...line} strokeWidth={2.8} /></>;
    case "beanie":
      return (
        <>
          <path d={`M13.5 ${top + 6}a10.5 10 0 0 1 21 0z`} fill={ink} />
          <rect x="12.5" y={top + 4.5} width="23" height="3.5" rx="1.75" fill={ink} />
          <circle cx="24" cy={top - 4} r="2.7" fill={ink} />
        </>
      );
    case "bow": {
      const c = body === "#f26fae" ? "#ef5a3c" : "#f26fae";
      return <><path d={`M33 ${top + 2}l-6-4.5v9zM33 ${top + 2}l6-4.5v9z`} fill={c} /><circle cx="33" cy={top + 2} r="2" fill={c} /></>;
    }
    case "sprout": {
      const g = body === "#38b764" ? "#1f7a3d" : "#38b764";
      return (
        <>
          <path d={`M24 ${top + 2}v-7`} stroke={g} strokeWidth="2.2" strokeLinecap="round" />
          <path d={`M24 ${top - 3}q-7-.5-7.5-6.5q7 0 7.5 6.5zM24 ${top - 3}q7-.5 7.5-6.5q-7 0-7.5 6.5z`} fill={g} />
        </>
      );
    }
    case "crown": {
      const c = body === "#f7c948" ? "#f79a2e" : "#f7c948";
      return <path d={`M15 ${top + 3}l2.5-9 6.5 5.5 6.5-5.5 2.5 9z`} fill={c} stroke="#00000020" strokeWidth=".6" strokeLinejoin="round" />;
    }
    default:
      return null;
  }
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?"
  );
}

// The avatar someone built on their profile; anything unknown falls back to
// a cobalt pebble with their initials.
export function AvatarArt({ name, look, size = 34 }: { name: string; look?: AvatarLook; size?: number }) {
  const color = AVATAR_COLORS[look?.avatarColor ?? "blue"] ?? AVATAR_COLORS.blue;
  const body = BODIES[look?.avatarShape ?? "circle"] ?? BODIES.circle;
  return (
    <svg className="avatar-art" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      {body.draw(color.body)}
      <Face face={look?.avatarFace ?? "initials"} y={body.eyes} ink={color.ink} name={name} />
      <Extra extra={look?.avatarExtra ?? "none"} y={body.eyes} top={body.top} ink={color.ink} body={color.body} />
    </svg>
  );
}
