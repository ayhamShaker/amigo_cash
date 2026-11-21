import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { liveOffers, offerCoins, parseSteps } from "@/server/queries";
import { hasClaimedToday } from "@/server/rewards";
import { OfferCard, CATEGORY_LABEL } from "@/components/offer-card";
import { ActionForm, Submit } from "@/components/forms";
import { dailyBonusAction, promoAction } from "@/app/actions/member";
import { Icon } from "@/components/icons";
import { GuestCard, WalletBar } from "@/components/member";
import { coinsToCents } from "@/lib/money";
import { translateData } from "@/i18n/t";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Earn" };

export default async function EarnPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const sp = await searchParams;
  const [user, settings, offers] = await Promise.all([currentUser(), getSettings(), liveOffers()]);
  const cat = sp.cat && CATEGORY_LABEL[sp.cat] ? sp.cat : "all";
  const shown = offers.filter((o) => o.featured && (cat === "all" || o.category === cat));
  const cats = ["all", ...Object.keys(CATEGORY_LABEL).filter((c) => offers.some((o) => o.featured && o.category === c))];
  const [claimed, started, walls] = await Promise.all([
    user ? hasClaimedToday(user.id) : Promise.resolve(false),
    user ? db.offerProgress.findMany({ where: { userId: user.id }, select: { offerId: true } }) : Promise.resolve([]),
    db.network.findMany({ where: { enabled: true, wallUrl: { not: null } }, orderBy: { name: "asc" } }),
  ]);
  const startedIds = new Set(started.map((s) => s.offerId));
  const L = `/${locale}`;

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">{user ? t("Hi {name}", { name: user.name.split(" ")[0] ?? "" }) : t("Welcome")}</div>
          <h1>{t("Earn coins")}</h1>
        </div>
        <span className="small muted">{t("{c} coins = $1.00", { c: settings.coinsPerUsd.toLocaleString("en-US") })}</span>
      </div>
      {sp.welcome ? (
        <div className="formmsg good">
          <Icon name="check" />
          <span>{t("Welcome! Check your inbox and confirm your email so you can cash out later.")}</span>
        </div>
      ) : null}
      {user ? <WalletBar user={user} settings={settings} t={t} locale={locale} /> : <GuestCard locale={locale} t={t} />}

      <div className="chest">
        <div className="chest-ico">
          <Icon name="gift" />
        </div>
        <div className="grow">
          <h3 style={{ fontSize: 19 }}>{t("Daily bonus chest")}</h3>
          <p className="small muted">{claimed ? t("Opened today. A new chest is ready after midnight UTC.") : t("Open it once a day for {a}–{b} free coins.", { a: settings.dailyMin, b: settings.dailyMax })}</p>
        </div>
        {user ? (
          <ActionForm action={dailyBonusAction} locale={locale} className="stack" resetOnOk>
            <Submit className={`btn ${claimed ? "ghost" : "primary"}`} disabled={claimed}>
              {claimed ? t("Come back later") : t("Open chest")}
            </Submit>
          </ActionForm>
        ) : (
          <a className="btn primary" href={`${L}/signup`}>
            <Icon name="lock" />
            {t("Open chest")}
          </a>
        )}
      </div>

      <section className="stack">
        <div className="row between wr">
          <h2 style={{ fontSize: 20 }}>{t("Featured offers")}</h2>
          <div className="tabs" role="tablist">
            {cats.map((c) => (
              <a key={c} className={`tab ${cat === c ? "on" : ""}`} href={c === "all" ? `${L}/earn` : `${L}/earn?cat=${c}`} role="tab" aria-selected={cat === c}>
                {c === "all" ? t("All") : t(CATEGORY_LABEL[c]!)}
              </a>
            ))}
          </div>
        </div>
        {shown.length ? (
          <div className="offers">
            {shown.map((o) => {
              const coins = offerCoins(o, settings);
              return (
                <OfferCard
                  key={o.id}
                  href={`${L}/earn/offer/${o.id}`}
                  title={o.title}
                  color={o.color}
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
          <p className="small muted">{t("Codes are shared on our Telegram channel and by creators.")}</p>
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
