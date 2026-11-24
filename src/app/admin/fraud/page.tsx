import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { saveFraudRulesAction } from "@/app/actions/admin";
import { Risk } from "@/components/admin-ui";
import { checkIp } from "@/server/fraud";
import { requestIp } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Fraud & Rules" : "مكافحة الاحتيال" };
}

export default async function FraudPage() {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const s = await getSettings();
  const flagged = await db.user.findMany({
    where: { OR: [{ riskScore: { gte: 50 } }, { flags: { isEmpty: false } }] },
    orderBy: { riskScore: "desc" },
    take: 30,
    select: { id: true, name: true, country: true, riskScore: true, flags: true, status: true },
  });
  const ipqs = !!env().IPQS_API_KEY;
  const myIp = await requestIp();
  const probe = ipqs ? await checkIp(myIp, { fresh: true }) : null;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{at("مكافحة الاحتيال", "Fraud & payout rules")}</h1>
          <p className="small muted">{at("القواعد بتنطبق تلقائيا على كل تسجيل وكل عرض وكل سحب.", "Rules apply automatically to every sign-up, offer, and withdrawal.")}</p>
        </div>
      </div>
      {!ipqs ? <div className="formmsg bad">{at("كشف الـ VPN متوقف لأن مفتاح IPQualityScore مو محطوط بإعدادات السيرفر (IPQS_API_KEY).", "VPN detection is off because IPQS_API_KEY is not configured.")}</div> : null}
      <div className="card stack" style={{ gap: 8 }}>
        <h3 style={{ fontSize: 17 }}>{at("فحص كشف الـ VPN (على اتصالك أنت الآن)", "VPN self-test (your current connection)")}</h3>
        <div className="row between wr small">
          <span className="muted">{at("الـ IP اللي شايفه الموقع", "IP seen by server")}</span>
          <span className="num" dir="ltr">{myIp ?? at("غير معروف", "Unknown")}</span>
        </div>
        {!probe ? (
          <span className="pill warn" style={{ alignSelf: "flex-start" }}>{at("المفتاح غير موجود", "Key missing")}</span>
        ) : probe.checked ? (
          <>
            <div className="row wr">
              <span className="pill good">✓ {at("IPQualityScore شغال", "IPQualityScore active")}</span>
              <span className={`pill ${probe.vpn ? "bad" : ""}`}>VPN: {probe.vpn ? at("نعم", "Yes") : at("لا", "No")}</span>
              <span className={`pill ${probe.proxy ? "bad" : ""}`}>Proxy: {probe.proxy ? at("نعم", "Yes") : at("لا", "No")}</span>
              <span className={`pill ${probe.tor ? "bad" : ""}`}>Tor: {probe.tor ? at("نعم", "Yes") : at("لا", "No")}</span>
              <span className="pill" dir="ltr">Fraud score: {probe.fraudScore}</span>
              {probe.country ? <span className="cc">{probe.country}</span> : null}
            </div>
            <div className="tiny muted" dir="ltr" style={{ textAlign: "start" }}>
              {probe.isp ?? "?"} · {probe.connectionType ?? "?"}
            </div>
            {probe.bad ? (
              <span className="pill bad" style={{ alignSelf: "flex-start" }}>{at("هالاتصال ممنوع حسب قواعدك (ما بيقدر يسجل أو يكسب)", "Blocked by your rules (cannot sign up or earn)")}</span>
            ) : (
              <span className="pill good" style={{ alignSelf: "flex-start" }}>{at("هالاتصال مسموح", "Connection allowed")}</span>
            )}
          </>
        ) : (
          <span className="pill bad" style={{ alignSelf: "flex-start" }} dir="ltr">
            IPQualityScore error: {probe.error}
          </span>
        )}
      </div>
      <div className="grid2">
        <ActionForm action={saveFraudRulesAction} className="card">
          <h3 style={{ fontSize: 17, marginBottom: 6 }}>{at("القواعد", "Rules")}</h3>
          <Toggle name="blockVpn" on={s.blockVpn} title={at("حظر VPN / Proxy", "Block VPN / Proxy")} hint={at("إيقاف الكسب والسحب عند اكتشاف VPN", "Pause earning and cash-out on VPN/proxy")} />
          <Toggle name="firstWithdrawalManual" on={s.firstWithdrawalManual} title={at("أول سحب يدوي", "Manual review on first payout")} hint={at("مراجعة أول سحب لكل عضو", "Review every member's first withdrawal")} />
          <Toggle name="requireVerifiedEmailToWithdraw" on={s.requireVerifiedEmailToWithdraw} title={at("تأكيد الإيميل قبل السحب", "Require verified email to withdraw")} hint={at("ينصح فيه", "Recommended")} />
          <NumRow name="holdThreshold" title={at("تعليق المكافآت من ($)", "Hold rewards starting at ($)")} value={(s.holdThresholdCents / 100).toFixed(2)} />
          <NumRow name="holdDays" title={at("مدة التعليق (أيام)", "Hold duration (days)")} value={String(s.holdDays)} />
          <NumRow name="autoApproveUnder" title={at("موافقة تلقائية حتى ($)", "Auto-approve under ($)")} hint={at("للأعضاء الموثوقين بعد أول سحب", "For trusted members after first payout")} value={(s.autoApproveUnderCents / 100).toFixed(2)} />
          <NumRow name="vpnStrictness" title={at("شدة كشف الـ VPN", "VPN strictness")} hint={at("0 – 3 · كل ما كبر الرقم بيكشف أكتر (2 مناسب)", "0 – 3 · higher is stricter (2 recommended)")} value={String(s.vpnStrictness)} />
          <NumRow name="maxFraudScore" title={at("منع عند درجة احتيال الـ IP", "Block at IP fraud score")} hint={at("50 – 100 · من IPQualityScore", "50 – 100 · from IPQualityScore")} value={String(s.maxFraudScore)} />
          <NumRow name="maxAccountsPerDevice" title={at("أقصى حسابات لكل جهاز", "Max accounts per device")} value={String(s.maxAccountsPerDevice)} />
          <NumRow name="autoBanRisk" title={at("حظر تلقائي عند درجة خطورة", "Auto-ban risk threshold")} hint="50 – 100" value={String(s.autoBanRisk)} />
          <div style={{ marginTop: 12 }}>
            <Submit>{at("حفظ القواعد", "Save rules")}</Submit>
          </div>
        </ActionForm>
        <div className="card stack">
          <h3 style={{ fontSize: 17 }}>{at("حسابات تحتاج انتباه", "Flagged accounts")} ({flagged.length})</h3>
          {flagged.length ? (
            flagged.map((u) => (
              <a key={u.id} className="row between flagrow" href={`/admin/users/${u.id}`}>
                <span>
                  <b>{u.name}</b> <span className="cc">{u.country}</span> {u.status === "BANNED" ? <span className="pill bad">{at("محظور", "Banned")}</span> : null}
                  <br />
                  {u.flags.length ? u.flags.map((f) => <span key={f} className="pill bad" style={{ marginInlineEnd: 4 }}>{f}</span>) : <span className="tiny muted">{at("خطورة مرتفعة", "High risk")}</span>}
                </span>
                <Risk score={u.riskScore} />
              </a>
            ))
          ) : (
            <p className="muted small">{at("ما في حسابات مشبوهة حاليا.", "No flagged accounts right now.")}</p>
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
