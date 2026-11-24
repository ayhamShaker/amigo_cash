import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt, type AdminLang } from "@/server/admin-lang";
import { env } from "@/lib/env";
import { getSettings } from "@/server/settings";
import { campaignFunnel, countryFunnel, creatorReport, deviceReport, sourceFunnel, type FunnelRow } from "@/server/marketing";
import { ActionForm, CopyButton, Submit } from "@/components/forms";
import { daysAgo } from "@/lib/time";
import { createCreatorAction, updateCreatorAction } from "@/app/actions/marketing";
import { coinsToCents, formatUsd } from "@/lib/money";
import { countryName } from "@/lib/countries";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Marketing" : "التسويق" };
}

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

const SOURCE_EN: Record<string, string> = {
  direct: "Direct",
  referral: "Member referral",
  creator: "Creators",
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
  return b > 0 && a <= b ? `${Math.round((a / b) * 100)}%` : "—";
}

function FunnelTable({ rows, label, coinsPerUsd, lang, showVisits = true, heading }: { rows: FunnelRow[]; label: (k: string) => string; coinsPerUsd: number; lang: AdminLang; showVisits?: boolean; heading?: string }) {
  const at = makeAt(lang);
  if (!rows.length) return <div className="card empty">{at("ما في بيانات لهالفترة بعد.", "No data for this period yet.")}</div>;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>{heading ?? at("المصدر", "Source")}</th>
            {showVisits ? <th className="r">{at("زيارات", "Visits")}</th> : null}
            <th className="r">{at("تسجيلات", "Sign-ups")}</th>
            {showVisits ? <th className="r">{at("نسبة التسجيل", "Conv.")}</th> : null}
            <th className="r">{at("أكدوا الإيميل", "Verified")}</th>
            <th className="r">{at("ربحوا شي", "Earners")}</th>
            <th className="r">{at("أرباح الأعضاء", "Earned")}</th>
            <th className="r">{at("دخلك من الشبكات", "Revenue")}</th>
            <th className="r">{at("سحبوا", "Paid out")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <b dir="auto">{label(r.key)}</b>
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

function CreatorFields({ c, lang }: { c?: { name: string; slug: string; platform: string; bonusCoins: number; notes: string; account: { email: string } | null }; lang: AdminLang }) {
  const at = makeAt(lang);
  return (
    <div className="grid2" style={{ gap: 12 }}>
      <label className="field">
        <span className="flabel">{at("الاسم", "Name")}</span>
        <input className="input" name="name" defaultValue={c?.name} maxLength={40} placeholder="Jake Plays" dir="auto" />
      </label>
      <label className="field">
        <span className="flabel">{at("الرابط الخاص (بالإنجليزي)", "Link slug")}</span>
        <input className="input" name="slug" defaultValue={c?.slug} maxLength={30} placeholder="jake-plays" dir="ltr" />
      </label>
      <label className="field">
        <span className="flabel">{at("المنصة", "Platform")}</span>
        <input className="input" name="platform" defaultValue={c?.platform} maxLength={30} placeholder="TikTok" dir="ltr" />
      </label>
      <label className="field">
        <span className="flabel">{at("مكافأة للي بيسجل من رابطه (عملات)", "Sign-up bonus coins")}</span>
        <input className="input num" name="bonusCoins" defaultValue={c?.bonusCoins ?? 0} inputMode="numeric" dir="ltr" />
      </label>
      <label className="field">
        <span className="flabel">{at("إيميل حساب المؤثر بالموقع (اختياري، ليربح عمولة)", "Creator's member email (optional, for commission)")}</span>
        <input className="input" name="account" defaultValue={c?.account?.email ?? ""} maxLength={254} placeholder="creator@email.com" dir="ltr" />
      </label>
      <label className="field">
        <span className="flabel">{at("ملاحظات (الاتفاق، طريقة الدفع…)", "Notes (deal terms, payout…)")}</span>
        <input className="input" name="notes" defaultValue={c?.notes} maxLength={300} dir="auto" />
      </label>
    </div>
  );
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const RANGES: Record<string, [string, number | null]> = {
    "7": [at("آخر 7 أيام", "Last 7d"), 7],
    "30": [at("آخر 30 يوم", "Last 30d"), 30],
    "90": [at("آخر 90 يوم", "Last 90d"), 90],
    all: [at("من البداية", "All time"), null],
  };
  const sp = await searchParams;
  const range = sp.d && RANGES[sp.d] ? sp.d : "30";
  const days = RANGES[range]![1];
  const since = days ? daysAgo(days) : new Date(0);
  const [settings, sources, countries, devices, campaigns, creators] = await Promise.all([
    getSettings(),
    sourceFunnel(since),
    countryFunnel(since),
    deviceReport(since),
    campaignFunnel(since),
    creatorReport(),
  ]);
  const base = env().APP_URL.replace(/\/$/, "");
  const total = sources.reduce(
    (a, r) => ({ visits: a.visits + r.visits, signups: a.signups + r.signups, earners: a.earners + r.earners, revenue: a.revenue + r.revenueCents, paid: a.paid + r.paidCents }),
    { visits: 0, signups: 0, earners: 0, revenue: 0, paid: 0 },
  );
  const srcMap = lang === "en" ? SOURCE_EN : SOURCE_AR;
  const totalDeviceVisits = devices.reduce((sum, d) => sum + d.visits, 0);
  const topDeviceVisits = devices[0]?.visits || 1;
  const deviceLabel = (d: string) =>
    d === "android" ? "Android" : d === "ios" ? "iOS" : at("كمبيوتر", "Desktop");
  const countryLabel = (code: string) =>
    code === "XX" ? at("غير معروف (XX)", "Unknown (XX)") : `${countryName(code, lang === "en" ? "en" : "ar")} (${code})`;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{at("التسويق", "Marketing")}</h1>
          <p className="small muted">{at("من وين عم يجوا الأعضاء، وشو القناة اللي بتجيب ناس بيربحوا فعلاً.", "See which channels and creators bring members who actually earn.")}</p>
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
          <div className="k">{at("زيارات", "Visits")}</div>
          <div className="v">{total.visits.toLocaleString("en-US")}</div>
        </div>
        <div className="kpi">
          <div className="k">{at("تسجيلات", "Sign-ups")}</div>
          <div className="v">{total.signups.toLocaleString("en-US")}</div>
          <div className="d muted">{pct(total.signups, total.visits)} {at("من الزيارات", "of visits")}</div>
        </div>
        <div className="kpi">
          <div className="k">{at("أعضاء ربحوا شي", "Active earners")}</div>
          <div className="v">{total.earners.toLocaleString("en-US")}</div>
          <div className="d muted">{pct(total.earners, total.signups)} {at("من المسجلين", "of sign-ups")}</div>
        </div>
        <div className="kpi">
          <div className="k">{at("دخلك من الشبكات", "Network revenue")}</div>
          <div className="v">{formatUsd(total.revenue)}</div>
          <div className="d muted">{at("دفعت للأعضاء", "Paid out")} {formatUsd(total.paid)}</div>
        </div>
      </div>

      <section className="stack">
        <h2 style={{ fontSize: 20 }}>{at("حسب المصدر", "By source")}</h2>
        <FunnelTable rows={sources} label={(k) => srcMap[k] ?? k} coinsPerUsd={settings.coinsPerUsd} lang={lang} />
      </section>

      <section className="stack">
        <h2 style={{ fontSize: 20 }}>{at("حسب الدولة (الزوار + الأعضاء)", "By country (visitors & members)")}</h2>
        <FunnelTable
          rows={countries}
          label={countryLabel}
          coinsPerUsd={settings.coinsPerUsd}
          lang={lang}
          heading={at("الدولة", "Country")}
        />
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 18 }}>{at("الزوار حسب الجهاز", "Visitors by device")}</h2>
        {devices.length ? (
          devices.map((d) => (
            <div className="hbar" key={d.device} style={{ gridTemplateColumns: "92px 1fr 115px" }}>
              <span className="cc">{deviceLabel(d.device)}</span>
              <span className="t">
                <i style={{ width: `${(d.visits / topDeviceVisits) * 100}%` }} />
              </span>
              <span className="num" style={{ textAlign: "end" }}>
                {d.visits.toLocaleString("en-US")}{" "}
                <span className="tiny muted">({pct(d.visits, totalDeviceVisits)})</span>
              </span>
            </div>
          ))
        ) : (
          <p className="muted small">{at("ما في بيانات أجهزة لهالفترة بعد.", "No device data for this period yet.")}</p>
        )}
      </section>

      {campaigns.length ? (
        <section className="stack">
          <h2 style={{ fontSize: 20 }}>{at("حسب الحملة (utm_campaign)", "By campaign (utm_campaign)")}</h2>
          <FunnelTable rows={campaigns} label={(k) => k} coinsPerUsd={settings.coinsPerUsd} lang={lang} showVisits={false} heading={at("الحملة", "Campaign")} />
        </section>
      ) : null}

      <section className="stack">
        <h2 style={{ fontSize: 20 }}>{at("المؤثرين", "Creators")}</h2>
        {creators.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{at("المؤثر", "Creator")}</th>
                  <th>{at("الرابط", "Link")}</th>
                  <th className="r">{at("نقرات", "Clicks")}</th>
                  <th className="r">{at("تسجيلات", "Sign-ups")}</th>
                  <th className="r">{at("ربحوا شي", "Earners")}</th>
                  <th className="r">{at("دخلك منهم", "Revenue")}</th>
                  <th className="r">{at("عمولة المؤثر", "Commission")}</th>
                </tr>
              </thead>
              <tbody>
                {creators.map((c) => (
                  <tr key={c.id} style={c.active ? undefined : { opacity: 0.55 }}>
                    <td>
                      <b dir="auto">{c.name}</b>
                      <div className="tiny muted" dir="ltr">
                        {c.platform || "—"} {c.active ? "" : at("· موقوف", "· paused")}
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="cc" dir="ltr">
                          /c/{c.slug}
                        </span>
                        <CopyButton text={`${base}/c/${c.slug}`} label={at("نسخ", "Copy")} done={at("تم النسخ", "Copied")} />
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
                    <td className="r num">{c.account ? formatUsd(coinsToCents(c.commissionCoins, settings.coinsPerUsd)) : <span className="tiny muted">{at("بدون حساب", "No account")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card empty">{at("ما في مؤثرين بعد. ضيف أول واحد من تحت.", "No creators yet. Add one below.")}</div>
        )}

        {creators.map((c) => (
          <details className="card" key={c.id}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              {at("تعديل:", "Edit:")} <span dir="auto">{c.name}</span>
            </summary>
            <ActionForm action={updateCreatorAction} className="stack">
              <input type="hidden" name="id" value={c.id} />
              <div style={{ height: 8 }} />
              <CreatorFields c={c} lang={lang} />
              <label className="setrow" style={{ borderBottom: 0, padding: 0 }}>
                <b className="small">{at("الرابط شغال", "Link active")}</b>
                <span className="switch">
                  <input type="checkbox" name="active" defaultChecked={c.active} />
                  <span />
                </span>
              </label>
              <Submit className="btn primary">{at("حفظ", "Save")}</Submit>
            </ActionForm>
          </details>
        ))}

        <div className="card stack" style={{ borderStyle: "dashed" }}>
          <h3 style={{ fontSize: 18 }}>{at("إضافة مؤثر", "Add creator")}</h3>
          <p className="small muted">
            {at(
              `بيصير إله رابط خاص ${base}/c/…. كل شخص بيفوت منه بينحسب إله لمدة 30 يوم. إذا ربطت حسابه بالموقع، بياخد عمولة ${settings.referralPct}% من أرباحهن تلقائياً.`,
              `Creates a personal ${base}/c/… link with 30-day attribution. Linking their member account automatically pays them ${settings.referralPct}% lifetime referral commission.`,
            )}
          </p>
          <ActionForm action={createCreatorAction} className="stack" resetOnOk>
            <CreatorFields lang={lang} />
            <Submit className="btn primary">{at("إضافة", "Add creator")}</Submit>
          </ActionForm>
        </div>
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 18 }}>{at("كيف تتبع أي إعلان أو منشور", "Tracking posts & campaigns")}</h2>
        <div className="code">{`${base}/?utm_source=tiktok&utm_campaign=video-1\n${base}/?utm_source=reddit&utm_campaign=beermoney-post`}</div>
      </section>
    </>
  );
}
