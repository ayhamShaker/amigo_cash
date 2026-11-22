"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

type Fresh = { id: string; text: string; href: string | null };
type Item = Fresh & { read: boolean; createdAt: string };

function typing() {
  const el = document.activeElement as HTMLInputElement | null;
  return !!el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && el.value !== "";
}

/**
 * Keeps the page live: polls a small fingerprint and re-renders server data
 * (no reload) when it changes; pops up new notifications on screen. Pauses
 * while the tab is hidden and while the person is typing.
 */
export function LiveRefresh({ locale, intervalMs = 8000, onState }: { locale: string; intervalMs?: number; onState?: (s: { unread: number; fresh: Fresh[] }) => void }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const cb = useRef(onState);
  useEffect(() => {
    cb.current = onState;
  });
  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch(`/api/me/state?l=${locale}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { v?: string; unread: number; fresh: Fresh[] };
        if (typeof j.v !== "string") return;
        cb.current?.({ unread: j.unread, fresh: j.fresh });
        if (last.current !== null && j.v !== last.current && !typing()) router.refresh();
        if (!typing()) last.current = j.v;
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
  }, [locale, intervalMs, router]);
  return null;
}

/** Bell with unread count, a menu of recent notifications, and pop-ups for new ones. */
export function MemberLive({ locale, labels }: { locale: string; labels: { title: string; empty: string; open: string } }) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [toasts, setToasts] = useState<Fresh[]>([]);
  const seen = useRef<Set<string> | null>(null);

  function onState(s: { unread: number; fresh: Fresh[] }) {
    setUnread(s.unread);
    if (seen.current === null) {
      // first poll after page load: remember what is already there, show nothing
      seen.current = new Set(s.fresh.map((f) => f.id));
      return;
    }
    const added = s.fresh.filter((f) => !seen.current!.has(f.id));
    added.forEach((f) => seen.current!.add(f.id));
    if (added.length) {
      setToasts((t) => [...added.reverse(), ...t].slice(0, 3));
      added.forEach((f) => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== f.id)), 7000));
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    try {
      const res = await fetch(`/api/me/notifications?l=${locale}`, { cache: "no-store" });
      if (res.ok) setItems(((await res.json()) as { items: Item[] }).items);
      if (unread > 0) {
        await fetch("/api/me/notifications", { method: "POST" });
        setUnread(0);
      }
    } catch {
      /* keep the menu open with whatever we have */
    }
  }

  return (
    <>
      <LiveRefresh locale={locale} onState={onState} />
      <div className="bellwrap">
        <button type="button" className="iconbtn" onClick={toggle} aria-label={labels.open} aria-expanded={open}>
          <Icon name="bell" />
          {unread > 0 ? <span className="bellcount">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
        {open ? (
          <div className="bellmenu" role="dialog" aria-label={labels.title}>
            <b className="small">{labels.title}</b>
            {items === null ? null : items.length ? (
              items.map((n) => (
                <a key={n.id} className={`bellitem ${n.read ? "" : "new"}`} href={n.href ?? "#"} dir="auto">
                  {n.text}
                  <span className="tiny muted">{new Date(n.createdAt).toLocaleString(locale === "ar" ? "ar-u-nu-latn" : locale === "es" ? "es-AR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </a>
              ))
            ) : (
              <span className="small muted">{labels.empty}</span>
            )}
          </div>
        ) : null}
      </div>
      <div className="toasts live" role="status" aria-live="polite">
        {toasts.map((t) => (
          <a key={t.id} className="toast good" href={t.href ?? "#"} dir="auto">
            <Icon name="bell" />
            <span>{t.text}</span>
          </a>
        ))}
      </div>
    </>
  );
}
