import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { currentUser } from "@/server/session";
import { db } from "@/lib/db";
import { GuestCard } from "@/components/member";
import { OfferWallFrame } from "@/components/offer-wall";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Surveys" };

export default async function SurveysPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const user = await currentUser();
  const walls = await db.network.findMany({ where: { enabled: true, wallUrl: { not: null }, kind: { contains: "urvey", mode: "insensitive" } }, orderBy: { name: "asc" } });
  const wall = walls[0];
  return (
    <>
      <div className="pagehead">
        <div>
          {wall ? <div className="eyebrow">{t("Powered by {n}", { n: wall.name })}</div> : null}
          <h1>{t("Surveys")}</h1>
        </div>
        <span className="small muted">{t("Answer honestly. Rushed answers get screened out.")}</span>
      </div>
      {!user ? <GuestCard locale={locale} t={t} /> : null}
      {wall && user ? (
        <OfferWallFrame url={wall.wallUrl!.replaceAll("{user_id}", encodeURIComponent(user.id))} title={t("Surveys")} />
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
