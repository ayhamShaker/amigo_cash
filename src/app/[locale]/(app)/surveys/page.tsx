import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { currentUser } from "@/server/session";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { checkIp, isBadConnection } from "@/server/fraud";
import { requestIp } from "@/server/request";
import { GuestCard } from "@/components/member";
import { OfferWallFrame } from "@/components/offer-wall";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { t } = await pageLocale(params);
  return { title: t("Surveys") };
}

export default async function SurveysPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const sp = await searchParams;
  const [user, settings, walls] = await Promise.all([
    currentUser(),
    getSettings(),
    db.network.findMany({ where: { enabled: true, wallUrl: { not: null }, kind: { contains: "urvey", mode: "insensitive" } }, orderBy: { name: "asc" } }),
  ]);
  const wall = walls.find((w) => w.id === sp.p) ?? walls[0];
  const vpnBlocked = user && settings.blockVpn ? isBadConnection(await checkIp(await requestIp())) : false;
  return (
    <>
      <div className="pagehead">
        <div>
          {wall ? <div className="eyebrow">{t("Powered by {n}", { n: wall.name })}</div> : null}
          <h1>{t("Surveys")}</h1>
        </div>
        <span className="small muted">{t("Answer honestly. Rushed answers get screened out.")}</span>
      </div>
      {walls.length > 1 ? (
        <div className="tabs" role="tablist">
          {walls.map((w) => (
            <a key={w.id} className={`tab ${w.id === wall?.id ? "on" : ""}`} href={`/${locale}/surveys?p=${w.id}`} role="tab" aria-selected={w.id === wall?.id}>
              {w.name}
            </a>
          ))}
        </div>
      ) : null}
      {!user ? <GuestCard locale={locale} t={t} /> : null}
      {wall && user ? (
        vpnBlocked ? (
          <div className="card empty">
            <Icon name="shield" />
            <b>{t("VPN or proxy detected.")}</b>
            <span className="small muted">{t("Earning is paused on this connection. Turn off your VPN and reload the page.")}</span>
          </div>
        ) : (
          <OfferWallFrame url={wall.wallUrl!.replaceAll("{user_id}", encodeURIComponent(user.id))} title={t("Surveys")} />
        )
      ) : wall ? null : (
        <div className="card empty">
          <Icon name="survey" />
          <span>{t("Surveys are coming soon. Meanwhile, try the featured offers.")}</span>
          <a className="btn primary" href={`/${locale}/earn`}>
            {t("Browse offers")}
          </a>
        </div>
      )}
      <div className="card small muted">{t("If a survey screens you out after a few questions, the survey partner may still pay a small consolation reward.")}</div>
    </>
  );
}
