import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { saveSettingsAction } from "@/app/actions/admin";
import { METHOD_KEYS, METHOD_META } from "@/lib/methods";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "إعدادات الموقع" };

export default async function SettingsPage() {
  const s = await getSettings();
  const e = env();
  const usd = (c: number) => (c / 100).toFixed(2);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>إعدادات الموقع</h1>
          <p className="small muted">أي تغيير هون بينعكس على الموقع فوراً. ما في داعي تلمس الكود. قواعد الأمان والسحب موجودة بصفحة «مكافحة الاحتيال».</p>
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ fontSize: 17 }}>حالة الخدمات</h3>
        <div className="row wr">
          <Svc ok={!!e.RESEND_API_KEY} label="الإيميلات (Resend)" />
          <Svc ok={!!e.IPQS_API_KEY} label="كشف VPN (IPQualityScore)" />
          <Svc ok={!!e.GOOGLE_CLIENT_ID && !!e.GOOGLE_CLIENT_SECRET} label="الدخول بـ Google" />
        </div>
      </div>
      <ActionForm action={saveSettingsAction} className="stack">
        <div className="grid2">
          <div className="card">
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>الاقتصاد</h3>
            <NumRow name="coinsPerUsd" title="عدد الكوينز مقابل 1 دولار" value={s.coinsPerUsd} />
            <NumRow name="userSharePct" title="حصة العضو العامة %" hint="من كل دولار تدفعه الشبكة" value={s.userSharePct} />
            <NumRow name="referralPct" title="عمولة الإحالة %" value={s.referralPct} />
            <NumRow name="welcomeBonus" title="مكافأة التسجيل (كوينز)" value={s.welcomeBonus} />
            <NumRow name="inviteBonus" title="مكافأة إضافية للمدعو (كوينز)" value={s.inviteBonus} />
            <NumRow name="dailyMin" title="الصندوق اليومي: أدنى" value={s.dailyMin} />
            <NumRow name="dailyMax" title="الصندوق اليومي: أعلى" value={s.dailyMax} />
            <label className="setrow">
              <span>
                <b className="small">جوائز المسابقة الأسبوعية ($)</b>
                <span className="tiny muted" style={{ display: "block" }}>
                  مفصولة بفاصلة، من المركز الأول
                </span>
              </span>
              <input className="input num" name="prizes" dir="ltr" defaultValue={s.prizesCents.map((c) => usd(c)).join(", ")} style={{ width: 220 }} />
            </label>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>طرق السحب</h3>
            {METHOD_KEYS.map((m) => (
              <div className="setrow" key={m}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="mlogo" style={{ width: 34, height: 34, fontSize: 9, background: METHOD_META[m].color }}>
                    {METHOD_META[m].short}
                  </span>
                  <b className="small" dir="ltr">
                    {METHOD_META[m].name}
                  </b>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="tiny muted">أدنى $</span>
                  <input className="input num" name={`min_${m}`} dir="ltr" inputMode="decimal" defaultValue={usd(s.methods[m].minCents)} style={{ width: 72 }} aria-label={`الحد الأدنى ${METHOD_META[m].name}`} />
                  <span className="tiny muted">رسوم $</span>
                  <input className="input num" name={`fee_${m}`} dir="ltr" inputMode="decimal" defaultValue={usd(s.methods[m].feeCents)} style={{ width: 64 }} aria-label={`رسوم ${METHOD_META[m].name}`} />
                  <span className="switch">
                    <input type="checkbox" name={`on_${m}`} defaultChecked={s.methods[m].enabled} aria-label={`تفعيل ${METHOD_META[m].name}`} />
                    <span />
                  </span>
                </div>
              </div>
            ))}
            <p className="tiny muted" style={{ marginTop: 8 }}>
              PayPal مطفأ لحين وجود شريك أو شركة بدولة مدعومة.
            </p>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 6 }}>الموقع والإعلانات</h3>
          <Toggle name="bannerEnabled" on={s.bannerEnabled} title="شريط الإعلان أعلى الموقع" />
          {(["en", "es", "ar"] as const).map((l) => (
            <label className="field" style={{ padding: "8px 0" }} key={l}>
              <span className="flabel">نص الإعلان ({l === "en" ? "إنجليزي" : l === "es" ? "إسباني" : "عربي"})</span>
              <input className="input" name={`banner_${l}`} dir={l === "ar" ? "rtl" : "ltr"} defaultValue={s.bannerText[l]} maxLength={200} />
            </label>
          ))}
          <Toggle name="registrationOpen" on={s.registrationOpen} title="التسجيل مفتوح" />
          <Toggle name="maintenance" on={s.maintenance} title="وضع الصيانة" hint="يخفي الموقع عن الأعضاء، لوحة الإدارة تبقى شغالة" />
          <label className="setrow">
            <b className="small">إيميل الدعم</b>
            <input className="input" name="supportEmail" dir="ltr" defaultValue={s.supportEmail} style={{ width: 240 }} />
          </label>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Submit className="btn primary lg">حفظ كل الإعدادات</Submit>
        </div>
      </ActionForm>
    </>
  );
}

function Svc({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`pill ${ok ? "good" : "warn"}`}>{ok ? "✓" : "✗"} {label}</span>;
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

function NumRow({ name, title, hint, value }: { name: string; title: string; hint?: string; value: number }) {
  return (
    <label className="setrow">
      <span>
        <b className="small">{title}</b>
        {hint ? <span className="tiny muted" style={{ display: "block" }}>{hint}</span> : null}
      </span>
      <input className="input num" name={name} type="number" dir="ltr" defaultValue={value} style={{ width: 110 }} />
    </label>
  );
}
