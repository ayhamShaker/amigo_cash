import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageLocale } from "../../../../locale";
import { currentUser } from "@/server/session";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { checkIp, isBadConnection } from "@/server/fraud";
import { requestIp } from "@/server/request";
import { LockedPage } from "@/components/member";
import { OfferWallFrame } from "@/components/offer-wall";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; network: string }> }): Promise<Metadata> {
  const { t } = await pageLocale(params);
  return { title: t("Offer wall") };
}

export default async function WallPage({ params }: { params: Promise<{ locale: string; network: string }> }) {
  const { locale, t } = await pageLocale(params);
  const { network } = await params;
  const [n, user, settings] = await Promise.all([
    db.network.findFirst({ where: { id: network.slice(0, 30), enabled: true, wallUrl: { not: null } } }),
    currentUser(),
    getSettings(),
  ]);
  if (!n?.wallUrl) notFound();
  const vpnBlocked = user && user.role !== "ADMIN" && settings.blockVpn ? isBadConnection(await checkIp(await requestIp())) : false;
  return (
    <>
      <div className="pagehead">
        <div>
          <a className="small" href={`/${locale}/earn`}>
            <span className="arr">←</span> {t("Earn")}
          </a>
          <h1>{t("{n} offer wall", { n: n.name })}</h1>
        </div>
      </div>
      {!user ? (
        <LockedPage locale={locale} t={t} />
      ) : vpnBlocked ? (
        <div className="card empty">
          <Icon name="shield" />
          <b>{t("VPN or proxy detected.")}</b>
          <span className="small muted">{t("Earning is paused on this connection. Turn off your VPN and reload the page.")}</span>
        </div>
      ) : (
        <OfferWallFrame url={fillWallUrl(n.wallUrl, user.id)} title={t("{n} offer wall", { n: n.name })} />
      )}
    </>
  );
}

function fillWallUrl(template: string, userId: string) {
  const url = template.replaceAll("{user_id}", encodeURIComponent(userId));
  return url.startsWith("https://") ? url : "about:blank";
}
