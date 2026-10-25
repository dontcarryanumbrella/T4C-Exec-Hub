"use client";

import { useState } from "react";
import {
  AVATAR_COLORS,
  AVATAR_EXTRAS,
  AVATAR_FACES,
  AVATAR_SHAPES,
  EXTRA_LABELS,
  FACE_LABELS,
  SHAPE_LABELS,
  type AvatarLook,
} from "@/lib/avatar";
import { updateAvatar } from "@/app/actions";
import { AvatarArt } from "./AvatarArt";

type Look = Required<AvatarLook>;
type Tab = "body" | "color" | "face" | "extra";

const TABS: { key: Tab; label: string }[] = [
  { key: "body", label: "Body" },
  { key: "color", label: "Color" },
  { key: "face", label: "Face" },
  { key: "extra", label: "Extra" },
];

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

// Build-a-buddy: a big preview on a confetti stage, a shuffle button for
// inspiration, and chunky tiles for each part.
export default function AvatarEditor({ name, initial }: { name: string; initial: Look }) {
  const [look, setLook] = useState<Look>(initial);
  const [tab, setTab] = useState<Tab>("body");
  const [bounce, setBounce] = useState(0);
  const set = (k: keyof Look, v: string) => {
    setLook((prev) => ({ ...prev, [k]: v }));
    setBounce((b) => b + 1);
  };
  const shuffle = () => {
    setLook({
      avatarShape: pick(AVATAR_SHAPES),
      avatarColor: pick(Object.keys(AVATAR_COLORS)),
      avatarFace: pick(AVATAR_FACES.filter((f) => f !== "initials")),
      avatarExtra: Math.random() < 0.35 ? "none" : pick(AVATAR_EXTRAS.filter((e) => e !== "none")),
    });
    setBounce((b) => b + 1);
  };

  // Tiles show a face even while you use initials, so each part's character comes through.
  const face = look.avatarFace === "initials" ? "dots" : look.avatarFace;
  const options: { value: string; label: string; preview: Look; swatch?: string }[] =
    tab === "body"
      ? AVATAR_SHAPES.map((v) => ({ value: v, label: SHAPE_LABELS[v], preview: { ...look, avatarFace: face, avatarShape: v } }))
      : tab === "color"
        ? Object.entries(AVATAR_COLORS).map(([v, c]) => ({ value: v, label: c.label, preview: { ...look, avatarColor: v }, swatch: c.body }))
        : tab === "face"
          ? AVATAR_FACES.map((v) => ({ value: v, label: FACE_LABELS[v], preview: { ...look, avatarFace: v } }))
          : AVATAR_EXTRAS.map((v) => ({ value: v, label: EXTRA_LABELS[v], preview: { ...look, avatarFace: face, avatarExtra: v } }));
  const field: keyof Look = tab === "body" ? "avatarShape" : tab === "color" ? "avatarColor" : tab === "face" ? "avatarFace" : "avatarExtra";

  return (
    <form action={updateAvatar} className="buddy">
      <input type="hidden" name="avatarColor" value={look.avatarColor} />
      <input type="hidden" name="avatarShape" value={look.avatarShape} />
      <input type="hidden" name="avatarFace" value={look.avatarFace} />
      <input type="hidden" name="avatarExtra" value={look.avatarExtra} />

      <div className="buddy-stage" style={{ ["--tint" as string]: AVATAR_COLORS[look.avatarColor]?.body ?? "#2f5be0" }}>
        <span className="confetti c1">+</span>
        <span className="confetti c2">::</span>
        <span className="confetti c3">○</span>
        <span className="confetti c4">+</span>
        <span className="confetti c5">·</span>
        <div key={bounce} className="buddy-hero">
          <AvatarArt name={name} look={look} size={132} />
        </div>
        <button type="button" className="shuffle" onClick={shuffle} title="Surprise me">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
          Shuffle
        </button>
      </div>

      <div className="buddy-parts">
      <div className="buddy-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`buddy-tab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="buddy-grid" role="radiogroup" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {options.map((o) => {
          const on = look[field] === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} className={`buddy-tile${on ? " on" : ""}`} onClick={() => set(field, o.value)} title={o.label}>
              {o.swatch ? <span className="buddy-swatch" style={{ background: o.swatch }} /> : <AvatarArt name={name} look={o.preview} size={46} />}
              <span className="buddy-label">{o.label}</span>
            </button>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button>Save my buddy</button>
      </div>
      </div>
    </form>
  );
}
