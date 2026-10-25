"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { finishTour } from "@/app/actions";

export const TOUR_EVENT = "hub:tour";

type Step = { target: string; title: string; text: string };
type Box = { top: number; left: number; width: number; height: number };
type Side = "right" | "bottom" | "top" | "left";

const PAD = 6; // breathing room around the highlighted element
const GAP = 14; // space between the highlight and the card
const CARD_W = 300;

// First matching element that is actually on screen (the sidebar reflows on
// small screens, and the check-in nudge only exists for execs).
function find(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

// Put the card on whichever side of the highlight has room, preferring the
// right (the sidebar) and then below (the top bar).
function place(b: Box, cardH: number): { side: Side; top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(12, Math.min(x, vw - CARD_W - 12));
  const clampY = (y: number) => Math.max(12, Math.min(y, vh - cardH - 12));
  if (b.left + b.width + GAP + CARD_W < vw - 12) return { side: "right", left: b.left + b.width + GAP, top: clampY(b.top + b.height / 2 - cardH / 2) };
  if (b.top + b.height + GAP + cardH < vh - 12) return { side: "bottom", top: b.top + b.height + GAP, left: clampX(b.left + b.width / 2 - CARD_W / 2) };
  if (b.top - GAP - cardH > 12) return { side: "top", top: b.top - GAP - cardH, left: clampX(b.left + b.width / 2 - CARD_W / 2) };
  return { side: "left", left: Math.max(12, b.left - GAP - CARD_W), top: clampY(b.top + b.height / 2 - cardH / 2) };
}

// A first-visit walkthrough that dims the page, spotlights one control at a
// time, and explains it in a card pointing at it. Skippable, and replayable
// from the Guide (which fires TOUR_EVENT).
export default function Tour({ autoOpen, steps }: { autoOpen: boolean; steps: Step[] }) {
  const [open, setOpen] = useState(autoOpen);
  const [live, setLive] = useState<Step[]>([]);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(160);

  useEffect(() => {
    const replay = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, []);

  // Only walk through the steps whose control is on this screen.
  useEffect(() => {
    if (open) setLive(steps.filter((s) => find(s.target)));
  }, [open, steps]);

  const step = live[i];
  const measure = useCallback(() => {
    const el = step && find(step.target);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    find(step.target)?.scrollIntoView({ block: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, measure]);

  const close = useCallback(() => {
    setOpen(false);
    if (autoOpen) finishTour();
  }, [autoOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open || !step || !box) return null;
  const last = i === live.length - 1;
  const spot = place(box, cardH);
  // Keep the arrow pointing at the middle of the highlight even when the card was nudged to fit.
  const arrow =
    spot.side === "right" || spot.side === "left"
      ? { top: Math.max(16, Math.min(box.top + box.height / 2 - spot.top, cardH - 16)) }
      : { left: Math.max(16, Math.min(box.left + box.width / 2 - spot.left, CARD_W - 16)) };

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <div className="tour-blocker" />
      <div className="tour-spot" style={box} />
      <div
        className={`tour-pop ${spot.side}`}
        style={{ top: spot.top, left: spot.left, width: CARD_W }}
        ref={(el) => {
          if (el && Math.abs(el.offsetHeight - cardH) > 1) setCardH(el.offsetHeight);
        }}
      >
        <span className="tour-arrow" style={arrow} aria-hidden />
        <div className="tour-pop-body" key={i}>
          <span className="tour-count">{i + 1} of {live.length}</span>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <button type="button" className="link small" onClick={close}>Skip tour</button>
          <span className="row" style={{ gap: 8 }}>
            {i > 0 && <button type="button" className="secondary" onClick={() => setI(i - 1)}>Back</button>}
            <button type="button" onClick={() => (last ? close() : setI(i + 1))} autoFocus>{last ? "Done" : "Next"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}

export function ReplayTour() {
  return (
    <button type="button" className="secondary" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
      Replay the welcome tour
    </button>
  );
}
