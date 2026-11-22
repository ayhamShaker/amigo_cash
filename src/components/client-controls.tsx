"use client";

import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

const LOCALES = [
  ["en", "EN"],
  ["es", "ES"],
  ["ar", "AR"],
] as const;

/** EN / ES / AR switch that keeps the visitor on the same page. */
export function LangSwitch({ current, label }: { current: string; label: string }) {
  const pathname = usePathname() || `/${current}`;
  const rest = pathname.replace(/^\/(en|es|ar)(?=\/|$)/, "");
  return (
    <div className="langsw" role="group" aria-label={label}>
      {LOCALES.map(([k, l]) => (
        <a key={k} href={`/${k}${rest}`} className={current === k ? "on" : ""} aria-current={current === k ? "true" : undefined} lang={k} hrefLang={k}>
          {l}
        </a>
      ))}
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
      className="iconbtn"
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
