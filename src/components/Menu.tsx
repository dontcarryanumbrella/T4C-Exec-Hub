"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./icons";

// A dropdown that keeps secondary actions out of sight until asked for,
// like the "⋮" menus in Google Drive. Built on <details> so it works before
// scripts load; the script only adds closing on outside click and Escape.
export function Menu({
  label = "More actions",
  trigger,
  align = "right",
  className,
  onOpen,
  children,
}: {
  label?: string;
  trigger?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const close = (e: Event) => {
      if (!el.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    // Choosing an item (a link or a submit) closes the menu too.
    const pick = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.closest("a, button[type=submit], button:not([type])") && !t.closest("summary")) setTimeout(() => (el.open = false), 0);
    };
    const toggled = () => {
      if (el.open) onOpen?.();
    };
    el.addEventListener("toggle", toggled);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    el.addEventListener("click", pick);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      el.removeEventListener("click", pick);
      el.removeEventListener("toggle", toggled);
    };
  }, [onOpen]);
  return (
    <details ref={ref} className={`menu menu-${align}${className ? ` ${className}` : ""}`}>
      <summary aria-label={label} title={label}>{trigger ?? <Icon name="more" />}</summary>
      <div className="menu-list" role="menu">{children}</div>
    </details>
  );
}
