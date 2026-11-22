import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { saveSettingsAction } from "@/app/actions/admin";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "إعدادات الموقع" };

export default async function SettingsPage() {
  await requireAdminPage();
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
          <div className="card stack" style={{ gap: 10 }}>
            <h3 style={{ fontSize: 17 }}>طرق السحب</h3>
            <p className="small muted">صار في صفحة خاصة لطرق السحب: تعدّل الاسم والصورة والحد الأدنى والرسوم، أو تضيف طريقة جديدة.</p>
            <a className="btn primary" href="/admin/methods" style={{ alignSelf: "flex-start" }}>
              فتح طرق السحب
            </a>
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
