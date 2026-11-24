import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { weekStartUtc, weeklyLeaderboard, weeklyLeaderboardRange } from "@/server/queries";
import { previousWeekRange, type ContestWinner } from "@/server/contest";
import { ActionForm, Submit } from "@/components/forms";
import { payContestAction } from "@/app/actions/admin";
import { Usd, Num } from "@/components/admin-ui";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Weekly Contest" : "المسابقة الأسبوعية" };
}

export default async function ContestAdminPage() {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
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
          <h1>{at("المسابقة الأسبوعية", "Weekly Contest")}</h1>
          <p className="small muted">
            {at("مجموع الجوائز الحالي:", "Current prize pool:")} <Usd cents={poolCents} />{" "}
            {at("(بتعدّله من إعدادات الموقع). الدفع محمي بحيث ما بيندفع نفس الأسبوع مرتين أبداً.", "(editable in Settings). Protected against duplicate payouts.")}
          </p>
        </div>
      </div>

      <div className="card stack">
        <div className="row between wr">
          <div>
            <h2 style={{ fontSize: 19 }}>{at("الأسبوع الماضي", "Last week")} ({fmtWeek(prev.start)})</h2>
            <p className="small muted">
              {at("إيراد الشبكات بالأسبوع الماضي:", "Last week network revenue:")} <Usd cents={prevRevCents} /> · {at("المستحق للفائزين:", "Due to winners:")} <Usd cents={prevDueCents} />
            </p>
          </div>
          {prevPaid ? (
            <span className="pill good">✓ {at("تم التوزيع", "Paid")} (<Usd cents={prevPaid.totalCents} />)</span>
          ) : prevDueCents > 0 ? (
            <ActionForm action={payContestAction}>
              <Submit className="btn primary">{at("توزيع جوائز الأسبوع الماضي", "Pay last week's winners")}</Submit>
            </ActionForm>
          ) : (
            <span className="pill">{at("لا يوجد فائزون", "No winners")}</span>
          )}
        </div>

        {!prevPaid && prevDueCents > 0 && prevRevCents < prevDueCents * 4 ? (
          <div className="formmsg bad">
            {at("تنبيه ربحية: إيراد الشبكات بالأسبوع الماضي", "Profit warning: last week's revenue")} (<Usd cents={prevRevCents} />){" "}
            {at("قليل مقارنة بمجموع الجوائز", "is low compared to total prizes")} (<Usd cents={prevDueCents} />).{" "}
            {at("عدّل الجوائز من «إعدادات الموقع» قبل التوزيع إذا بدك تحافظ على هامش ربحك.", "Adjust prizes in Settings before paying out to protect your margin.")}
          </div>
        ) : null}

        {prevTop.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{at("المركز", "Rank")}</th>
                  <th>{at("العضو", "Member")}</th>
                  <th className="r">{at("كوينز الأسبوع", "Weekly coins")}</th>
                  <th className="r">{at("الجائزة", "Prize")}</th>
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
          <p className="small muted">{at("ما كان في أرباح مؤهلة بالأسبوع الماضي.", "No qualifying earnings last week.")}</p>
        )}
      </div>

      <div className="card stack">
        <div className="row between wr">
          <h2 style={{ fontSize: 19 }}>{at("الأسبوع الحالي (بدأ", "Current week (started")} {fmtWeek(curStart)})</h2>
          <span className="small muted">
            {at("إيراد الشبكات حتى الآن:", "Network revenue so far:")} <Usd cents={curRevCents} />
          </span>
        </div>
        {curTop.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{at("المركز", "Rank")}</th>
                  <th>{at("العضو", "Member")}</th>
                  <th className="r">{at("كوينز الأسبوع", "Weekly coins")}</th>
                  <th className="r">{at("الجائزة المتوقعة", "Projected prize")}</th>
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
          <p className="small muted">{at("لسا ما في نقاط بهالأسبوع.", "No points yet this week.")}</p>
        )}
      </div>

      {history.length ? (
        <div className="card stack">
          <h2 style={{ fontSize: 19 }}>{at("سجل التوزيعات السابقة", "Payout history")}</h2>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{at("الأسبوع", "Week")}</th>
                  <th>{at("عدد الفائزين", "Winners")}</th>
                  <th className="r">{at("الإجمالي المدفوع", "Total paid")}</th>
                  <th>{at("تاريخ التوزيع", "Paid at")}</th>
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
