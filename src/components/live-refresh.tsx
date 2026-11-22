"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

function typing() {
  const el = document.activeElement;
  return !!el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && (el as HTMLInputElement).value !== "";
}

/**
 * Polls a small fingerprint endpoint and re-renders the page (server data
 * only, no reload) as soon as something changes, e.g. coins arriving or a
 * withdrawal being paid. Pauses while the tab is hidden and while the person
 * is typing, so forms are never wiped.
 */
export function LiveRefresh({ url, intervalMs = 8000 }: { url: string; intervalMs?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v?: string };
        if (typeof v !== "string") return;
        if (last.current !== null && v !== last.current && !typing()) router.refresh();
        if (!typing()) last.current = v;
      } catch {
        /* offline: next tick */
      }
    }
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [url, intervalMs, router]);
  return null;
}
