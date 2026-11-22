import { pageLocale, themeCookie } from "../locale";
import { currentUser } from "@/server/session";
import { Coins, Icon, Logo } from "@/components/icons";
import { LangSwitch, ThemeToggle } from "@/components/client-controls";
import { BottomNav, SideNav, type NavItem } from "@/components/nav";
import { LevelCard } from "@/components/level";
import { logoutAction } from "@/app/actions/auth";
import { releaseDueHolds } from "@/server/ledger";
import { checkIp, isBadConnection } from "@/server/fraud";
import { getSettings } from "@/server/settings";
import { requestIp } from "@/server/request";

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const [theme, settings] = await Promise.all([themeCookie(), getSettings()]);
  let user = await currentUser();
  if (user && user.pending > 0) {
    // Release any matured holds as soon as the member visits.
    if ((await releaseDueHolds({ userId: user.id, limit: 50 })) > 0) user = { ...user, ...(await refreshed(user.id)) };
  }
  const vpn = user && settings.blockVpn ? isBadConnection(await checkIp(await requestIp())) : false;
  const L = `/${locale}`;
  const items: NavItem[] = [
    { href: `${L}/earn`, label: t("Earn"), icon: "bolt" },
    { href: `${L}/surveys`, label: t("Surveys"), icon: "survey" },
    { href: `${L}/cashout`, label: t("Cash out"), icon: "wallet" },
    { href: `${L}/referrals`, label: t("Referrals"), icon: "users" },
    { href: `${L}/leaderboard`, label: t("Leaderboard"), icon: "trophy" },
    { href: `${L}/activity`, label: t("Activity"), icon: "list", locked: !user },
    { href: `${L}/account`, label: t("Account"), icon: "user", locked: !user },
    { href: `${L}/help`, label: t("Help"), icon: "help" },
  ];
  const bottom: NavItem[] = [
    { href: `${L}/earn`, label: t("Earn"), icon: "bolt" },
    { href: `${L}/surveys`, label: t("Surveys"), icon: "survey" },
    { href: `${L}/cashout`, label: t("Cash out"), icon: "wallet" },
    { href: `${L}/referrals`, label: t("Invite"), icon: "users" },
    { href: `${L}/account`, label: t("Account"), icon: "user" },
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Logo href={L} />
          <div className="grow" />
          <LangSwitch current={locale} label={t("Language")} />
          <ThemeToggle initial={theme} labels={{ toDark: t("Switch to dark mode"), toLight: t("Switch to light mode") }} />
          {user ? (
            <>
              <div className="balance-chip">
                <span className="lbl small muted">{t("Balance")}</span>
                <Coins n={user.balance} />
                <a className="btn primary sm" href={`${L}/cashout`}>
                  {t("Cash out")}
                </a>
              </div>
              <a className="avatar" href={`${L}/account`} aria-label={t("Account")} style={{ background: avatarColor(user.name) }}>
                {user.name[0]?.toUpperCase()}
              </a>
            </>
          ) : (
            <>
              <a className="btn ghost hide-xs" href={`${L}/login`}>
                {t("Log in")}
              </a>
              <a className="btn primary" href={`${L}/signup`}>
                {t("Sign up")}
              </a>
            </>
          )}
        </div>
      </header>
      <div className="shell">
        <nav className="side" aria-label={t("Main")}>
          <SideNav items={items} lockLabel={t("This page is for members")} />
          <div className="sep" />
          {user ? (
            <>
              <div className="card flat" style={{ padding: 14, background: "var(--surface-2)", border: 0 }}>
                <LevelCard earned={user.lifetimeEarned} t={t} />
              </div>
              <form action={logoutAction} style={{ marginTop: "auto" }}>
                <input type="hidden" name="locale" value={locale} />
                <button className="navlink" type="submit">
                  <Icon name="out" />
                  {t("Log out")}
                </button>
              </form>
            </>
          ) : (
            <div className="card flat stack" style={{ padding: 14, background: "var(--accent-soft)", border: 0, gap: 8 }}>
              <b className="small">{t("Browsing as a guest")}</b>
              <span className="tiny muted">{t("Sign up free to start offers, collect the daily chest and cash out.")}</span>
              <a className="btn primary sm" href={`${L}/signup`}>
                {t("Sign up free")}
              </a>
            </div>
          )}
        </nav>
        <main className="main">
          <div className="main-in">
            {vpn ? (
              <div className="card" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)" }}>
                <div className="row">
                  <Icon name="shield" />
                  <div>
                    <b>{t("VPN or proxy detected.")}</b> <span className="small">{t("Earning is paused on this connection. Turn off your VPN and reload the page.")}</span>
                  </div>
                </div>
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
      <BottomNav items={bottom} label={t("Main")} />
    </>
  );
}

async function refreshed(userId: string) {
  const { db } = await import("@/lib/db");
  return db.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true, pending: true, lifetimeEarned: true } });
}

function avatarColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 42%)`;
}
