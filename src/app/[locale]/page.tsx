import { cookies } from "next/headers";
import { CREATOR_COOKIE } from "@/lib/attribution";
import { pageLocale, themeCookie } from "./locale";
import { SiteHeader, maskName } from "@/components/site-header";
import { BottomNav, type NavItem } from "@/components/nav";
import { Coins, Icon } from "@/components/icons";
import { getSettings } from "@/server/settings";
import { currentUser } from "@/server/session";
import { visitorCountry } from "@/server/request";
import { liveOffers, offerCoins, parseSteps, publicStats, recentActivity } from "@/server/queries";
import { formatUsd } from "@/lib/money";
import { translateData } from "@/i18n/t";
import { methodName } from "@/lib/methods";
import { db } from "@/lib/db";
import { FaqList } from "@/components/faq";
import { LiveRefresh } from "@/components/live-refresh";
import { OfferCard } from "@/components/offer-card";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const [settings, user, theme, geo, stats, activity] = await Promise.all([getSettings(), currentUser(), themeCookie(), visitorCountry(), publicStats(), recentActivity()]);
  const country = user?.country ?? geo;
  let offers = await liveOffers(country);
  if (offers.length === 0 && country) offers = await liveOffers();
  const refCode = (await cookies()).get("amigo_ref")?.value;
  const creatorId = (await cookies()).get(CREATOR_COOKIE)?.value;
  const creator = !user && creatorId ? await db.creator.findUnique({ where: { id: creatorId }, select: { name: true, active: true, bonusCoins: true } }) : null;
  const inviter = !user && refCode && !creator?.active ? await db.user.findUnique({ where: { refCode }, select: { name: true, status: true } }) : null;
  const featured = offers[0];
  const enabledMethods = settings.methods.filter((m) => m.enabled);
  const minCents = Math.min(...enabledMethods.map((m) => m.minCents), 100_000);
  const networks = await db.network.count({ where: { enabled: true } });
  const mname = (id: string) => t(methodName(settings.methods, id));
  const methodList = enabledMethods.slice(0, 4).map((m) => t(m.name)).join(", ");
  const L = `/${locale}`;
  const bottomNav: NavItem[] = [
    { href: `${L}/earn`, label: t("Earn"), icon: "bolt" },
    { href: `${L}/surveys`, label: t("Surveys"), icon: "survey" },
    { href: `${L}/cashout`, label: t("Cash out"), icon: "wallet" },
    { href: `${L}/leaderboard`, label: t("Leaderboard"), icon: "trophy" },
    { href: user ? `${L}/account` : `${L}/login`, label: user ? t("Account") : t("Log in"), icon: "user" },
  ];

  const tickerItems = [
    ...activity.conv.map((c) => ({ key: c.id, node: t("{n} earned {c} on {o}", { n: maskName(c.user?.name ?? "Member"), c: c.coins.toLocaleString("en-US"), o: c.offerName }) })),
    ...activity.paid.map((w) => ({ key: w.id, node: t("{n} cashed out {v} via {m}", { n: maskName(w.user.name), v: formatUsd(w.amountCents), m: mname(w.method) }) })),
  ];

  return (
    <>
      {creator?.active ? (
        <div className="invite">
          <div className="wrap row between wr">
            <div className="row">
              <Icon name="gift" />
              <div>
                <b>{t("{n} sent you to Amigo Cash", { n: creator.name })}</b>
                <div className="small">
                  {t("Sign up now and get {c} bonus coins on top of the welcome bonus.", { c: (creator.bonusCoins + (refCode ? settings.inviteBonus : 0)).toLocaleString("en-US") })}
                </div>
              </div>
            </div>
            <a className="btn" href={`/${locale}/signup`}>
              {t("Sign up free")}
            </a>
          </div>
        </div>
      ) : null}
      {inviter?.status === "ACTIVE" ? (
        <div className="invite">
          <div className="wrap row between wr">
            <div className="row">
              <Icon name="gift" />
              <div>
                <b>{t("{n} invited you to Amigo Cash", { n: maskName(inviter.name) })}</b>
                <div className="small">{t("Sign up with this invite and get {c} extra coins on top of the welcome bonus.", { c: settings.inviteBonus.toLocaleString("en-US") })}</div>
              </div>
            </div>
            <a className="btn" href={`/${locale}/signup`}>
              {t("Accept invite")}
            </a>
          </div>
        </div>
      ) : null}
      <SiteHeader locale={locale} t={t} theme={theme} signedIn={!!user} />
      <main className="wrap stack" style={{ gap: 14, paddingBlock: "14px 24px" }}>
        <div className="bento">
          <section className="tile hero c2 r2" style={{ padding: 34, justifyContent: "space-between", gap: 24 }}>
            <span className="pill" style={{ alignSelf: "flex-start", background: "rgba(255,255,255,.18)", color: "#fff" }}>
              {t("Rewards for your free time")}
            </span>
            <h1 className="hero-title">
              {t("Play games. Try apps.")} {t("Get paid")} {t("in minutes.")}
            </h1>
            <div className="stack" style={{ gap: 18 }}>
              <p className="muted" style={{ fontSize: 17, maxWidth: 460 }}>
                {t("Pick a game or app, reach the goal, and the coins land in your balance as soon as the advertiser confirms it. Cash out from {min} in crypto or gift cards.", { min: formatUsd(minCents) })}
              </p>
              <div className="row wr">
                <a className="btn lg" style={{ background: "#fff", color: "var(--hero-2)" }} href={user ? `/${locale}/earn` : `/${locale}/signup`}>
                  {user ? t("Open dashboard") : t("Start earning")}
                </a>
                <a className="btn lg" style={{ background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} href={`/${locale}/earn`}>
                  {t("Browse offers")}
                </a>
              </div>
            </div>
          </section>

          {featured ? (
            <a className="tile c2" href={`/${locale}/earn/offer/${featured.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="row">
                {featured.imageUrl && featured.imageUrl.startsWith("https://") ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- external offer thumbnail */
                  <img className="offer-img" src={featured.imageUrl} alt="" width={56} height={56} />
                ) : (
                  <span className="appicon" style={{ background: featured.color, width: 56, height: 56, borderRadius: 12 }}>
                    {featured.title[0]}
                  </span>
                )}
                <div className="grow">
                  <div className="eyebrow">{t("Featured game")}</div>
                  <b style={{ fontSize: 19 }}>{featured.title}</b>
                  <div className="small muted">
                    {translateData(locale, featured.platform)} · {t("{d} days to finish", { d: featured.days })}
                  </div>
                </div>
              </div>
              <div className="row between" style={{ marginTop: "auto" }}>
                <span className="small muted">{t("Total reward")}</span>
                <span style={{ fontSize: 22 }}>
                  <Coins n={offerCoins(featured, settings)} />
                </span>
              </div>
            </a>
          ) : (
            <section className="tile c2" style={{ justifyContent: "center" }}>
              <b style={{ fontSize: 20 }}>{t("Three steps from sign-up to payout")}</b>
            </section>
          )}

          <section className="tile dark half" style={{ justifyContent: "space-between" }}>
            <span className="small muted">{t("Cash out from")}</span>
            <span className="big">{formatUsd(minCents).replace(".00", "")}</span>
          </section>

          <section className="tile gold half" style={{ justifyContent: "space-between" }}>
            <span className="small muted" style={{ fontWeight: 700 }}>
              {t("Daily chest")}
            </span>
            <b style={{ fontSize: 20, lineHeight: 1.2 }}>{t("Open it every day for up to {c} coins.", { c: settings.dailyMax.toLocaleString("en-US") })}</b>
          </section>

          <section className={`tile ${tickerItems.length ? "c3" : "c4"}`}>
            <div className="row between">
              <h2 style={{ fontSize: 22 }}>{t("Paying today")}</h2>
              <a className="small" href={`/${locale}/earn`} style={{ fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}>
                {t("All offers")} <span className="arr">→</span>
              </a>
            </div>
            {offers.length ? (
              <div className="offers">
                {offers.slice(0, 3).map((o) => (
                  <OfferCard
                    key={o.id}
                    href={`/${locale}/earn/offer/${o.id}`}
                    title={o.title}
                    color={o.color}
                    imageUrl={o.imageUrl}
                    category={o.category}
                    networkName={o.network.name}
                    steps={parseSteps(o.steps).length}
                    coins={offerCoins(o, settings)}
                    usdCents={Math.round((offerCoins(o, settings) * 100) / settings.coinsPerUsd)}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <p className="muted">{t("New offers are on their way. Check back soon.")}</p>
            )}
          </section>

          {tickerItems.length ? (
            <section className="tile r2">
              <div className="row between">
                <h2 style={{ fontSize: 18 }}>{t("Just paid")}</h2>
                <span className="row tiny" style={{ gap: 6, color: "var(--good)", fontWeight: 700 }}>
                  <span className="dot" />
                  {t("Live")}
                </span>
              </div>
              <div className="stack" style={{ gap: 0 }}>
                {tickerItems.slice(0, 7).map((it) => (
                  <div key={it.key} className="small" dir="auto" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                    {it.node}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="tile c2">
            <h2 style={{ fontSize: 22 }}>{t("How it works")}</h2>
            <ol className="hiw">
              <li>
                <span className="num">1</span>
                <b>{t("Choose an offer")}</b>
                <span className="small muted">
                  {networks > 1
                    ? t("Games, app sign-ups and short surveys from {n} offer partners. Every task shows the exact coins before you start.", { n: networks })
                    : t("Games, app sign-ups and short surveys from our offer partners. Every task shows the exact coins before you start.")}
                </span>
              </li>
              <li>
                <span className="num">2</span>
                <b>{t("Reach the goal")}</b>
                <span className="small muted">{t("Play to a level, open an account or finish a survey. The advertiser confirms it and your coins arrive automatically.")}</span>
              </li>
              <li>
                <span className="num">3</span>
                <b>{t("Cash out")}</b>
                <span className="small muted">
                  {methodList
                    ? t("{c} coins = $1. Withdraw to {m} and more.", { c: settings.coinsPerUsd.toLocaleString("en-US"), m: methodList })
                    : t("{c} coins = $1. Withdraw in crypto or gift cards.", { c: settings.coinsPerUsd.toLocaleString("en-US") })}
                </span>
              </li>
            </ol>
          </section>

          <section className="tile soft">
            <b style={{ fontSize: 13, color: "var(--accent)" }}>{t("Invite friends")}</b>
            <b style={{ fontSize: 19, lineHeight: 1.2 }}>{t("Earn {p}% of everything your friends make.", { p: settings.referralPct })}</b>
            <a href={`/${locale}/referrals`} style={{ marginTop: "auto", fontWeight: 800, color: "var(--accent)", textDecoration: "none" }}>
              {t("Get your link")} <span className="arr">→</span>
            </a>
          </section>

          <section className="tile c4">
            <div className="row between wr">
              <h2 style={{ fontSize: 22 }}>{t("Your money, your way")}</h2>
              {stats.paidCents >= 10_000 ? (
                <span className="small muted">
                  <b className="num">{formatUsd(stats.paidCents).replace(".00", "")}</b> {t("paid to members")}
                </span>
              ) : null}
            </div>
            <div className="methods" style={{ marginTop: 4 }}>
              {settings.methods.map((m) => (
                <div className="method" key={m.id} style={m.enabled ? undefined : { opacity: 0.55 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- small static or inline icon */}
                  <img className="mlogo" src={m.image} alt="" width={40} height={40} />
                  <div className="grow">
                    <div style={{ fontWeight: 800 }}>{t(m.name)}</div>
                    <div className="small muted">{m.enabled ? t("From {v}", { v: formatUsd(m.minCents) }) : t("Coming soon")}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="tile" style={{ padding: "32px 22px" }}>
          <div>
            <div className="faq faq-center">
              <div className="eyebrow">{t("Questions")}</div>
              <h2>{t("Before you sign up")}</h2>
              <div className="faq-list">
                <FaqList t={t} settings={settings} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <LiveRefresh locale={locale} intervalMs={20000} />
      <footer className="footer">
        <div className="wrap row between wr">
          <span>{t("© 2026 Amigo Cash. Members must be {age}+. Earnings depend on the offers you complete.", { age: settings.minAge })}</span>
          <span className="row wr" style={{ gap: 14 }}>
            {settings.telegramUrl || settings.discordUrl || settings.trustpilotUrl ? (
              <span className="social-links">
                {settings.telegramUrl ? (
                  <a href={settings.telegramUrl} target="_blank" rel="noopener noreferrer">
                    Telegram
                  </a>
                ) : null}
                {settings.discordUrl ? (
                  <a href={settings.discordUrl} target="_blank" rel="noopener noreferrer">
                    Discord
                  </a>
                ) : null}
                {settings.trustpilotUrl ? (
                  <a href={settings.trustpilotUrl} target="_blank" rel="noopener noreferrer">
                    Trustpilot
                  </a>
                ) : null}
              </span>
            ) : null}
            <a href={`/${locale}/legal/terms`}>{t("Terms")}</a>
            <a href={`/${locale}/legal/privacy`}>{t("Privacy")}</a>
          </span>
        </div>
      </footer>
      <BottomNav items={bottomNav} label={t("Main")} />
    </>
  );
}
