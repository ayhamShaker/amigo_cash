import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageLocale } from "../../../../locale";
import { currentUser } from "@/server/session";
import { db } from "@/lib/db";
import { LockedPage } from "@/components/member";
import { OfferWallFrame } from "@/components/offer-wall";

export const metadata: Metadata = { title: "Offer wall" };

export default async function WallPage({ params }: { params: Promise<{ locale: string; network: string }> }) {
  const { locale, t } = await pageLocale(params);
  const { network } = await params;
  const n = await db.network.findFirst({ where: { id: network.slice(0, 30), enabled: true, wallUrl: { not: null } } });
  if (!n?.wallUrl) notFound();
  const user = await currentUser();
  return (
    <>
      <div className="pagehead">
        <div>
          <a className="small" href={`/${locale}/earn`}>
            ← {t("Earn")}
          </a>
          <h1>{t("{n} offer wall", { n: n.name })}</h1>
        </div>
      </div>
      {user ? <OfferWallFrame url={fillWallUrl(n.wallUrl, user.id)} title={t("{n} offer wall", { n: n.name })} /> : <LockedPage locale={locale} t={t} />}
    </>
  );
}

function fillWallUrl(template: string, userId: string) {
  const url = template.replaceAll("{user_id}", encodeURIComponent(userId));
  return url.startsWith("https://") ? url : "about:blank";
}
