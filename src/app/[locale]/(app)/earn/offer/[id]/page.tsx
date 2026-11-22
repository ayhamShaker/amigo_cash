import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageLocale } from "../../../../locale";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { offerCoins, parseSteps } from "@/server/queries";
import { db } from "@/lib/db";
import { Coins, Icon } from "@/components/icons";
import { CATEGORY_LABEL } from "@/components/offer-card";
import { startOfferAction } from "@/app/actions/member";
import { Submit } from "@/components/forms";
import { coinsToCents, formatUsd } from "@/lib/money";
import { translateData } from "@/i18n/t";
import { intlTag } from "@/i18n/config";

export const metadata: Metadata = { title: "Offer" };

export default async function OfferPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const { id } = await params;
  const sp = await searchParams;
  const offer = await db.offer.findFirst({ where: { id: id.slice(0, 40), active: true, network: { enabled: true } }, include: { network: { select: { name: true, userShare: true } } } });
  if (!offer) notFound();
  const [user, settings] = await Promise.all([currentUser(), getSettings()]);
  const steps = parseSteps(offer.steps);
  const total = offerCoins(offer, settings);
  const started = user ? await db.offerProgress.findUnique({ where: { userId_offerId: { userId: user.id, offerId: offer.id } } }) : null;
  const names = new Intl.DisplayNames([intlTag(locale)], { type: "region" });
  const allowed = !user || offer.countries.length === 0 || offer.countries.includes(user.country);
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(offer.color) ? offer.color : "#0284C7";

  return (
    <>
      <a className="small" href={`/${locale}/earn`}>
        ← {t("Earn")}
      </a>
      <div className="split">
        <div className="card stack">
          <div className="row">
            <div className="appicon" style={{ background: safeColor }}>
              {offer.title[0]}
            </div>
            <div className="grow">
              <h1 style={{ fontSize: 26 }}>{offer.title}</h1>
              <div className="row wr" style={{ gap: 6, marginTop: 6 }}>
                <span className="pill">{t(CATEGORY_LABEL[offer.category] ?? "Game")}</span>
                <span className="pill">{translateData(locale, offer.platform)}</span>
                <span className="pill">{offer.network.name}</span>
              </div>
            </div>
          </div>
          {offer.description ? <p className="muted">{translateData(locale, offer.description)}</p> : null}
          <div className="ms">
            {steps.map((s, i) => (
              <div className={`ms-item ${i === 0 ? "next" : ""}`} key={i}>
                <span className="ms-dot" />
                <span className="small" style={{ fontWeight: i === 0 ? 800 : 600 }}>
                  {translateData(locale, s.label)}
                </span>
                <Coins n={offerCoins(offer, settings, s.pct)} />
              </div>
            ))}
          </div>
          <div className="row between" style={{ paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <span className="muted">{t("Total reward")}</span>
            <span style={{ fontSize: 22 }}>
              <Coins n={total} />
            </span>
          </div>
        </div>
        <aside className="card stack">
          <div className="small muted">
            {t("Finish within {d} days. Available in {c}. New users only. Rewards of {v}+ are held for {h} days.", {
              d: offer.days,
              c: offer.countries.length ? offer.countries.map((c) => names.of(c) ?? c).join(", ") : t("all countries"),
              v: formatUsd(settings.holdThresholdCents),
              h: settings.holdDays,
            })}
          </div>
          <div className="row between">
            <span className="small muted">≈</span>
            <b className="num">{formatUsd(coinsToCents(total, settings.coinsPerUsd))}</b>
          </div>
          {sp.vpn ? <div className="formmsg bad">{t("Earning is paused on this connection. Turn off your VPN and reload the page.")}</div> : null}
          {!allowed ? <div className="pill bad">{t("Not available in {c}", { c: names.of(user!.country) ?? user!.country })}</div> : null}
          {!user ? (
            <a className="btn primary lg block" href={`/${locale}/signup`}>
              <Icon name="lock" />
              {t("Sign up to start this offer")}
            </a>
          ) : (
            <form action={startOfferAction} className="stack">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="offer" value={offer.id} />
              <Submit className="btn primary lg block" disabled={!allowed}>
                {started ? t("Continue offer") : t("Start offer")}
              </Submit>
              <p className="tiny muted">{t("The advertiser confirms each step automatically. Coins usually arrive within minutes of reaching a goal; some partners take up to 48 hours.")}</p>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
