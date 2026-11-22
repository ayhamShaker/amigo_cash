import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { env } from "@/lib/env";
import { getSettings } from "@/server/settings";
import { campaignFunnel, creatorReport, sourceFunnel, type FunnelRow } from "@/server/marketing";
import { ActionForm, CopyButton, Submit } from "@/components/forms";
import { daysAgo } from "@/lib/time";
import { createCreatorAction, updateCreatorAction } from "@/app/actions/marketing";
import { coinsToCents, formatUsd } from "@/lib/money";

export const metadata: Metadata = { title: "التسويق" };

const RANGES: Record<string, [string, number | null]> = { "7": ["آخر 7 أيام", 7], "30": ["آخر 30 يوم", 30], "90": ["آخر 90 يوم", 90], all: ["من البداية", null] };

const SOURCE_AR: Record<string, string> = {
  direct: "مباشر (بدون مصدر)",
  referral: "دعوة من عضو",
  creator: "مؤثرين",
  tiktok: "TikTok",
  youtube: "YouTube",
  reddit: "Reddit",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  discord: "Discord",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  snapchat: "Snapchat",
  google: "Google",
  bing: "Bing",
  trustpilot: "Trustpilot",
};

function pct(a: number, b: number) {
  // members from before visit counting started can make a > b; a share above 100% means nothing
  return b > 0 && a <= b ? `${Math.round((a / b) * 100)}%` : "—";
}

function FunnelTable({ rows, label, coinsPerUsd, showVisits = true }: { rows: FunnelRow[]; label: (k: string) => string; coinsPerUsd: number; showVisits?: boolean }) {
  if (!rows.length) return <div className="card empty">ما في بيانات لهالفترة بعد.</div>;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>المصدر</th>
            {showVisits ? <th className="r">زيارات</th> : null}
            <th className="r">تسجيلات</th>
            {showVisits ? <th className="r">نسبة التسجيل</th> : null}
            <th className="r">أكدوا الإيميل</th>
            <th className="r">ربحوا شي</th>
            <th className="r">أرباح الأعضاء</th>
            <th className="r">دخلك من الشبكات</th>
            <th className="r">سحبوا</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <b dir="ltr">{label(r.key)}</b>
              </td>
              {showVisits ? <td className="r num">{r.visits.toLocaleString("en-US")}</td> : null}
              <td className="r num">{r.signups.toLocaleString("en-US")}</td>
              {showVisits ? <td className="r num">{pct(r.signups, r.visits)}</td> : null}
              <td className="r num">{r.confirmed.toLocaleString("en-US")}</td>
              <td className="r num">
                {r.earners.toLocaleString("en-US")} <span className="tiny muted">({pct(r.earners, r.signups)})</span>
              </td>
              <td className="r num">{formatUsd(coinsToCents(r.earnedCoins, coinsPerUsd))}</td>
              <td className="r num">
                <b>{formatUsd(r.revenueCents)}</b>
              </td>
              <td className="r num">{formatUsd(r.paidCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreatorFields({ c }: { c?: { name: string; slug: string; platform: string; bonusCoins: number; notes: string; account: { email: string } | null } }) {
  return (
    <div className="grid2" style={{ gap: 12 }}>
      <label className="field">
        <span className="flabel">الاسم</span>
        <input className="input" name="name" defaultValue={c?.name} maxLength={40} placeholder="Jake Plays" dir="auto" />
      </label>
      <label className="field">
        <span className="flabel">الرابط الخاص (بالإنجليزي)</span>
        <input className="input" name="slug" defaultValue={c?.slug} maxLength={30} placeholder="jake-plays" dir="ltr" />
      </label>
      <label className="field">
        <span className="flabel">المنصة</span>
        <input className="input" name="platform" defaultValue={c?.platform} maxLength={30} placeholder="TikTok" dir="ltr" />
      </label>
      <label className="field">
        <span className="flabel">مكافأة للي بيسجل من رابطه (عملات)</span>
        <input className="input num" name="bonusCoins" defaultValue={c?.bonusCoins ?? 0} inputMode="numeric" dir="ltr" />
      </label>
      <label className="field">
        <span className="flabel">إيميل حساب المؤثر بالموقع (اختياري، ليربح عمولة)</span>
        <input className="input" name="account" defaultValue={c?.account?.email ?? ""} maxLength={254} placeholder="creator@email.com" dir="ltr" />
      </label>
      <label className="field">
        <span className="flabel">ملاحظات (الاتفاق، طريقة الدفع…)</span>
        <input className="input" name="notes" defaultValue={c?.notes} maxLength={300} dir="auto" />
      </label>
    </div>
  );
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const range = sp.d && RANGES[sp.d] ? sp.d : "30";
  const days = RANGES[range]![1];
  const since = days ? daysAgo(days) : new Date(0);
  const [settings, sources, campaigns, creators] = await Promise.all([getSettings(), sourceFunnel(since), campaignFunnel(since), creatorReport()]);
  const base = env().APP_URL.replace(/\/$/, "");
  const total = sources.reduce(
    (a, r) => ({ visits: a.visits + r.visits, signups: a.signups + r.signups, earners: a.earners + r.earners, revenue: a.revenue + r.revenueCents, paid: a.paid + r.paidCents }),
    { visits: 0, signups: 0, earners: 0, revenue: 0, paid: 0 },
  );

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>التسويق</h1>
          <p className="small muted">من وين عم يجوا الأعضاء، وشو القناة اللي بتجيب ناس بيربحوا فعلاً.</p>
        </div>
        <div className="tabs">
          {Object.entries(RANGES).map(([k, [label]]) => (
            <a key={k} className={`tab ${k === range ? "on" : ""}`} href={`/admin/marketing?d=${k}`}>
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="k">زيارات</div>
          <div className="v">{total.visits.toLocaleString("en-US")}</div>
        </div>
        <div className="kpi">
          <div className="k">تسجيلات</div>
          <div className="v">{total.signups.toLocaleString("en-US")}</div>
          <div className="d muted">{pct(total.signups, total.visits)} من الزيارات</div>
        </div>
        <div className="kpi">
          <div className="k">أعضاء ربحوا شي</div>
          <div className="v">{total.earners.toLocaleString("en-US")}</div>
          <div className="d muted">{pct(total.earners, total.signups)} من المسجلين</div>
        </div>
        <div className="kpi">
          <div className="k">دخلك من الشبكات</div>
          <div className="v">{formatUsd(total.revenue)}</div>
          <div className="d muted">دفعت للأعضاء {formatUsd(total.paid)}</div>
        </div>
      </div>

      <section className="stack">
        <h2 style={{ fontSize: 20 }}>حسب المصدر</h2>
        <FunnelTable rows={sources} label={(k) => SOURCE_AR[k] ?? k} coinsPerUsd={settings.coinsPerUsd} />
        <p className="tiny muted">
          الأرقام للأعضاء اللي سجلوا خلال الفترة. «دخلك من الشبكات» هو اللي دفعته شبكات العروض عن هالأعضاء، و«سحبوا» هو اللي دفعته أنت إلهن. الزيارة بتنحسب مرة وحدة لكل جلسة متصفح.
        </p>
      </section>

      {campaigns.length ? (
        <section className="stack">
          <h2 style={{ fontSize: 20 }}>حسب الحملة (utm_campaign)</h2>
          <FunnelTable rows={campaigns} label={(k) => k} coinsPerUsd={settings.coinsPerUsd} showVisits={false} />
        </section>
      ) : null}

      <section className="stack">
        <h2 style={{ fontSize: 20 }}>المؤثرين</h2>
        {creators.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>المؤثر</th>
                  <th>الرابط</th>
                  <th className="r">نقرات</th>
                  <th className="r">تسجيلات</th>
                  <th className="r">ربحوا شي</th>
                  <th className="r">دخلك منهم</th>
                  <th className="r">عمولة المؤثر</th>
                </tr>
              </thead>
              <tbody>
                {creators.map((c) => (
                  <tr key={c.id} style={c.active ? undefined : { opacity: 0.55 }}>
                    <td>
                      <b dir="auto">{c.name}</b>
                      <div className="tiny muted" dir="ltr">
                        {c.platform || "—"} {c.active ? "" : "· موقوف"}
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="cc" dir="ltr">
                          /c/{c.slug}
                        </span>
                        <CopyButton text={`${base}/c/${c.slug}`} label="نسخ" done="تم النسخ" />
                      </div>
                    </td>
                    <td className="r num">{c.clicks.toLocaleString("en-US")}</td>
                    <td className="r num">
                      {c.signups.toLocaleString("en-US")} <span className="tiny muted">({pct(c.signups, c.clicks)})</span>
                    </td>
                    <td className="r num">{c.earners.toLocaleString("en-US")}</td>
                    <td className="r num">
                      <b>{formatUsd(c.revenueCents)}</b>
                    </td>
                    <td className="r num">{c.account ? formatUsd(coinsToCents(c.commissionCoins, settings.coinsPerUsd)) : <span className="tiny muted">بدون حساب</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card empty">ما في مؤثرين بعد. ضيف أول واحد من تحت.</div>
        )}

        {creators.map((c) => (
          <details className="card" key={c.id}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              تعديل: <span dir="auto">{c.name}</span>
            </summary>
            <ActionForm action={updateCreatorAction} className="stack">
              <input type="hidden" name="id" value={c.id} />
              <div style={{ height: 8 }} />
              <CreatorFields c={c} />
              <label className="setrow" style={{ borderBottom: 0, padding: 0 }}>
                <b className="small">الرابط شغال</b>
                <span className="switch">
                  <input type="checkbox" name="active" defaultChecked={c.active} />
                  <span />
                </span>
              </label>
              <Submit className="btn primary">حفظ</Submit>
            </ActionForm>
          </details>
        ))}

        <div className="card stack" style={{ borderStyle: "dashed" }}>
          <h3 style={{ fontSize: 18 }}>إضافة مؤثر</h3>
          <p className="small muted">
            بيصير إله رابط خاص <span dir="ltr">{base}/c/…</span>. كل شخص بيفوت منه بينحسب إله لمدة 30 يوم. إذا ربطت حسابه بالموقع، الأعضاء الجدد بيصيروا من دعواته وبياخد عمولة {settings.referralPct}% من أرباحهن تلقائياً.
          </p>
          <ActionForm action={createCreatorAction} className="stack" resetOnOk>
            <CreatorFields />
            <Submit className="btn primary">إضافة</Submit>
          </ActionForm>
        </div>
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 18 }}>كيف تتبع أي إعلان أو منشور</h2>
        <p className="small">
          الموقع بيعرف لحاله إذا الشخص إجا من TikTok أو YouTube أو Reddit أو Google… من الرابط اللي ضغط عليه. وإذا بدك تفرق بين منشورين، زيد على الرابط <span dir="ltr">utm_source</span> و<span dir="ltr">utm_campaign</span>:
        </p>
        <div className="code">{`${base}/?utm_source=tiktok&utm_campaign=video-1\n${base}/?utm_source=reddit&utm_campaign=beermoney-post`}</div>
        <p className="tiny muted">التطبيقات متل TikTok وInstagram أحياناً ما بتقول من وين إجا الزائر، فحط utm_source بالرابط اللي بالبايو دايماً.</p>
      </section>
    </>
  );
}
