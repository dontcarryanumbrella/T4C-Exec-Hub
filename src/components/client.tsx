"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Flash } from "@/lib/flash";
import { undo } from "@/app/actions";

// A submit button that asks first, for anything hard to undo.
export function ConfirmButton({ message, className, children }: { message: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

// Lets the Escape key close the task panel.
export function EscapeToClose({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(href, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [href, router]);
  return null;
}

const SETTLED = "hub:settled";
const SAVING = "hub:saving";

// The notice after every action: what happened, Undo when it can be taken
// back, and the natural next step. It stays a little longer when it offers Undo.
export function FlashToast({ flash }: { flash: Flash | null }) {
  const [visible, setVisible] = useState(!!flash);
  const [here, setHere] = useState("/");
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!flash) return;
    setVisible(true);
    setHere(window.location.pathname + window.location.search);
    // Shown once: clear it so a refresh doesn't repeat it.
    document.cookie = "hub_flash=; Max-Age=0; path=/";
    window.dispatchEvent(new Event(SETTLED));
  }, [flash]);

  // A new action is on its way: hide this notice so its Undo can't be
  // clicked for the wrong thing. The new action brings its own notice.
  useEffect(() => {
    const hide = () => setVisible(false);
    window.addEventListener(SAVING, hide);
    return () => window.removeEventListener(SAVING, hide);
  }, []);

  useEffect(() => {
    if (!visible || hover || !flash) return;
    timer.current = setTimeout(() => setVisible(false), flash.undoId || flash.next ? 12000 : 6000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [visible, hover, flash]);

  if (!flash || !visible) return null;
  return (
    <div
      className={`toast toast-${flash.tone}`}
      role={flash.tone === "error" ? "alert" : "status"}
      aria-live="polite"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="toast-icon" aria-hidden>{flash.tone === "error" ? "!" : flash.tone === "info" ? "i" : "✓"}</span>
      <span className="toast-text">{flash.text}</span>
      {flash.undoId && (
        <form action={undo} data-toast>
          <input type="hidden" name="undoId" value={flash.undoId} />
          <input type="hidden" name="back" value={here} />
          <button className="toast-action">Undo</button>
        </form>
      )}
      {flash.next && (
        <Link href={flash.next.href} className="toast-action" onClick={() => setVisible(false)}>
          {flash.next.label}
        </Link>
      )}
      <button className="toast-close" aria-label="Dismiss" onClick={() => setVisible(false)}>×</button>
    </div>
  );
}

// While a form is saving: its button shows a spinner, repeat clicks are
// ignored, and a thin bar runs along the top. Cleared when the notice for
// that action arrives, the page changes, or after a few seconds regardless.
export function FormFeedback() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const clear = () => {
      document.body.classList.remove("is-saving");
      document.querySelectorAll<HTMLFormElement>("form[data-pending]").forEach((f) => delete f.dataset.pending);
      document.querySelectorAll<HTMLButtonElement>("button[data-busy]").forEach((b) => {
        b.disabled = false;
        delete b.dataset.busy;
      });
    };
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (form.dataset.ownPending !== undefined) return;
      if (form.dataset.pending) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      form.dataset.pending = "1";
      document.body.classList.add("is-saving");
      if (form.dataset.toast === undefined) window.dispatchEvent(new Event(SAVING));
      const btn = e.submitter as HTMLButtonElement | null;
      // Disable after the browser has read the button's name/value.
      setTimeout(() => {
        if (btn) {
          btn.dataset.busy = "1";
          btn.disabled = true;
        }
      }, 0);
      clearTimeout(fallback);
      fallback = setTimeout(clear, 8000);
    };
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener(SETTLED, clear);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener(SETTLED, clear);
      clearTimeout(fallback);
    };
  }, []);

  // A finished navigation also means the save is over.
  useEffect(() => {
    window.dispatchEvent(new Event(SETTLED));
  }, [pathname, search]);

  return <div className="save-bar" aria-hidden />;
}
