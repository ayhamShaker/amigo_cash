import { cookies } from "next/headers";
import { pageLocale, themeCookie } from "./locale";
import { SiteHeader, maskName } from "@/components/site-header";
import { Coins, Icon } from "@/components/icons";
import { getSettings } from "@/server/settings";
import { currentUser } from "@/server/session";
import { liveOffers, offerCoins, parseSteps, publicStats, recentActivity } from "@/server/queries";
import { formatUsd } from "@/lib/money";
import { translateData } from "@/i18n/t";
import { METHOD_META, METHOD_KEYS } from "@/lib/methods";
import { db } from "@/lib/db";
import { FaqList } from "@/components/faq";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const [settings, user, theme, offers, stats, activity] = await Promise.all([getSettings(), currentUser(), themeCookie(), liveOffers(), publicStats(), recentActivity()]);
  const refCode = (await cookies()).get("amigo_ref")?.value;
  const inviter = !user && refCode ? await db.user.findUnique({ where: { refCode }, select: { name: true, status: true } }) : null;
  const featured = offers[0];
  const steps = featured ? parseSteps(featured.steps) : [];
  const enabledMethods = METHOD_KEYS.filter((m) => settings.methods[m].enabled);
  const minCents = Math.min(...enabledMethods.map((m) => settings.methods[m].minCents), 100_000);
  const networks = await db.network.count({ where: { enabled: true } });
  const mname = (m: keyof typeof METHOD_META) => (m === "amazon" ? t("Amazon Gift Card") : METHOD_META[m].name);

  const tickerItems = [
    ...activity.conv.map((c) => ({ key: c.id, node: t("{n} earned {c} on {o}", { n: maskName(c.user?.name ?? "Member"), c: c.coins.toLocaleString("en-US"), o: c.offerName }) })),
    ...activity.paid.map((w) => ({ key: w.id, node: t("{n} cashed out {v} via {m}", { n: maskName(w.user.name), v: formatUsd(w.amountCents), m: mname(w.method as keyof typeof METHOD_META) }) })),
  ];

  return (
    <>
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
      {tickerItems.length >= 4 ? (
        <div className="ticker" aria-label={t("Recent earnings")}>
          <div className="ticker-in">
            {[...tickerItems, ...tickerItems].map((it, i) => (
              <span className="ticker-item" dir="auto" key={`${it.key}-${i}`} aria-hidden={i >= tickerItems.length}>
                {it.node}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <div className="eyebrow">{t("Rewards for your free time")}</div>
              <h1>
                {t("Play games. Try apps.")} <em>{t("Get paid")}</em> {t("in minutes.")}
              </h1>
              <p className="lede">{t("Pick a game or app, reach the goal, and the coins land in your balance as soon as the advertiser confirms it. Cash out from {min} in crypto or gift cards.", { min: formatUsd(minCents) })}</p>
              <div className="hero-cta">
                <a className="btn primary lg" href={user ? `/${locale}/earn` : `/${locale}/signup`}>
                  {user ? t("Open dashboard") : t("Start earning")}
                </a>
                <a className="btn ghost lg" href={`/${locale}/earn`}>
                  {t("Browse offers")}
                </a>
              </div>
              {stats.paidCents >= 10_000 || stats.members >= 100 ? (
                <div className="proofrow">
                  {stats.paidCents >= 10_000 ? (
                    <div>
                      <strong className="num">{formatUsd(stats.paidCents).replace(".00", "")}</strong>
                      <span>{t("paid to members")}</span>
                    </div>
                  ) : null}
                  {stats.members >= 100 ? (
                    <div>
                      <strong className="num">{stats.members.toLocaleString("en-US")}</strong>
                      <span>{t("members")}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {featured ? (
              <a className="phone" href={`/${locale}/earn/offer/${featured.id}`} style={{ textDecoration: "none" }}>
                <div className="offer-head">
                  <div className="appicon" style={{ background: featured.color }}>
                    {featured.title[0]}
                  </div>
                  <div className="grow">
                    <div className="eyebrow">{t("Featured game")}</div>
                    <h3 style={{ fontSize: 20 }}>{featured.title}</h3>
                    <div className="small muted">
                      {translateData(locale, featured.platform)} · {t("{d} days to finish", { d: featured.days })}
                    </div>
                  </div>
                </div>
                <div className="ms">
                  {steps.map((s, i) => (
                    <div className={`ms-item ${i === 0 ? "next" : ""}`} key={i}>
                      <span className="ms-dot" />
                      <span className="small" style={{ fontWeight: i === 0 ? 800 : 600 }}>
                        {translateData(locale, s.label)}
                      </span>
                      <Coins n={offerCoins(featured, settings, s.pct)} />
                    </div>
                  ))}
                </div>
                <div className="row between" style={{ marginTop: 12, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                  <span className="small muted">{t("Total reward")}</span>
                  <span style={{ fontSize: 20 }}>
                    <Coins n={offerCoins(featured, settings)} />
                  </span>
                </div>
              </a>
            ) : null}
          </div>
        </section>

        <section className="section" style={{ background: "var(--surface)", borderBlock: "1px solid var(--line)" }}>
          <div className="wrap">
            <div className="eyebrow">{t("How it works")}</div>
            <h2>{t("Three steps from sign-up to payout")}</h2>
            <div className="steps">
              <div className="step">
                <span className="n">01</span>
                <h3>{t("Choose an offer")}</h3>
                <p>{t("Games, app sign-ups and short surveys from {n} offer partners. Every task shows the exact coins before you start.", { n: Math.max(networks, 1) })}</p>
              </div>
              <div className="step">
                <span className="n">02</span>
                <h3>{t("Reach the goal")}</h3>
                <p>{t("Play to a level, open an account or finish a survey. The advertiser confirms it and your coins arrive automatically.")}</p>
              </div>
              <div className="step">
                <span className="n">03</span>
                <h3>{t("Cash out")}</h3>
                <p>{t("{c} coins = $1. Withdraw to USDT, Litecoin, Binance Pay or an Amazon gift card.", { c: settings.coinsPerUsd.toLocaleString("en-US") })}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="eyebrow">{t("Payout options")}</div>
            <h2>{t("Your money, your way")}</h2>
            <div className="methods">
              {METHOD_KEYS.map((m) => (
                <div className="method" key={m} style={settings.methods[m].enabled ? undefined : { opacity: 0.55 }}>
                  <span className="mlogo" style={{ background: METHOD_META[m].color }}>
                    {METHOD_META[m].short}
                  </span>
                  <div className="grow">
                    <div style={{ fontWeight: 800 }}>{mname(m)}</div>
                    <div className="small muted">{settings.methods[m].enabled ? t("From {v}", { v: formatUsd(settings.methods[m].minCents) }) : t("Coming soon")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 8 }}>
          <div className="wrap">
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
      <footer className="footer">
        <div className="wrap row between wr">
          <span>{t("© 2026 Amigo Cash. Members must be {age}+. Earnings depend on the offers you complete.", { age: settings.minAge })}</span>
          <span className="row" style={{ gap: 16 }}>
            <a href={`/${locale}/legal/terms`}>{t("Terms")}</a>
            <a href={`/${locale}/legal/privacy`}>{t("Privacy")}</a>
          </span>
        </div>
      </footer>
    </>
  );
}
