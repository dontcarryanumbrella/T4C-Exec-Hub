"use client";

import { useState } from "react";

// "+N more" that expands in place, then "Show less" folds it back.
export default function MoreToggle({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && children}
      <li>
        <button type="button" className="more-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Show less" : `+${count} more`}
        </button>
      </li>
    </>
  );
}
