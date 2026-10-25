// Avatar parts people mix on their profile: a character body, a bright
// color, a face, and an optional extra. Inspired by flat geometric mascots.
export const AVATAR_COLORS: Record<string, { body: string; ink: string; text: string; label: string }> = {
  blue: { body: "#2f5be0", ink: "#ffffff", text: "#2451d6", label: "Cobalt" },
  sky: { body: "#38b6e8", ink: "#13253b", text: "#0b7fb3", label: "Sky" },
  teal: { body: "#21b8a6", ink: "#10302c", text: "#0f8a7c", label: "Teal" },
  green: { body: "#38b764", ink: "#10301c", text: "#1f8a46", label: "Green" },
  yellow: { body: "#f7c948", ink: "#3a2a05", text: "#a87900", label: "Sunny" },
  orange: { body: "#f79a2e", ink: "#3a2005", text: "#b8650d", label: "Orange" },
  coral: { body: "#ef5a3c", ink: "#2b0f08", text: "#c63d22", label: "Coral" },
  pink: { body: "#f26fae", ink: "#3a0d24", text: "#c2307c", label: "Bubblegum" },
  purple: { body: "#8b5cf6", ink: "#ffffff", text: "#6d3fd6", label: "Grape" },
};

export const AVATAR_SHAPES = ["circle", "squircle", "arch", "triangle", "bear", "bunny", "chick", "ghost"] as const;
export const AVATAR_FACES = ["initials", "dots", "happy", "wink", "grin", "cheeky", "sleepy", "surprised", "blush"] as const;
export const AVATAR_EXTRAS = ["none", "glasses", "headphones", "cap", "beanie", "bow", "sprout", "crown"] as const;

export const SHAPE_LABELS: Record<string, string> = {
  circle: "Pebble", squircle: "Block", arch: "Arch", triangle: "Peak", bear: "Bear", bunny: "Bunny", chick: "Chick", ghost: "Ghost",
};
export const FACE_LABELS: Record<string, string> = {
  initials: "Initials", dots: "Hi", happy: "Happy", wink: "Wink", grin: "Grin", cheeky: "Cheeky", sleepy: "Sleepy", surprised: "Wow", blush: "Shy",
};
export const EXTRA_LABELS: Record<string, string> = {
  none: "None", glasses: "Glasses", headphones: "Headphones", cap: "Cap", beanie: "Beanie", bow: "Bow", sprout: "Sprout", crown: "Crown",
};

// Your buddy's color also tints your own view of the hub: `body` for
// fills and glows, `text` for anything that has to stay readable on white.
export function accentFor(color: string | undefined): { accent: string; text: string } {
  const c = AVATAR_COLORS[color ?? "blue"] ?? AVATAR_COLORS.blue;
  return { accent: c.body, text: c.text };
}

export type AvatarLook = { avatarColor?: string; avatarShape?: string; avatarFace?: string; avatarExtra?: string };
