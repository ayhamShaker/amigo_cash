"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

const LOCALES = [
  ["en", "EN", "English"],
  ["es", "ES", "Español"],
  ["ar", "AR", "العربية"],
  ["hi", "HI", "हिन्दी"],
] as const;

/** Language menu that keeps the visitor on the same page. */
export function LangSwitch({ current, label }: { current: string; label: string }) {
  const pathname = usePathname() || `/${current}`;
  const rest = pathname.replace(/^\/(en|es|ar|hi)(?=\/|$)/, "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const cur = LOCALES.find(([k]) => k === current) ?? LOCALES[0];
  return (
    <div className="langmenu" ref={ref}>
      <button type="button" className="langbtn" aria-haspopup="true" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <Icon name="globe" />
        <span>{cur[1]}</span>
        <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="langlist" role="menu" aria-label={label}>
          {LOCALES.map(([k, short, name]) => (
            <a key={k} role="menuitem" href={`/${k}${rest}`} className={current === k ? "on" : ""} aria-current={current === k ? "true" : undefined} lang={k} hrefLang={k}>
              <span>{name}</span>
              <span className="tiny muted">{short}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Light / dark toggle. The choice is kept in a cookie so the server renders it without a flash. */
export function ThemeToggle({ initial, labels }: { initial: "light" | "dark" | "system"; labels: { toDark: string; toLight: string } }) {
  const [theme, setTheme] = useState(initial);
  const systemDark = useSyncExternalStore(subscribeScheme, () => window.matchMedia("(prefers-color-scheme: dark)").matches, () => false);
  const dark = theme === "dark" || (theme === "system" && systemDark);
  return (
    <button
      type="button"
      className="iconbtn themebtn"
      aria-label={dark ? labels.toLight : labels.toDark}
      title={dark ? labels.toLight : labels.toDark}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        document.cookie = `amigo_theme=${next}; path=/; max-age=31536000; samesite=lax`;
        setTheme(next);
      }}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

function subscribeScheme(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
