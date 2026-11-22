import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { daysAgo, startOfTodayUtc } from "@/lib/time";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { coinsToCents } from "@/lib/money";
import { LineChart, Usd, Num, agoAr } from "@/components/admin-ui";

export const metadata: Metadata = { title: "نظرة عامة" };

type Day = { day: string; revenue: number; coins: number; reversed: number };

export default async function Overview() {
  await requireAdminPage();
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
  // Network revenue kept after reversals, minus what members earned from it.
  const net = revenue - reversed - memberCost;
  const liabilityCents = coinsToCents((liability._sum.balance ?? 0) + (liability._sum.pending ?? 0), settings.coinsPerUsd);
  const topCountry = byCountry[0]?.revenue ?? 1;

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">آخر 30 يوم</div>
          <h1>نظرة عامة</h1>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="k">إيراد الشبكات</div>
          <div className="v">
            <Usd cents={revenue} />
          </div>
        </div>
        <div className="kpi">
          <div className="k">صافي الربح (بعد حصة الأعضاء والاستردادات)</div>
          <div className="v" style={{ color: net >= 0 ? "var(--good)" : "var(--bad)" }}>
            <Usd cents={net} />
          </div>
          <div className="d muted">هامش {revenue ? `${((net / revenue) * 100).toFixed(1)}%` : "—"}</div>
        </div>
        <div className="kpi">
          <div className="k">سحوبات بانتظارك</div>
          <div className="v" style={{ color: "var(--warn)" }}>
            <Usd cents={pendingW._sum.amountCents ?? 0} />
          </div>
          <div className="d">
            <a href="/admin/withdrawals">{pendingW._count} طلب ←</a>
          </div>
        </div>
        <div className="kpi">
          <div className="k">أعضاء نشطون (7 أيام)</div>
          <div className="v">
            <Num n={active7} />
          </div>
          <div className="d muted">
            من أصل <Num n={members} /> · تسجيلات اليوم <Num n={signupsToday} />
          </div>
        </div>
      </div>

      <div className="chartbox stack">
        <div className="row between wr">
          <h3 style={{ fontSize: 17 }}>الإيراد مقابل ما يأخذه الأعضاء (يوميا)</h3>
          <div className="legend">
            <span>
              <i style={{ background: "var(--accent)" }} />
              إيراد الشبكات
            </span>
            <span>
              <i style={{ background: "var(--coin)" }} />
              حصة الأعضاء
            </span>
            <span>
              <i style={{ background: "var(--bad)" }} />
              استردادات
            </span>
          </div>
        </div>
        <LineChart days={days} series={[{ color: "var(--accent)", values: rev, fill: true }, { color: "var(--coin)", values: cost }, { color: "var(--bad)", values: rv }]} />
      </div>

      <div className="grid2">
        <div className="card stack">
          <h3 style={{ fontSize: 17 }}>الإيراد حسب الدولة</h3>
          {byCountry.length ? (
            byCountry.map((c) => (
              <div className="hbar" key={c.country}>
                <span className="cc">{c.country}</span>
                <span className="t">
                  <i style={{ width: `${(c.revenue / topCountry) * 100}%` }} />
                </span>
                <span style={{ textAlign: "left" }}>
                  <Usd cents={c.revenue} />
                </span>
              </div>
            ))
          ) : (
            <p className="muted small">ما في بيانات لسا.</p>
          )}
        </div>
        <div className="card stack">
          <h3 style={{ fontSize: 17 }}>أداء الشبكات</h3>
          <div className="tablewrap" style={{ border: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>الشبكة</th>
                  <th>الإيراد</th>
                  <th>نسبة الاسترداد</th>
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
          <div className="k">رصيد مستحق للأعضاء (التزامات)</div>
          <div className="v">
            <Usd cents={liabilityCents} />
          </div>
          <div className="d muted">لازم يكون عندك سيولة تغطيه</div>
        </div>
        <div className="kpi">
          <div className="k">نسبة الاستردادات</div>
          <div className="v" style={{ color: revenue && reversed / revenue > 0.1 ? "var(--bad)" : "var(--good)" }}>
            {revenue ? `${((reversed / revenue) * 100).toFixed(1)}%` : "—"}
          </div>
          <div className="d muted">الهدف: أقل من 10%</div>
        </div>
        <div className="kpi">
          <div className="k">إجمالي ما دفع فعليا</div>
          <div className="v">
            <Usd cents={paid._sum.amountCents ?? 0} />
          </div>
          <div className="d muted">
            <Num n={paid._count} /> عملية سحب
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="row between">
          <h3 style={{ fontSize: 17 }}>آخر التأكيدات</h3>
          <a className="small" href="/admin/postbacks">
            الكل ←
          </a>
        </div>
        {recent.length ? (
          <div className="tablewrap">
            <table>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td className="small">{agoAr(c.createdAt)}</td>
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
          <p className="muted small">لسا ما وصل أي تأكيد من الشبكات.</p>
        )}
      </div>
    </>
  );
}
