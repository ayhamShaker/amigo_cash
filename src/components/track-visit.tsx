"use client";

import { useEffect } from "react";

/** Counts this browser session once for the marketing report. */
export function TrackVisit() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("amigo_v")) return;
      sessionStorage.setItem("amigo_v", "1");
    } catch {
      return;
    }
    void fetch("/api/track", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {});
  }, []);
  return null;
}
