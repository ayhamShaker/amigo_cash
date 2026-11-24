import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { saveSettingsAction } from "@/app/actions/admin";
import { env } from "@/lib/env";
import { coinsToCents, formatUsd } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Site Settings" : "إعدادات الموقع" };
}

export default async function SettingsPage() {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const s = await getSettings();
  const e = env();
  const usd = (c: number) => (c / 100).toFixed(2);

  const baseShare = s.userSharePct;
  const maxBoost = s.levelBoostEnabled ? 5 : 0;
  const diamondShare = baseShare * (1 + maxBoost / 100);
  const refOfRevenue = (diamondShare * s.referralPct) / 100;
  const normalMargin = 100 - baseShare;
  const referredMargin = 100 - baseShare * (1 + s.referralPct / 100);
  const worstCaseMargin = 100 - diamondShare - refOfRevenue;

  const freeSignupCents = coinsToCents(s.welcomeBonus + s.inviteBonus, s.coinsPerUsd);
  const minRevFromUserCents = baseShare > 0 ? Math.round((s.minEarnedToWithdrawCents * 100) / baseShare) : 0;
  const profitAtUnlockCents = Math.round((minRevFromUserCents * Math.max(0, referredMargin)) / 100);
  const bonusSafe = s.minEarnedToWithdrawCents > 0 && profitAtUnlockCents >= freeSignupCents;
  const weeklyPoolCents = s.prizesCents.reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{at("إعدادات الموقع", "Site settings")}</h1>
          <p className="small muted">
            {at("أي تغيير هون بينعكس على الموقع فورا. ما في داعي تلمس الكود. قواعد الأمان والسحب موجودة بصفحة «مكافحة الاحتيال».", "Changes take effect immediately. Fraud and payout-safety rules live on the Fraud & Rules page.")}
          </p>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ fontSize: 17 }}>{at("حالة الخدمات", "Connected services")}</h3>
        <div className="row wr">
          <Svc ok={!!e.RESEND_API_KEY} label={at("الإيميلات (Resend)", "Emails (Resend)")} />
          <Svc ok={!!e.IPQS_API_KEY} label={at("كشف VPN (IPQualityScore)", "VPN check (IPQualityScore)")} />
          <Svc ok={!!e.GOOGLE_CLIENT_ID && !!e.GOOGLE_CLIENT_SECRET} label={at("الدخول بـ Google", "Google Sign-in")} />
          <Svc ok={!!e.TELEGRAM_BOT_TOKEN && !!e.TELEGRAM_CHAT_ID} label={at("تنبيهات Telegram", "Telegram alerts")} />
          <Svc ok={!!e.TURNSTILE_SITE_KEY && !!e.TURNSTILE_SECRET_KEY} label={at("حماية Turnstile", "Cloudflare Turnstile")} />
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ fontSize: 17 }}>{at("حاسبة هامش الربح والأمان المالي", "Profit margin & anti-loss calculator")}</h3>
        <div className="kpis">
          <div className="kpi">
            <div className="k">{at("ربحك من عضو عادي", "Standard user margin")}</div>
            <div className="v" style={{ color: normalMargin >= 20 ? "var(--good)" : "var(--warn)" }}>
              {normalMargin.toFixed(1)}%
            </div>
            <div className="d muted">{at("حصة العضو", "User share")} {baseShare}%</div>
          </div>
          <div className="kpi">
            <div className="k">{at("ربحك من عضو مدعو", "Referred user margin")}</div>
            <div className="v" style={{ color: referredMargin >= 15 ? "var(--good)" : "var(--warn)" }}>
              {referredMargin.toFixed(1)}%
            </div>
            <div className="d muted">{at("بعد عمولة الإحالة", "After referral")} {s.referralPct}%</div>
          </div>
          <div className="kpi">
            <div className="k">{at("أسوأ حالة (Diamond + إحالة)", "Worst case (Diamond + referral)")}</div>
            <div className="v" style={{ color: worstCaseMargin >= 12 ? "var(--good)" : "var(--bad)" }}>
              {worstCaseMargin.toFixed(1)}%
            </div>
            <div className="d muted">{s.levelBoostEnabled ? at("مع بونص المستويات (حتى +5%)", "With level boost (up to +5%)") : at("بونص المستويات مطفأ", "Level boost off")}</div>
          </div>
          <div className="kpi">
            <div className="k">{at("حماية البونص المجاني", "Free bonus protection")}</div>
            <div className="v" style={{ color: bonusSafe ? "var(--good)" : "var(--bad)", fontSize: 18 }}>
              {bonusSafe ? at("آمن ✓", "Safe ✓") : at("خطر خسارة !", "Loss risk!")}
            </div>
            <div className="d muted">
              {at(
                `بونص تسجيل+دعوة ${formatUsd(freeSignupCents)} مقابل ربح ${formatUsd(profitAtUnlockCents)} عند فتح السحب`,
                `Signup+invite ${formatUsd(freeSignupCents)} vs ${formatUsd(profitAtUnlockCents)} profit at unlock`,
              )}
            </div>
          </div>
        </div>
        {!bonusSafe ? (
          <div className="formmsg bad">
            {at(
              `انتبه: البونص الترحيبي + الدعوة (${formatUsd(freeSignupCents)}) أكبر من ربحك الصافي عند فتح السحب (${formatUsd(profitAtUnlockCents)}). ارفع «أقل ربح حقيقي لفتح السحب» أو خفّض البونص لحتى ما تخسر من صيّادي البونص.`,
              `Warning: welcome + invite bonuses (${formatUsd(freeSignupCents)}) exceed your net profit at withdrawal unlock (${formatUsd(profitAtUnlockCents)}). Increase "Min real earnings to withdraw" or lower signup bonuses.`,
            )}
          </div>
        ) : null}
        {weeklyPoolCents > 0 ? (
          <p className="tiny muted">
            {at(
              `مجموع جوائز المسابقة الأسبوعية حاليا ${formatUsd(weeklyPoolCents)}/أسبوع — يُفضل ما تتجاوز الجوائز 15%–20% من إيرادك الأسبوعي (تحتاج تقريبا ${formatUsd(weeklyPoolCents * 5)} إيراد أسبوعي).`,
              `Weekly contest pool is ${formatUsd(weeklyPoolCents)}/week — keep prizes under 15%–20% of weekly network revenue (~${formatUsd(weeklyPoolCents * 5)}/week).`,
            )}
          </p>
        ) : null}
      </div>

      <ActionForm action={saveSettingsAction} className="stack">
        <div className="grid2">
          <div className="card">
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>{at("الاقتصاد وحماية الربح", "Economy & profit guardrails")}</h3>
            <NumRow name="coinsPerUsd" title={at("عدد الكوينز مقابل 1 دولار", "Coins per $1.00")} value={s.coinsPerUsd} />
            <NumRow name="userSharePct" title={at("حصة العضو العامة %", "Global member share %")} hint={at("من كل دولار تدفعه الشبكة (المقترح 65–70%)", "Of network payout (recommended 65–70%)")} value={s.userSharePct} />
            <NumRow name="referralPct" title={at("عمولة الإحالة %", "Referral commission %")} hint={at("من أرباح المدعو (المقترح 5–10%)", "Of referred earnings (recommended 5–10%)")} value={s.referralPct} />
            <Toggle name="levelBoostEnabled" on={s.levelBoostEnabled} title={at("بونص المستويات (Silver +1% → Diamond +5%)", "Level boosts (Silver +1% → Diamond +5%)")} hint={at("يُضاف فقط على العروض والاستبيانات الحقيقية", "Applies only to real offers & surveys")} />
            <NumRow name="welcomeBonus" title={at("مكافأة التسجيل (كوينز)", "Welcome bonus (coins)")} hint={at("المقترح 100 كوين ($0.10)", "Recommended 100 coins ($0.10)")} value={s.welcomeBonus} />
            <NumRow name="inviteBonus" title={at("مكافأة إضافية للمدعو (كوينز)", "Invite bonus (coins)")} hint={at("المقترح 100 كوين ($0.10)", "Recommended 100 coins ($0.10)")} value={s.inviteBonus} />
            <DecRow name="minEarnedToWithdraw" title={at("أقل ربح حقيقي لفتح السحب ($)", "Min real earnings to withdraw ($)")} hint={at("من العروض/الاستبيانات فقط — يمنع سحب البونص المجاني بدون شغل", "Real offers/surveys only — blocks bonus-only farmers")} value={usd(s.minEarnedToWithdrawCents)} />
            <NumRow name="dailyMin" title={at("سلسلة الصندوق اليومي: اليوم 1", "Daily streak: Day 1 coins")} value={s.dailyMin} />
            <NumRow name="dailyMax" title={at("سلسلة الصندوق اليومي: اليوم 7", "Daily streak: Day 7 coins")} value={s.dailyMax} />
            <DecRow name="dailyMinEarned" title={at("شرط فتح الصندوق اليومي ($ بآخر 30 يوم)", "Min 30d earnings for daily streak ($)")} hint={at("يمنع الحسابات الخاملة من سحب كوينز يومية مجانا", "Stops inactive accounts from farming daily coins")} value={usd(s.dailyMinEarnedCents)} />
            <label className="setrow">
              <span>
                <b className="small">{at("جوائز المسابقة الأسبوعية ($)", "Weekly contest prizes ($)")}</b>
                <span className="tiny muted" style={{ display: "block" }}>
                  {at("مفصولة بفاصلة، من المركز الأول", "Comma-separated, starting from #1")}
                </span>
              </span>
              <input className="input num" name="prizes" dir="ltr" defaultValue={s.prizesCents.map((c) => usd(c)).join(", ")} style={{ width: 220 }} />
            </label>
          </div>
          <div className="stack">
            <div className="card stack" style={{ gap: 10 }}>
              <h3 style={{ fontSize: 17 }}>{at("طرق السحب", "Cash-out methods")}</h3>
              <p className="small muted">{at("صفحة خاصة لطرق السحب: تعدل الاسم والصورة والحد الأدنى والرسوم، أو تضيف طرق US/UK بضغطة واحدة.", "Manage method icons, minimums, fees, and 1-click US/UK presets on the dedicated page.")}</p>
              <a className="btn primary" href="/admin/methods" style={{ alignSelf: "flex-start" }}>
                {at("فتح طرق السحب", "Open cash-out methods")}
              </a>
            </div>
            <div className="card stack" style={{ gap: 8 }}>
              <h3 style={{ fontSize: 17 }}>{at("المجتمع والثقة (اختياري)", "Community & trust links (optional)")}</h3>
              <p className="tiny muted">{at("بتظهر بالفوتر وببطاقة الأكواد بصفحة الربح. اتركها فاضية لإخفائها.", "Shown in the footer and promo card. Leave blank to hide.")}</p>
              <label className="field">
                <span className="flabel">{at("رابط قناة Telegram", "Telegram channel URL")}</span>
                <input className="input" name="telegramUrl" dir="ltr" defaultValue={s.telegramUrl} placeholder="https://t.me/amigocash" maxLength={200} />
              </label>
              <label className="field">
                <span className="flabel">{at("رابط سيرفر Discord", "Discord server URL")}</span>
                <input className="input" name="discordUrl" dir="ltr" defaultValue={s.discordUrl} placeholder="https://discord.gg/..." maxLength={200} />
              </label>
              <label className="field">
                <span className="flabel">{at("رابط صفحة Trustpilot", "Trustpilot review URL")}</span>
                <input className="input" name="trustpilotUrl" dir="ltr" defaultValue={s.trustpilotUrl} placeholder="https://www.trustpilot.com/review/amigo-cash.com" maxLength={200} />
              </label>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 6 }}>{at("الموقع والإعلانات والدعم", "Site, announcements & support")}</h3>
          <Toggle name="supportOnline" on={s.supportOnline} title={at("الدعم المباشر متصل الآن", "Live support online now")} hint={at("لو مطفأ بيظهر للزائر إن الرد بيوصل بالإيميل بدل «خلال دقيقتين»", 'When off, chat shows "Away · we will reply by email"')} />
          <Toggle name="bannerEnabled" on={s.bannerEnabled} title={at("شريط الإعلان أعلى الموقع", "Top announcement banner")} />
          {(["en", "es", "ar", "hi"] as const).map((l) => (
            <label className="field" style={{ padding: "8px 0" }} key={l}>
              <span className="flabel">
                {at("نص الإعلان", "Banner text")} ({l === "en" ? at("إنجليزي", "English") : l === "es" ? at("إسباني", "Spanish") : l === "hi" ? at("هندي", "Hindi") : at("عربي", "Arabic")})
              </span>
              <input className="input" name={`banner_${l}`} dir={l === "ar" ? "rtl" : "ltr"} defaultValue={s.bannerText[l]} maxLength={200} />
            </label>
          ))}
          <Toggle name="registrationOpen" on={s.registrationOpen} title={at("التسجيل مفتوح", "Registrations open")} />
          <Toggle name="maintenance" on={s.maintenance} title={at("وضع الصيانة", "Maintenance mode")} hint={at("يخفي الموقع عن الأعضاء، لوحة الإدارة تبقى شغالة", "Hides member site; admin panel stays accessible")} />
          <label className="setrow">
            <b className="small">{at("إيميل الدعم", "Support email")}</b>
            <input className="input" name="supportEmail" dir="ltr" defaultValue={s.supportEmail} style={{ width: 240 }} />
          </label>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Submit className="btn primary lg">{at("حفظ كل الإعدادات", "Save all settings")}</Submit>
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
