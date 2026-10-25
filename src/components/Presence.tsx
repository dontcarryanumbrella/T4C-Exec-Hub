"use client";

import { useEffect } from "react";
import { heartbeat } from "@/app/actions";
import { HEARTBEAT_MS } from "@/lib/presence";

// Tells the hub you're here once a minute, but only while the tab is visible,
// so a tab left open in the background shows you as away.
export default function Presence() {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") heartbeat().catch(() => {});
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}
