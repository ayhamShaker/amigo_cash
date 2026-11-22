"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls every 5 s. Any change (new chat message, postback, withdrawal, member)
 * re-renders the current admin page in place, unless the admin is typing.
 * A new chat message also shows a notice when they are not on the chat page.
 */
export function AdminLive() {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const lastChat = useRef<string | null>(null);
  const [notice, setNotice] = useState<number>(0);
  useEffect(() => {
    let stop = false;
    async function tick() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/admin/chat", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { waiting: number; latest: string | null; v: string };
        const el = document.activeElement as HTMLInputElement | null;
        const typing = !!el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && el.value !== "";
        if (last.current !== null && j.v !== last.current) {
          if (!typing) router.refresh();
          if (j.latest !== lastChat.current && j.waiting > 0 && !location.pathname.startsWith("/admin/chat")) setNotice(j.waiting);
        }
        if (!typing) last.current = j.v;
        lastChat.current = j.latest;
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
