"use client";

import { useState } from "react";
import type { AvatarLook } from "@/lib/avatar";
import { AvatarStack } from "./AvatarStack";
import { Menu } from "./Menu";

export type Person = { id: string; name: string } & AvatarLook;

// Pick any number of people for a task. The first one picked owns it (and
// stays responsible); the rest work on it alongside. Nobody picked = up for
// grabs. "Everyone" gives each exec their own copy instead.
// Submits as ownerId (+ coOwnerId for each extra person).
export default function AssigneePicker({
  people,
  meId,
  initial = [],
  allowEveryone = false,
  initialEveryone = false,
  allowNone = true,
  label = "Assign to",
}: {
  people: Person[];
  meId: string;
  initial?: string[];
  allowEveryone?: boolean;
  initialEveryone?: boolean;
  // false for things that always need someone, like a folder's owners.
  allowNone?: boolean;
  label?: string;
}) {
  const [everyone, setEveryone] = useState(initialEveryone);
  const [picked, setPicked] = useState<string[]>(initialEveryone ? [] : initial);
  const byId = new Map(people.map((p) => [p.id, p]));
  const chosen = picked.map((id) => byId.get(id)).filter((p): p is Person => !!p);
  const first = (p: Person) => (p.id === meId ? "You" : p.name.split(/\s+/)[0]);
  const summary = everyone
    ? "Everyone"
    : !chosen.length
      ? "Up for grabs"
      : chosen.length === 1
        ? first(chosen[0])
        : chosen.length === 2
          ? `${first(chosen[0])} + ${first(chosen[1])}`
          : `${first(chosen[0])} + ${chosen.length - 1} others`;
  const toggle = (id: string) => {
    setEveryone(false);
    setPicked((now) => (now.includes(id) ? (now.length === 1 && !allowNone ? now : now.filter((x) => x !== id)) : [...now, id]));
  };

  return (
    <div className="assignee-picker">
      {everyone ? (
        <input type="hidden" name="ownerId" value="everyone" />
      ) : (
        <>
          <input type="hidden" name="ownerId" value={chosen[0]?.id ?? "open"} />
          {chosen.slice(1).map((p) => <input key={p.id} type="hidden" name="coOwnerId" value={p.id} />)}
        </>
      )}
      <Menu
        label={label}
        align="left"
        trigger={
          <span className="picker-trigger">
            {chosen.length > 0 && !everyone && <AvatarStack people={chosen} size={22} max={3} />}
            <span className="picker-text">{summary}</span>
            <span className="picker-caret" aria-hidden>▾</span>
          </span>
        }
      >
        <div className="picker-list">
          {allowNone && (
            <button type="button" className={`menu-item${!chosen.length && !everyone ? " on" : ""}`} onClick={() => { setPicked([]); setEveryone(false); }}>
              Up for grabs
            </button>
          )}
          {allowEveryone && (
            <button type="button" className={`menu-item${everyone ? " on" : ""}`} onClick={() => { setPicked([]); setEveryone(true); }}>
              Everyone <span className="muted small">· each gets their own copy</span>
            </button>
          )}
          {(allowNone || allowEveryone) && <div className="menu-sep" />}
          {people.map((p) => {
            const at = picked.indexOf(p.id);
            return (
              <label key={p.id} className="menu-item picker-person">
                <input type="checkbox" checked={at !== -1 && !everyone} onChange={() => toggle(p.id)} />
                <AvatarStack people={[p]} size={22} />
                <span>{p.id === meId ? "You" : p.name}</span>
                {at === 0 && !everyone && picked.length > 1 && <span className="chip blue picker-owner">Owner</span>}
              </label>
            );
          })}
          <p className="small muted picker-hint">{allowNone ? "The first person you pick owns it; others work on it with them." : "The first person you pick is the main owner; the rest share it."}</p>
        </div>
      </Menu>
    </div>
  );
}
