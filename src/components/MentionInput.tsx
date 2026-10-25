"use client";

import { useRef, useState } from "react";

type Person = { id: string; name: string };

// A text box where typing "@" suggests people to ping. Picking one inserts
// "@FirstName"; the server pings everyone mentioned when the text is saved.
export default function MentionInput({
  name,
  people,
  placeholder,
  multiline = false,
  defaultValue = "",
  required = false,
  maxLength,
  minHeight,
  ariaLabel,
}: {
  name: string;
  people: Person[];
  placeholder?: string;
  multiline?: boolean;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  minHeight?: number;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches =
    query === null ? [] : people.filter((p) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(query.toLowerCase()))).slice(0, 6);

  const readQuery = () => {
    const el = ref.current;
    if (!el) return;
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = upto.match(/(?:^|\s)@([A-Za-z]*)$/);
    setQuery(m ? m[1] : null);
    setActive(0);
  };

  const pick = (p: Person) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret).replace(/@([A-Za-z]*)$/, `@${p.name.split(/\s+/)[0]} `);
    el.value = before + el.value.slice(caret);
    el.focus();
    el.setSelectionRange(before.length, before.length);
    setQuery(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((active + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((active - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      setQuery(null);
    }
  };

  const shared = {
    ref,
    name,
    placeholder,
    defaultValue,
    required,
    maxLength,
    "aria-label": ariaLabel,
    autoComplete: "off",
    onInput: readQuery,
    onClick: readQuery,
    onKeyDown,
    onBlur: () => setTimeout(() => setQuery(null), 150),
  };

  return (
    <span className="mention">
      {multiline ? <textarea {...shared} style={minHeight ? { minHeight } : undefined} /> : <input type="text" {...shared} />}
      {matches.length > 0 && (
        <span className="mention-list" role="listbox">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`mention-item${i === active ? " on" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              @{p.name}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
