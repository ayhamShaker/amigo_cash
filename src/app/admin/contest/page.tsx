import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { weekStartUtc, weeklyLeaderboard, weeklyLeaderboardRange } from "@/server/queries";
import { previousWeekRange, type ContestWinner } from "@/server/contest";
import { ActionForm, Submit } from "@/components/forms";
import { payContestAction } from "@/app/actions/admin";
import { Usd, Num } from "@/components/admin-ui";

export const metadata: Metadata = { title: "المسابقة الأسبوعية" };

export default async function ContestAdminPage() {
  await requireAdminPage();
  const settings = await getSettings();
  const prev = previousWeekRange();
  const curStart = weekStartUtc();
  const [prevTop, curTop, prevPaid, history, prevRev, curRev] = await Promise.all([
    weeklyLeaderboardRange(prev.start, prev.end, Math.max(settings.prizesCents.length, 10)),
    weeklyLeaderboard(Math.max(settings.prizesCents.length, 10)),
    db.contestPayout.findUnique({ where: { weekStart: prev.start } }),
    db.contestPayout.findMany({ orderBy: { weekStart: "desc" }, take: 12 }),
    db.conversion.aggregate({ where: { status: "CREDITED", createdAt: { gte: prev.start, lt: prev.end } }, _sum: { payoutCents: true } }),
    db.conversion.aggregate({ where: { status: "CREDITED", createdAt: { gte: curStart } }, _sum: { payoutCents: true } }),
  ]);

  const poolCents = settings.prizesCents.reduce((a, b) => a + b, 0);
  const prevRevCents = prevRev._sum.payoutCents ?? 0;
  const curRevCents = curRev._sum.payoutCents ?? 0;
  const prevDueCents = prevTop.reduce((a, _r, i) => a + (settings.prizesCents[i] ?? 0), 0);
  const fmtWeek = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>المسابقة الأسبوعية</h1>
          <p className="small muted">مجموع الجوائز الحالي: <Usd cents={poolCents} /> (بتعدّله من إعدادات الموقع). الدفع محمي بحيث ما بيندفع نفس الأسبوع مرتين أبداً.</p>
        </div>
      </div>

      <div className="card stack">
        <div className="row between wr">
          <div>
            <h2 style={{ fontSize: 19 }}>الأسبوع الماضي ({fmtWeek(prev.start)})</h2>
            <p className="small muted">
              إيراد الشبكات بالأسبوع الماضي: <Usd cents={prevRevCents} /> · المستحق للفائزين: <Usd cents={prevDueCents} />
            </p>
          </div>
          {prevPaid ? (
            <span className="pill good">✓ تم التوزيع ({<Usd cents={prevPaid.totalCents} />})</span>
          ) : prevDueCents > 0 ? (
            <ActionForm action={payContestAction}>
              <Submit className="btn primary">توزيع جوائز الأسبوع الماضي</Submit>
            </ActionForm>
          ) : (
            <span className="pill">لا يوجد فائزون</span>
          )}
        </div>

        {!prevPaid && prevDueCents > 0 && prevRevCents < prevDueCents * 4 ? (
          <div className="formmsg bad">
            تنبيه ربحية: إيراد الشبكات بالأسبوع الماضي (<Usd cents={prevRevCents} />) قليل مقارنة بمجموع الجوائز (<Usd cents={prevDueCents} />). عدّل الجوائز من «إعدادات الموقع» قبل التوزيع إذا بدك تحافظ على هامش ربحك.
          </div>
        ) : null}

        {prevTop.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>المركز</th>
                  <th>العضو</th>
                  <th className="r">كوينز الأسبوع</th>
                  <th className="r">الجائزة</th>
                </tr>
              </thead>
              <tbody>
                {prevTop.map((r, i) => (
                  <tr key={r.id}>
                    <td className="num">#{i + 1}</td>
                    <td>
                      <a href={`/admin/users/${r.id}`}>
                        <b>{r.name}</b>
                      </a>{" "}
                      <span className="cc">{r.country}</span>
                    </td>
                    <td className="r num">
                      <Num n={r.coins} />
                    </td>
                    <td className="r">
                      <Usd cents={settings.prizesCents[i] ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted">ما كان في أرباح مؤهلة بالأسبوع الماضي.</p>
        )}
      </div>

      <div className="card stack">
        <div className="row between wr">
          <h2 style={{ fontSize: 19 }}>الأسبوع الحالي (بدأ {fmtWeek(curStart)})</h2>
          <span className="small muted">
            إيراد الشبكات حتى الآن: <Usd cents={curRevCents} />
          </span>
        </div>
        {curTop.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>المركز</th>
                  <th>العضو</th>
                  <th className="r">كوينز الأسبوع</th>
                  <th className="r">الجائزة المتوقعة</th>
                </tr>
              </thead>
              <tbody>
                {curTop.map((r, i) => (
                  <tr key={r.id}>
                    <td className="num">#{i + 1}</td>
                    <td>
                      <a href={`/admin/users/${r.id}`}>
                        <b>{r.name}</b>
                      </a>{" "}
                      <span className="cc">{r.country}</span>
                    </td>
                    <td className="r num">
                      <Num n={r.coins} />
                    </td>
                    <td className="r">
                      <Usd cents={settings.prizesCents[i] ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted">لسا ما في نقاط بهالأسبوع.</p>
        )}
      </div>

      {history.length ? (
        <div className="card stack">
          <h2 style={{ fontSize: 19 }}>سجل التوزيعات السابقة</h2>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>الأسبوع</th>
                  <th>عدد الفائزين</th>
                  <th className="r">الإجمالي المدفوع</th>
                  <th>تاريخ التوزيع</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const list = Array.isArray(h.winners) ? (h.winners as ContestWinner[]) : [];
                  return (
                    <tr key={h.weekStart.toISOString()}>
                      <td className="num">{fmtWeek(h.weekStart)}</td>
                      <td className="num">{list.length}</td>
                      <td className="r">
                        <Usd cents={h.totalCents} />
                      </td>
                      <td className="small muted">{h.paidAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
