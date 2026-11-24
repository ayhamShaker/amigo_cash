import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { saveSettingsAction } from "@/app/actions/admin";
import { env } from "@/lib/env";
import { coinsToCents, formatUsd } from "@/lib/money";

export const metadata: Metadata = { title: "إعدادات الموقع" };

export default async function SettingsPage() {
  await requireAdminPage();
  const s = await getSettings();
  const e = env();
  const usd = (c: number) => (c / 100).toFixed(2);

  // Live profit-safety unit economics calculation
  const baseShare = s.userSharePct;
  const maxBoost = s.levelBoostEnabled ? 5 : 0; // Diamond +5%
  const diamondShare = baseShare * (1 + maxBoost / 100);
  const refOfRevenue = (diamondShare * s.referralPct) / 100;
  const normalMargin = 100 - baseShare;
  const referredMargin = 100 - baseShare * (1 + s.referralPct / 100);
  const worstCaseMargin = 100 - diamondShare - refOfRevenue;

  const freeSignupCents = coinsToCents(s.welcomeBonus + s.inviteBonus, s.coinsPerUsd);
  // Gross network revenue required for a user to earn minEarnedToWithdrawCents
  const minRevFromUserCents = baseShare > 0 ? Math.round((s.minEarnedToWithdrawCents * 100) / baseShare) : 0;
  const profitAtUnlockCents = Math.round((minRevFromUserCents * Math.max(0, referredMargin)) / 100);
  const bonusSafe = s.minEarnedToWithdrawCents > 0 && profitAtUnlockCents >= freeSignupCents;
  const weeklyPoolCents = s.prizesCents.reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>إعدادات الموقع</h1>
          <p className="small muted">أي تغيير هون بينعكس على الموقع فورا. ما في داعي تلمس الكود. قواعد الأمان والسحب موجودة بصفحة «مكافحة الاحتيال».</p>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ fontSize: 17 }}>حالة الخدمات</h3>
        <div className="row wr">
          <Svc ok={!!e.RESEND_API_KEY} label="الإيميلات (Resend)" />
          <Svc ok={!!e.IPQS_API_KEY} label="كشف VPN (IPQualityScore)" />
          <Svc ok={!!e.GOOGLE_CLIENT_ID && !!e.GOOGLE_CLIENT_SECRET} label="الدخول بـ Google" />
          <Svc ok={!!e.TELEGRAM_BOT_TOKEN && !!e.TELEGRAM_CHAT_ID} label="تنبيهات Telegram" />
          <Svc ok={!!e.TURNSTILE_SITE_KEY && !!e.TURNSTILE_SECRET_KEY} label="حماية Turnstile" />
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ fontSize: 17 }}>حاسبة هامش الربح والأمان المالي</h3>
        <div className="kpis">
          <div className="kpi">
            <div className="k">ربحك من عضو عادي</div>
            <div className="v" style={{ color: normalMargin >= 20 ? "var(--good)" : "var(--warn)" }}>
              {normalMargin.toFixed(1)}%
            </div>
            <div className="d muted">حصة العضو {baseShare}%</div>
          </div>
          <div className="kpi">
            <div className="k">ربحك من عضو مدعو</div>
            <div className="v" style={{ color: referredMargin >= 15 ? "var(--good)" : "var(--warn)" }}>
              {referredMargin.toFixed(1)}%
            </div>
            <div className="d muted">بعد عمولة الإحالة {s.referralPct}%</div>
          </div>
          <div className="kpi">
            <div className="k">أسوأ حالة (Diamond + إحالة)</div>
            <div className="v" style={{ color: worstCaseMargin >= 12 ? "var(--good)" : "var(--bad)" }}>
              {worstCaseMargin.toFixed(1)}%
            </div>
            <div className="d muted">{s.levelBoostEnabled ? "مع بونص المستويات (حتى +5%)" : "بونص المستويات مطفأ"}</div>
          </div>
          <div className="kpi">
            <div className="k">حماية البونص المجاني</div>
            <div className="v" style={{ color: bonusSafe ? "var(--good)" : "var(--bad)", fontSize: 18 }}>
              {bonusSafe ? "آمن ✓" : "خطر خسارة !"}
            </div>
            <div className="d muted">
              بونص تسجيل+دعوة {formatUsd(freeSignupCents)} مقابل ربح {formatUsd(profitAtUnlockCents)} عند فتح السحب
            </div>
          </div>
        </div>
        {!bonusSafe ? (
          <div className="formmsg bad">
            انتبه: البونص الترحيبي + الدعوة ({formatUsd(freeSignupCents)}) أكبر من ربحك الصافي عند فتح السحب ({formatUsd(profitAtUnlockCents)}). ارفع «أقل ربح حقيقي لفتح السحب» أو خفّض البونص لحتى ما تخسر من صيّادي البونص.
          </div>
        ) : null}
        {weeklyPoolCents > 0 ? (
          <p className="tiny muted">
            مجموع جوائز المسابقة الأسبوعية حاليا {formatUsd(weeklyPoolCents)}/أسبوع — لتحافظ على ربحيتك، يُفضل ما تتجاوز الجوائز 15%–20% من إيرادك الأسبوعي (يعني تحتاج تقريبا {formatUsd(weeklyPoolCents * 5)} إيراد أسبوعي من الشبكات).
          </p>
        ) : null}
      </div>

      <ActionForm action={saveSettingsAction} className="stack">
        <div className="grid2">
          <div className="card">
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>الاقتصاد وحماية الربح</h3>
            <NumRow name="coinsPerUsd" title="عدد الكوينز مقابل 1 دولار" value={s.coinsPerUsd} />
            <NumRow name="userSharePct" title="حصة العضو العامة %" hint="من كل دولار تدفعه الشبكة (المقترح 65–70%)" value={s.userSharePct} />
            <NumRow name="referralPct" title="عمولة الإحالة %" hint="من أرباح المدعو (المقترح 5–10%)" value={s.referralPct} />
            <Toggle name="levelBoostEnabled" on={s.levelBoostEnabled} title="بونص المستويات (Silver +1% → Diamond +5%)" hint="يُضاف فقط على العروض والاستبيانات الحقيقية" />
            <NumRow name="welcomeBonus" title="مكافأة التسجيل (كوينز)" hint="المقترح 100 كوين ($0.10)" value={s.welcomeBonus} />
            <NumRow name="inviteBonus" title="مكافأة إضافية للمدعو (كوينز)" hint="المقترح 100 كوين ($0.10)" value={s.inviteBonus} />
            <DecRow name="minEarnedToWithdraw" title="أقل ربح حقيقي لفتح السحب ($)" hint="من العروض/الاستبيانات فقط — يمنع سحب البونص المجاني بدون شغل (المقترح $2.00)" value={usd(s.minEarnedToWithdrawCents)} />
            <NumRow name="dailyMin" title="سلسلة الصندوق اليومي: اليوم 1" value={s.dailyMin} />
            <NumRow name="dailyMax" title="سلسلة الصندوق اليومي: اليوم 7" value={s.dailyMax} />
            <DecRow name="dailyMinEarned" title="شرط فتح الصندوق اليومي ($ بآخر 30 يوم)" hint="يمنع الحسابات الخاملة من سحب كوينز يومية مجانا (المقترح $0.50)" value={usd(s.dailyMinEarnedCents)} />
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
          <div className="stack">
            <div className="card stack" style={{ gap: 10 }}>
              <h3 style={{ fontSize: 17 }}>طرق السحب</h3>
              <p className="small muted">صفحة خاصة لطرق السحب: تعدل الاسم والصورة والحد الأدنى والرسوم، أو تضيف طرق US/UK بضغطة واحدة.</p>
              <a className="btn primary" href="/admin/methods" style={{ alignSelf: "flex-start" }}>
                فتح طرق السحب
              </a>
            </div>
            <div className="card stack" style={{ gap: 8 }}>
              <h3 style={{ fontSize: 17 }}>المجتمع والثقة (اختياري)</h3>
              <p className="tiny muted">بتظهر بالفوتر وببطاقة الأكواد بصفحة الربح. اتركها فاضية لإخفائها.</p>
              <label className="field">
                <span className="flabel">رابط قناة Telegram</span>
                <input className="input" name="telegramUrl" dir="ltr" defaultValue={s.telegramUrl} placeholder="https://t.me/amigocash" maxLength={200} />
              </label>
              <label className="field">
                <span className="flabel">رابط سيرفر Discord</span>
                <input className="input" name="discordUrl" dir="ltr" defaultValue={s.discordUrl} placeholder="https://discord.gg/..." maxLength={200} />
              </label>
              <label className="field">
                <span className="flabel">رابط صفحة Trustpilot</span>
                <input className="input" name="trustpilotUrl" dir="ltr" defaultValue={s.trustpilotUrl} placeholder="https://www.trustpilot.com/review/amigo.cash" maxLength={200} />
              </label>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 6 }}>الموقع والإعلانات والدعم</h3>
          <Toggle name="supportOnline" on={s.supportOnline} title="الدعم المباشر متصل الآن" hint="لو مطفأ بيظهر للزائر إن الرد بيوصل بالإيميل بدل «خلال دقيقتين»" />
          <Toggle name="bannerEnabled" on={s.bannerEnabled} title="شريط الإعلان أعلى الموقع" />
          {(["en", "es", "ar", "hi"] as const).map((l) => (
            <label className="field" style={{ padding: "8px 0" }} key={l}>
              <span className="flabel">نص الإعلان ({l === "en" ? "إنجليزي" : l === "es" ? "إسباني" : l === "hi" ? "هندي" : "عربي"})</span>
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

function DecRow({ name, title, hint, value }: { name: string; title: string; hint?: string; value: string }) {
  return (
    <label className="setrow">
      <span>
        <b className="small">{title}</b>
        {hint ? <span className="tiny muted" style={{ display: "block" }}>{hint}</span> : null}
      </span>
      <input className="input num" name={name} dir="ltr" inputMode="decimal" defaultValue={value} style={{ width: 110 }} />
    </label>
  );
}
