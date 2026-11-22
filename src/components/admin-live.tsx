"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Watches for new chat messages every 5 s. On the chat page it refreshes the
 * view; elsewhere it shows a small notice with a link.
 */
export function AdminLive() {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const [notice, setNotice] = useState<number>(0);
  useEffect(() => {
    let stop = false;
    async function tick() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/admin/chat", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { waiting: number; latest: string | null };
        if (last.current !== null && j.latest && j.latest !== last.current) {
          const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
          if (location.pathname.startsWith("/admin/chat") && !typing) router.refresh();
          else if (j.waiting > 0) setNotice(j.waiting);
        }
        last.current = j.latest ?? "";
      } catch {
        /* try again next tick */
      }
    }
    void tick();
    const id = setInterval(() => !stop && void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [router]);
  if (!notice) return null;
  return (
    <div className="toasts" role="status">
      <a className="toast good" href="/admin/chat" onClick={() => setNotice(0)}>
        رسالة جديدة بالدعم المباشر ({notice})
      </a>
    </div>
  );
}
