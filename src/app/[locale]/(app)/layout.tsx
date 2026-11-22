import { pageLocale, themeCookie } from "../locale";
import { currentUser } from "@/server/session";
import { Coins, Icon, Logo } from "@/components/icons";
import { LangSwitch, ThemeToggle } from "@/components/client-controls";
import { BottomNav, TopNav, type NavItem } from "@/components/nav";
import { LiveRefresh, MemberLive } from "@/components/live-refresh";
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
    { href: `${L}/referrals`, label: t("Invite"), icon: "users" },
    { href: `${L}/leaderboard`, label: t("Leaderboard"), icon: "trophy" },
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
      <header className={`topbar ${user ? "member" : ""}`}>
        <div className="topbar-in">
          <Logo href={L} />
          <TopNav items={items} label={t("Main")} />
          <div className="grow" />
          <span className="prefs row" style={{ gap: 8 }}>
            <LangSwitch current={locale} label={t("Language")} />
            <ThemeToggle initial={theme} labels={{ toDark: t("Switch to dark mode"), toLight: t("Switch to light mode") }} />
          </span>
          {user ? (
            <>
              <MemberLive locale={locale} labels={{ title: t("Notifications"), empty: t("No notifications yet."), open: t("Notifications") }} />
              <a className="balance-chip" href={`${L}/cashout`} style={{ textDecoration: "none" }} aria-label={t("Balance")}>
                <Coins n={user.balance} />
              </a>
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
        <main className="main">
          <div className="main-in">
            {vpn ? (
              <div className="card" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)" }}>
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
      {user ? null : <LiveRefresh locale={locale} />}
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
