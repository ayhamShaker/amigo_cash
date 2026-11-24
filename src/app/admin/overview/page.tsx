import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { daysAgo, startOfTodayUtc } from "@/lib/time";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { coinsToCents } from "@/lib/money";
import { LineChart, Usd, Num, agoAr } from "@/components/admin-ui";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Overview" : "نظرة عامة" };
}

type Day = { day: string; revenue: number; coins: number; reversed: number };

export default async function Overview() {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const settings = await getSettings();
  const since = startOfTodayUtc();
  since.setUTCDate(since.getUTCDate() - 29);
  const [daily, pendingW, liability, members, active7, signupsToday, paid, byCountry, byNetwork, recent] = await Promise.all([
    db.$queryRaw<Day[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
        COALESCE(SUM("payoutCents") FILTER (WHERE status IN ('CREDITED','REVERSED')), 0)::int AS revenue,
        COALESCE(SUM(coins) FILTER (WHERE status = 'CREDITED'), 0)::int AS coins,
        COALESCE(SUM("payoutCents") FILTER (WHERE status = 'REVERSED'), 0)::int AS reversed
      FROM "Conversion" WHERE "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    db.withdrawal.aggregate({ where: { status: { in: ["PENDING", "APPROVED"] } }, _sum: { amountCents: true }, _count: true }),
    db.user.aggregate({ _sum: { balance: true, pending: true } }),
    db.user.count(),
    db.user.count({ where: { lastSeenAt: { gte: daysAgo(7) } } }),
    db.user.count({ where: { createdAt: { gte: startOfTodayUtc() } } }),
    db.withdrawal.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true }, _count: true }),
    db.$queryRaw<{ country: string; revenue: number }[]>`
      SELECT u.country, SUM(c."payoutCents")::int AS revenue FROM "Conversion" c JOIN "User" u ON u.id = c."userId"
      WHERE c.status = 'CREDITED' AND c."createdAt" >= ${since} GROUP BY u.country ORDER BY revenue DESC LIMIT 6`,
    db.$queryRaw<{ name: string; revenue: number; reversed: number; total: number }[]>`
      SELECT n.name, COALESCE(SUM(c."payoutCents") FILTER (WHERE c.status IN ('CREDITED','REVERSED')), 0)::int AS revenue,
        COUNT(*) FILTER (WHERE c.status = 'REVERSED')::int AS reversed, COUNT(c.id)::int AS total
      FROM "Network" n LEFT JOIN "Conversion" c ON c."networkId" = n.id AND c."createdAt" >= ${since}
      GROUP BY n.name ORDER BY revenue DESC`,
    db.conversion.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { user: { select: { name: true } }, network: { select: { name: true } } } }),
  ]);

  const map = new Map(daily.map((d) => [d.day, d]));
  const days: string[] = [];
  const rev: number[] = [];
  const cost: number[] = [];
  const rv: number[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    days.push(d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
    rev.push(row?.revenue ?? 0);
    cost.push(coinsToCents(row?.coins ?? 0, settings.coinsPerUsd));
    rv.push(row?.reversed ?? 0);
  }
  const revenue = rev.reduce((a, b) => a + b, 0);
  const memberCost = cost.reduce((a, b) => a + b, 0);
  const reversed = rv.reduce((a, b) => a + b, 0);
  const net = revenue - reversed - memberCost;
  const liabilityCents = coinsToCents((liability._sum.balance ?? 0) + (liability._sum.pending ?? 0), settings.coinsPerUsd);
  const topCountry = byCountry[0]?.revenue ?? 1;

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">{at("آخر 30 يوم", "Last 30 days")}</div>
          <h1>{at("نظرة عامة", "Overview")}</h1>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="k">{at("إيراد الشبكات", "Network revenue")}</div>
          <div className="v">
            <Usd cents={revenue} />
          </div>
        </div>
        <div className="kpi">
          <div className="k">{at("صافي الربح (بعد حصة الأعضاء والاستردادات)", "Net profit (after member share & reversals)")}</div>
          <div className="v" style={{ color: net >= 0 ? "var(--good)" : "var(--bad)" }}>
            <Usd cents={net} />
          </div>
          <div className="d muted">{at("هامش", "Margin")} {revenue ? `${((net / revenue) * 100).toFixed(1)}%` : "—"}</div>
        </div>
        <div className="kpi">
          <div className="k">{at("سحوبات بانتظارك", "Pending withdrawals")}</div>
          <div className="v" style={{ color: "var(--warn)" }}>
            <Usd cents={pendingW._sum.amountCents ?? 0} />
          </div>
          <div className="d">
            <a href="/admin/withdrawals">
              {pendingW._count} {at("طلب ←", "requests →")}
            </a>
          </div>
        </div>
        <div className="kpi">
          <div className="k">{at("أعضاء نشطون (7 أيام)", "Active members (7d)")}</div>
          <div className="v">
            <Num n={active7} />
          </div>
          <div className="d muted">
            {at("من أصل", "of")} <Num n={members} /> · {at("تسجيلات اليوم", "today")} <Num n={signupsToday} />
          </div>
        </div>
      </div>

      <div className="chartbox stack">
        <div className="row between wr">
          <h3 style={{ fontSize: 17 }}>{at("الإيراد مقابل ما يأخذه الأعضاء (يوميا)", "Daily revenue vs member payout")}</h3>
          <div className="legend">
            <span>
              <i style={{ background: "var(--accent)" }} />
              {at("إيراد الشبكات", "Network revenue")}
            </span>
            <span>
              <i style={{ background: "var(--coin)" }} />
              {at("حصة الأعضاء", "Member share")}
            </span>
            <span>
              <i style={{ background: "var(--bad)" }} />
              {at("استردادات", "Reversals")}
            </span>
          </div>
        </div>
        <LineChart days={days} series={[{ color: "var(--accent)", values: rev, fill: true }, { color: "var(--coin)", values: cost }, { color: "var(--bad)", values: rv }]} />
      </div>

      <div className="grid2">
        <div className="card stack">
          <h3 style={{ fontSize: 17 }}>{at("الإيراد حسب الدولة", "Revenue by country")}</h3>
          {byCountry.length ? (
            byCountry.map((c) => (
              <div className="hbar" key={c.country}>
                <span className="cc">{c.country}</span>
                <span className="t">
                  <i style={{ width: `${(c.revenue / topCountry) * 100}%` }} />
                </span>
                <span style={{ textAlign: "end" }}>
                  <Usd cents={c.revenue} />
                </span>
              </div>
            ))
          ) : (
            <p className="muted small">{at("ما في بيانات لسا.", "No data yet.")}</p>
          )}
        </div>
        <div className="card stack">
          <h3 style={{ fontSize: 17 }}>{at("أداء الشبكات", "Network performance")}</h3>
          <div className="tablewrap" style={{ border: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>{at("الشبكة", "Network")}</th>
                  <th>{at("الإيراد", "Revenue")}</th>
                  <th>{at("نسبة الاسترداد", "Reversal rate")}</th>
                </tr>
              </thead>
              <tbody>
                {byNetwork.map((n) => {
                  const pct = n.total ? (n.reversed / n.total) * 100 : 0;
                  return (
                    <tr key={n.name}>
                      <td>
                        <b dir="ltr">{n.name}</b>
                      </td>
                      <td>
                        <Usd cents={n.revenue} />
                      </td>
                      <td>
                        <span className={`pill ${pct > 10 ? "bad" : pct > 5 ? "warn" : "good"}`} dir="ltr">
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid3">
        <div className="kpi">
          <div className="k">{at("رصيد مستحق للأعضاء (التزامات)", "Member balances owed (liability)")}</div>
          <div className="v">
            <Usd cents={liabilityCents} />
          </div>
          <div className="d muted">{at("لازم يكون عندك سيولة تغطيه", "Keep enough liquidity to cover this")}</div>
        </div>
        <div className="kpi">
          <div className="k">{at("نسبة الاستردادات", "Chargeback rate")}</div>
          <div className="v" style={{ color: revenue && reversed / revenue > 0.1 ? "var(--bad)" : "var(--good)" }}>
            {revenue ? `${((reversed / revenue) * 100).toFixed(1)}%` : "—"}
          </div>
          <div className="d muted">{at("الهدف: أقل من 10%", "Target: under 10%")}</div>
        </div>
        <div className="kpi">
          <div className="k">{at("إجمالي ما دفع فعليا", "Total paid out")}</div>
          <div className="v">
            <Usd cents={paid._sum.amountCents ?? 0} />
          </div>
          <div className="d muted">
            <Num n={paid._count} /> {at("عملية سحب", "withdrawals")}
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="row between">
          <h3 style={{ fontSize: 17 }}>{at("آخر التأكيدات", "Latest postbacks")}</h3>
          <a className="small" href="/admin/postbacks">
            {at("الكل ←", "View all →")}
          </a>
        </div>
        {recent.length ? (
          <div className="tablewrap">
            <table>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td className="small">{agoAr(c.createdAt, undefined, lang)}</td>
                    <td dir="ltr">{c.network.name}</td>
                    <td>{c.user?.name ?? "—"}</td>
                    <td dir="ltr" className="small">
                      {c.offerName}
                    </td>
                    <td>
                      <Usd cents={c.payoutCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">{at("لسا ما وصل أي تأكيد من الشبكات.", "No postbacks received yet.")}</p>
        )}
      </div>
    </>
  );
}
