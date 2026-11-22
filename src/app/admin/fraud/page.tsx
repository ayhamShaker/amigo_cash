import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { saveFraudRulesAction } from "@/app/actions/admin";
import { Risk } from "@/components/admin-ui";
import { checkIp } from "@/server/fraud";
import { requestIp } from "@/server/request";

export const metadata: Metadata = { title: "مكافحة الاحتيال" };

export default async function FraudPage() {
  await requireAdminPage();
  const s = await getSettings();
  const flagged = await db.user.findMany({
    where: { OR: [{ riskScore: { gte: 50 } }, { flags: { isEmpty: false } }] },
    orderBy: { riskScore: "desc" },
    take: 30,
    select: { id: true, name: true, country: true, riskScore: true, flags: true, status: true },
  });
  const ipqs = !!env().IPQS_API_KEY;
  const myIp = await requestIp();
  const probe = ipqs ? await checkIp(myIp) : null;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>مكافحة الاحتيال</h1>
          <p className="small muted">القواعد بتنطبق تلقائياً على كل تسجيل وكل عرض وكل سحب.</p>
        </div>
      </div>
      {!ipqs ? <div className="formmsg bad">كشف الـ VPN متوقف لأن مفتاح IPQualityScore مو محطوط بإعدادات السيرفر (IPQS_API_KEY).</div> : null}
      <div className="card stack" style={{ gap: 8 }}>
        <h3 style={{ fontSize: 17 }}>فحص كشف الـ VPN (على اتصالك أنت الآن)</h3>
        <div className="row between wr small">
          <span className="muted">الـ IP اللي شايفه الموقع</span>
          <span className="num" dir="ltr">{myIp ?? "غير معروف"}</span>
        </div>
        {!probe ? (
          <span className="pill warn" style={{ alignSelf: "flex-start" }}>المفتاح غير موجود</span>
        ) : probe.checked ? (
          <>
            <div className="row wr">
              <span className="pill good">✓ IPQualityScore شغّال</span>
              <span className={`pill ${probe.vpn ? "bad" : ""}`}>VPN: {probe.vpn ? "نعم" : "لا"}</span>
              <span className={`pill ${probe.proxy ? "bad" : ""}`}>Proxy: {probe.proxy ? "نعم" : "لا"}</span>
              <span className={`pill ${probe.tor ? "bad" : ""}`}>Tor: {probe.tor ? "نعم" : "لا"}</span>
              <span className="pill" dir="ltr">Fraud score: {probe.fraudScore}</span>
              {probe.country ? <span className="cc">{probe.country}</span> : null}
            </div>
            <p className="tiny muted">جرّب تشغّل VPN على موبايلك وافتح هالصفحة: لازم يطلع VPN أو Proxy «نعم».</p>
          </>
        ) : (
          <span className="pill bad" style={{ alignSelf: "flex-start" }} dir="ltr">
            IPQualityScore error: {probe.error}
          </span>
        )}
      </div>
      <div className="grid2">
        <ActionForm action={saveFraudRulesAction} className="card">
          <h3 style={{ fontSize: 17, marginBottom: 6 }}>القواعد</h3>
          <Toggle name="blockVpn" on={s.blockVpn} title="حظر VPN / Proxy" hint="إيقاف الكسب والسحب عند اكتشاف VPN" />
          <Toggle name="firstWithdrawalManual" on={s.firstWithdrawalManual} title="أول سحب يدوي" hint="مراجعة أول سحب لكل عضو" />
          <Toggle name="requireVerifiedEmailToWithdraw" on={s.requireVerifiedEmailToWithdraw} title="تأكيد الإيميل قبل السحب" hint="ينصح فيه" />
          <NumRow name="holdThreshold" title="تعليق المكافآت من ($)" value={(s.holdThresholdCents / 100).toFixed(2)} />
          <NumRow name="holdDays" title="مدة التعليق (أيام)" value={String(s.holdDays)} />
          <NumRow name="autoApproveUnder" title="موافقة تلقائية حتى ($)" hint="للأعضاء الموثوقين بعد أول سحب" value={(s.autoApproveUnderCents / 100).toFixed(2)} />
          <NumRow name="maxAccountsPerDevice" title="أقصى حسابات لكل جهاز" value={String(s.maxAccountsPerDevice)} />
          <NumRow name="autoBanRisk" title="حظر تلقائي عند درجة خطورة" hint="50 – 100" value={String(s.autoBanRisk)} />
          <div style={{ marginTop: 12 }}>
            <Submit>حفظ القواعد</Submit>
          </div>
        </ActionForm>
        <div className="card stack">
          <h3 style={{ fontSize: 17 }}>حسابات تحتاج انتباه ({flagged.length})</h3>
          {flagged.length ? (
            flagged.map((u) => (
              <a key={u.id} className="row between flagrow" href={`/admin/users/${u.id}`}>
                <span>
                  <b>{u.name}</b> <span className="cc">{u.country}</span> {u.status === "BANNED" ? <span className="pill bad">محظور</span> : null}
                  <br />
                  {u.flags.length ? u.flags.map((f) => <span key={f} className="pill bad" style={{ marginInlineEnd: 4 }}>{f}</span>) : <span className="tiny muted">خطورة مرتفعة</span>}
                </span>
                <Risk score={u.riskScore} />
              </a>
            ))
          ) : (
            <p className="muted small">ما في حسابات مشبوهة حالياً.</p>
          )}
        </div>
      </div>
    </>
  );
}

function Toggle({ name, on, title, hint }: { name: string; on: boolean; title: string; hint?: string }) {
  return (
    <label className="setrow">
      <span>
        <b className="small">{title}</b>
        {hint ? <span className="tiny muted" style={{ display: "block" }}>{hint}</span> : null}
      </span>
      <span className="switch">
        <input type="checkbox" name={name} defaultChecked={on} />
        <span />
      </span>
    </label>
  );
}

function NumRow({ name, title, hint, value }: { name: string; title: string; hint?: string; value: string }) {
  return (
    <label className="setrow">
      <span>
        <b className="small">{title}</b>
        {hint ? <span className="tiny muted" style={{ display: "block" }}>{hint}</span> : null}
      </span>
      <input className="input num" name={name} dir="ltr" inputMode="decimal" defaultValue={value} style={{ width: 100 }} />
    </label>
  );
}
