import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { liveOffers, offerCoins, offerMatchesPlatform, parseSteps } from "@/server/queries";
import { dailyStreakStatus, streakLadder } from "@/server/rewards";
import { visitorCountry } from "@/server/request";
import { OfferCard, CATEGORY_LABEL } from "@/components/offer-card";
import { ActionForm, Submit } from "@/components/forms";
import { dailyBonusAction, promoAction } from "@/app/actions/member";
import { Icon } from "@/components/icons";
import { GuestCard, WalletBar } from "@/components/member";
import { levelBoostPct } from "@/components/level";
import { coinsToCents, formatCoins } from "@/lib/money";
import { translateData } from "@/i18n/t";
import { db } from "@/lib/db";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { t } = await pageLocale(params);
  return { title: t("Earn") };
}

const PLATFORMS = ["all", "android", "ios", "desktop"] as const;
const PLATFORM_LABEL: Record<string, string> = { all: "All devices", android: "Android", ios: "iOS", desktop: "Desktop" };

export default async function EarnPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const sp = await searchParams;
  const [user, settings, geo] = await Promise.all([currentUser(), getSettings(), visitorCountry()]);
  const country = sp.all === "1" ? null : (user?.country ?? geo);
  const offers = await liveOffers(country);
  const cat = sp.cat && CATEGORY_LABEL[sp.cat] ? sp.cat : "all";
  const dev = sp.dev && PLATFORMS.includes(sp.dev as (typeof PLATFORMS)[number]) ? sp.dev : "all";
  const shown = offers.filter((o) => o.featured && (cat === "all" || o.category === cat) && offerMatchesPlatform(o.platform, dev));
  const hasFeatured = offers.some((o) => o.featured);
  const cats = ["all", ...Object.keys(CATEGORY_LABEL).filter((c) => offers.some((o) => o.featured && o.category === c))];
  const [streak, started, walls] = await Promise.all([
    user ? dailyStreakStatus(user.id, settings) : Promise.resolve(null),
    user ? db.offerProgress.findMany({ where: { userId: user.id }, select: { offerId: true } }) : Promise.resolve([]),
    db.network.findMany({ where: { enabled: true, wallUrl: { not: null } }, orderBy: { name: "asc" } }),
  ]);
  const startedIds = new Set(started.map((s) => s.offerId));
  const boost = user ? levelBoostPct(user.lifetimeEarned, settings.levelBoostEnabled) : 0;
  const ladder = streak?.ladder ?? streakLadder(settings.dailyMin, settings.dailyMax);
  const claimed = streak?.claimedToday ?? false;
  const L = `/${locale}`;
  const filterUrl = (nextCat: string, nextDev: string) => {
    const q = new URLSearchParams();
    if (nextCat !== "all") q.set("cat", nextCat);
    if (nextDev !== "all") q.set("dev", nextDev);
    if (sp.all === "1") q.set("all", "1");
    const s = q.toString();
    return s ? `${L}/earn?${s}` : `${L}/earn`;
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">{user ? t("Hi {name}", { name: user.name.split(" ")[0] ?? "" }) : t("Welcome")}</div>
          <h1>{t("Earn coins")}</h1>
        </div>
        <span className="small muted">
          {t("{c} coins = $1.00", { c: settings.coinsPerUsd.toLocaleString("en-US") })}
          {boost > 0 ? <span className="pill good" style={{ marginInlineStart: 8 }}>+{boost}%</span> : null}
        </span>
      </div>
      {sp.welcome ? (
        <div className="formmsg good">
          <Icon name="check" />
          <span>{t("Welcome! Check your inbox and confirm your email so you can cash out later.")}</span>
        </div>
      ) : null}
      {user ? <WalletBar user={user} settings={settings} t={t} locale={locale} /> : <GuestCard locale={locale} t={t} />}

      <div className="card stack" style={{ gap: 12 }}>
        <div className="row wr" style={{ gap: 14 }}>
          <div className="chest-ico">
            <Icon name="gift" />
          </div>
          <div className="grow">
            <h3 style={{ fontSize: 19 }}>{t("Daily bonus streak")}</h3>
            <p className="small muted">
              {claimed
                ? t("Opened today. A new chest is ready after midnight UTC.")
                : streak && !streak.eligible
                  ? t("Earn {c} more coins from offers or surveys to unlock the daily streak.", { c: formatCoins(Math.max(1, streak.requiredCoins - streak.earned30d)) })
                  : t("Check in every day for 7 days to earn up to {b} coins.", { b: settings.dailyMax })}
            </p>
          </div>
          {user ? (
            <ActionForm action={dailyBonusAction} locale={locale} className="stack" resetOnOk>
              <Submit className={`btn ${claimed || (streak && !streak.eligible) ? "ghost" : "primary"}`} disabled={claimed || (!!streak && !streak.eligible)}>
                {claimed ? t("Come back later") : t("Claim Day {d}", { d: streak?.nextDayNumber ?? 1 })}
              </Submit>
            </ActionForm>
          ) : (
            <a className="btn primary" href={`${L}/signup`}>
              <Icon name="lock" />
              {t("Open chest")}
            </a>
          )}
        </div>
        <div className="streak" aria-label={t("Daily bonus streak")}>
          {ladder.map((amt, i) => {
            const dayNum = i + 1;
            const done = !!streak && (streak.claimedToday ? dayNum <= ((streak.streak - 1) % 7) + 1 : dayNum <= streak.streak % 7);
            const isNext = !done && (!streak ? dayNum === 1 : !streak.claimedToday && dayNum === streak.nextDayNumber);
            return (
              <div key={dayNum} className={`streak-day ${done ? "done" : isNext ? "next" : ""}`}>
                <span>{t("Day {d}", { d: dayNum })}</span>
                <b>+{amt}</b>
              </div>
            );
          })}
        </div>
      </div>

      {hasFeatured || walls.length === 0 ? (
        <section className="stack">
          <div className="row between wr">
            <h2 style={{ fontSize: 20 }}>{t("Featured offers")}</h2>
            <div className="row wr" style={{ gap: 8 }}>
              <div className="tabs" role="tablist">
                {cats.map((c) => (
                  <a key={c} className={`tab ${cat === c ? "on" : ""}`} href={filterUrl(c, dev)} role="tab" aria-selected={cat === c}>
                    {c === "all" ? t("All") : t(CATEGORY_LABEL[c]!)}
                  </a>
                ))}
              </div>
              {offers.length > 0 ? (
                <div className="tabs" role="tablist">
                  {PLATFORMS.map((p) => (
                    <a key={p} className={`tab ${dev === p ? "on" : ""}`} href={filterUrl(cat, p)} role="tab" aria-selected={dev === p}>
                      {t(PLATFORM_LABEL[p]!)}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {shown.length ? (
            <div className="offers">
              {shown.map((o) => {
                const coins = offerCoins(o, settings, 100, boost);
                return (
                  <OfferCard
                    key={o.id}
                    href={`${L}/earn/offer/${o.id}`}
                    title={o.title}
                    color={o.color}
                    imageUrl={o.imageUrl}
                    category={o.category}
                    networkName={o.network.name}
                    steps={parseSteps(o.steps).length}
                    coins={coins}
                    usdCents={coinsToCents(coins, settings.coinsPerUsd)}
                    progress={startedIds.has(o.id)}
                    t={t}
                  />
                );
              })}
            </div>
          ) : (
            <div className="card empty">{t("No offers in this category right now.")}</div>
          )}
        </section>
      ) : null}

      {walls.length ? (
        <section className="stack">
          <h2 style={{ fontSize: 20 }}>{t("Offer walls")}</h2>
          <p className="small muted" style={{ marginTop: -6 }}>
            {t("Hundreds more tasks from our partners. Rewards are shown in Amigo coins.")}
          </p>
          <div className="walls">
            {walls.map((n) => (
              <a key={n.id} className="wall" href={`${L}/earn/wall/${n.id}`}>
                <span className="wl" dir="ltr">
                  {n.name}
                </span>
                <span className="small muted">{translateData(locale, n.kind)}</span>
                <span className="tiny muted">{t("{s}% of the payout goes to you", { s: n.userShare ?? settings.userSharePct })}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card row wr">
        <div className="grow">
          <h3 style={{ fontSize: 18 }}>{t("Have a promo code?")}</h3>
          <p className="small muted">
            {t("Codes are shared by creators and on our community channels.")}{" "}
            {settings.telegramUrl ? (
              <a href={settings.telegramUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontWeight: 700 }}>
                Telegram
              </a>
            ) : null}
            {settings.telegramUrl && settings.discordUrl ? " · " : null}
            {settings.discordUrl ? (
              <a href={settings.discordUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontWeight: 700 }}>
                Discord
              </a>
            ) : null}
          </p>
        </div>
        {user ? (
          <ActionForm action={promoAction} locale={locale} className="row wr" resetOnOk>
            <label className="sr-only" htmlFor="f-promo">
              {t("Promo code")}
            </label>
            <input className="input promo" id="f-promo" name="code" placeholder="CODE" dir="ltr" maxLength={32} autoCapitalize="characters" />
            <Submit>{t("Redeem")}</Submit>
          </ActionForm>
        ) : (
          <a className="btn primary" href={`${L}/signup`}>
            {t("Sign up free")}
          </a>
        )}
      </section>
    </>
  );
}
