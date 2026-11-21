import type { Locale } from "@/i18n/config";
import type { T } from "@/i18n/t";
import { Logo } from "./icons";
import { LangSwitch, ThemeToggle } from "./client-controls";

/** Header for public pages: landing and sign-in screens. */
export function SiteHeader({ locale, t, theme, signedIn, links = true }: { locale: Locale; t: T; theme: "light" | "dark" | "system"; signedIn: boolean; links?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Logo href={`/${locale}`} />
        {links ? (
          <nav className="toplinks hide-sm" aria-label={t("Main")}>
            <a href={`/${locale}/earn`}>{t("Earn")}</a>
            <a href={`/${locale}/surveys`}>{t("Surveys")}</a>
            <a href={`/${locale}/leaderboard`}>{t("Leaderboard")}</a>
            <a href={`/${locale}/cashout`}>{t("Cash out")}</a>
          </nav>
        ) : null}
        <div className="grow" />
        <LangSwitch current={locale} label={t("Language")} />
        <ThemeToggle initial={theme} labels={{ toDark: t("Switch to dark mode"), toLight: t("Switch to light mode") }} />
        {signedIn ? (
          <a className="btn primary" href={`/${locale}/earn`}>
            {t("Open dashboard")}
          </a>
        ) : (
          <>
            <a className="btn ghost hide-xs" href={`/${locale}/login`}>
              {t("Log in")}
            </a>
            <a className="btn primary" href={`/${locale}/signup`}>
              {t("Sign up")}
            </a>
          </>
        )}
      </div>
    </header>
  );
}

export function maskName(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "Member";
  const last = parts.length > 1 ? ` ${parts[parts.length - 1]![0]}.` : "";
  return `${first.slice(0, 12)}${last}`;
}
