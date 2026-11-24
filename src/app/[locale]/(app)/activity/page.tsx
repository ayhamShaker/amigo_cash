import type { Metadata } from "next";
import { nowMs } from "@/lib/time";
import { pageLocale, requireMember } from "../../locale";
import { db } from "@/lib/db";
import { describe, timeAgo } from "@/i18n/t";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { t } = await pageLocale(params);
  return { title: t("Activity") };
}

const TABS = ["all", "credited", "pending", "reversed"] as const;

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const user = await requireMember(locale, "/activity");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "all";
  const where = {
    userId: user.id,
    kind: { not: "RELEASE" as const },
    ...(tab === "pending" ? { bucket: "PENDING" as const, releasedAt: null, amount: { gt: 0 } } : {}),
    ...(tab === "reversed" ? { kind: "REVERSAL" as const } : {}),
    ...(tab === "credited" ? { amount: { gt: 0 }, OR: [{ bucket: "AVAILABLE" as const }, { bucket: "PENDING" as const, releasedAt: { not: null } }] } : {}),
  };
  const rows = await db.ledgerEntry.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  const refIds = rows.map((r) => r.refId).filter((x): x is string => !!x);
  const reversed = new Set(
    refIds.length
      ? (await db.ledgerEntry.findMany({ where: { userId: user.id, kind: "REVERSAL", refId: { in: refIds } }, select: { refId: true } })).map((r) => r.refId)
      : [],
  );
  const status = (r: (typeof rows)[number]) => {
    if (r.kind === "REVERSAL" || (r.amount > 0 && r.refId && reversed.has(r.refId))) return <span className="pill bad">{t("Reversed")}</span>;
    if (r.kind === "WITHDRAWAL") return <span className="pill info">{t("Withdrawal")}</span>;
    if (r.bucket === "PENDING" && !r.releasedAt) {
      const days = r.releaseAt ? Math.max(1, Math.ceil((r.releaseAt.getTime() - nowMs()) / 86_400_000)) : null;
      return <span className="pill warn">{t("Pending")}{days ? ` · ${days}d` : ""}</span>;
    }
    return <span className="pill good">{t("Credited")}</span>;
  };
  return (
    <>
      <div className="pagehead">
        <h1>{t("Activity")}</h1>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((k) => (
          <a key={k} href={`/${locale}/activity${k === "all" ? "" : `?tab=${k}`}`} className={`tab ${tab === k ? "on" : ""}`} role="tab" aria-selected={tab === k}>
            {t({ all: "All", credited: "Credited", pending: "Pending", reversed: "Reversed" }[k])}
          </a>
        ))}
      </div>
      {rows.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{t("When")}</th>
                <th>{t("Activity")}</th>
                <th>{t("Status")}</th>
                <th className="r">{t("Coins")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small">{timeAgo(locale, r.createdAt)}</td>
                  <td dir="auto">{describe(locale, r.description)}</td>
                  <td>{status(r)}</td>
                  <td className="r">
                    <span className="amt" dir="ltr" style={{ color: r.amount < 0 ? "var(--bad)" : "var(--good)" }}>
                      {r.amount > 0 ? "+" : ""}
                      {r.amount.toLocaleString("en-US")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty">
          <Icon name="list" />
          <span>{t("Nothing here yet.")}</span>
        </div>
      )}
    </>
  );
}
