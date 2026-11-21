import type { T } from "@/i18n/t";
import type { Locale } from "@/i18n/config";
import type { SessionUser } from "@/server/session";
import type { SiteSettings } from "@/server/settings";
import { coinsToCents, formatUsd } from "@/lib/money";
import { levelOf } from "./level";

export function WalletBar({ user, settings, t, locale }: { user: SessionUser; settings: SiteSettings; t: T; locale: Locale }) {
  return (
    <div className="walletbar">
      <div>
        <div className="s">{t("Available")}</div>
        <div className="v" dir="ltr">
          <span className="coin">A</span>
          {user.balance.toLocaleString("en-US")}
        </div>
        <div className="s">≈ {formatUsd(coinsToCents(Math.max(0, user.balance), settings.coinsPerUsd))}</div>
      </div>
      <div>
        <div className="s">{t("Pending")}</div>
        <div className="v" style={{ color: "var(--warn)" }} dir="ltr">
          {user.pending.toLocaleString("en-US")}
        </div>
        <div className="s">
          {user.pending ? (
            <a href={`/${locale}/activity?tab=pending`} style={{ color: "inherit" }}>
              {t("Releases after {d}-day check", { d: settings.holdDays })}
            </a>
          ) : (
            t("Nothing on hold")
          )}
        </div>
      </div>
      <div>
        <div className="s">{t("Lifetime")}</div>
        <div className="v" dir="ltr">
          {user.lifetimeEarned.toLocaleString("en-US")}
        </div>
        <div className="s">{t("{lvl} member", { lvl: t(levelOf(user.lifetimeEarned).n) })}</div>
      </div>
      <div>
        <div className="s">{t("Email")}</div>
        <div className="v" style={{ fontSize: 15, fontFamily: "inherit" }}>
          {user.emailVerifiedAt ? <span className="pill good">{t("Confirmed")}</span> : <a className="pill warn" href={`/${locale}/account`}>{t("Not confirmed")}</a>}
        </div>
        <div className="s">{user.emailVerifiedAt ? t("Ready to cash out") : t("Confirm it before your first withdrawal")}</div>
      </div>
    </div>
  );
}

export function GuestCard({ locale, t }: { locale: Locale; t: T }) {
  return (
    <div className="guestcard">
      <div className="grow">
        <h3 style={{ fontSize: 18 }}>{t("Browsing as a guest")}</h3>
        <p className="small muted">{t("Sign up free to start offers, collect the daily chest and cash out.")}</p>
      </div>
      <div className="row wr">
        <a className="btn ghost" href={`/${locale}/login`}>
          {t("Log in")}
        </a>
        <a className="btn primary" href={`/${locale}/signup`}>
          {t("Sign up free")}
        </a>
      </div>
    </div>
  );
}

export function LockedPage({ locale, t }: { locale: Locale; t: T }) {
  return (
    <div className="card empty" style={{ paddingBlock: 56 }}>
      <h2 style={{ fontSize: 22, color: "var(--fg)" }}>{t("This page is for members")}</h2>
      <span>{t("Sign up or log in to see this page.")}</span>
      <div className="row wr" style={{ justifyContent: "center" }}>
        <a className="btn primary" href={`/${locale}/signup`}>
          {t("Sign up free")}
        </a>
        <a className="btn ghost" href={`/${locale}/login`}>
          {t("Log in")}
        </a>
      </div>
    </div>
  );
}
