import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt, type AdminLang } from "@/server/admin-lang";
import { daysAgo } from "@/lib/time";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { saveNetworkAction, sendTestPostbackAction } from "@/app/actions/admin";
import { SIGNATURE_MODES } from "@/server/postback";
import { Usd } from "@/components/admin-ui";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Offer Networks" : "شبكات العروض" };
}

const MODE_HELP_AR: Record<string, string> = {
  HMAC_SHA256: "sig = HMAC-SHA256(السر, subid:txid:payout:status)",
  MD5_CONCAT: "sig = MD5(subid + txid + payout + السر)",
  SECRET_PARAM: "الشبكة ترسل السر كما هو بمتغير secret (مثل CPAlead / AdGem)",
  HMAC_SHA1_URL: "BitLabs: hash = HMAC-SHA1(السر, الرابط كامل بدون hash)",
  TOROX_MD5: "Torox: sig = MD5(oid + '-' + user_id + '-' + السر) — يدعم user_id و oid و payout و sig",
  CPX_MD5: "CPX Research: hash = MD5(trans_id + '-' + السر) — يدعم user_id و trans_id و amount_usd و hash",
  AYET_HMAC: "AyeT-Studios: الهيدر X-Ayetstudios-Security-Hash = HMAC-SHA256(السر, البارامترات مرتبة)",
  LOOTABLY_SHA256: "Lootably: hash = SHA256(userID + ip + revenue + currencyReward + السر)",
};

const MODE_HELP_EN: Record<string, string> = {
  HMAC_SHA256: "sig = HMAC-SHA256(secret, subid:txid:payout:status)",
  MD5_CONCAT: "sig = MD5(subid + txid + payout + secret)",
  SECRET_PARAM: "Network sends shared secret as ?secret=... (e.g. CPAlead / AdGem)",
  HMAC_SHA1_URL: "BitLabs: hash = HMAC-SHA1(secret, full URL without hash param)",
  TOROX_MD5: "Torox: sig = MD5(oid + '-' + user_id + '-' + secret)",
  CPX_MD5: "CPX Research: hash = MD5(trans_id + '-' + secret)",
  AYET_HMAC: "AyeT-Studios: X-Ayetstudios-Security-Hash header = HMAC-SHA256(secret, sorted query)",
  LOOTABLY_SHA256: "Lootably: hash = SHA256(userID + ip + revenue + currencyReward + secret)",
};

export default async function NetworksPage() {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const [networks, settings, revenue] = await Promise.all([
    db.network.findMany({ orderBy: { name: "asc" } }),
    getSettings(),
    db.conversion.groupBy({ by: ["networkId"], where: { status: "CREDITED", createdAt: { gte: daysAgo(30) } }, _sum: { payoutCents: true } }),
  ]);
  const rev = new Map(revenue.map((r) => [r.networkId, r._sum.payoutCents ?? 0]));
  const base = env().APP_URL;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{at("شبكات العروض", "Offer networks")}</h1>
          <p className="small muted">
            {at(
              `كل شبكة بسطر. شغلها أو أوقفها، وحدد حصة العضو (أو اتركها فارغة لتستخدم الحصة العامة ${settings.userSharePct}%). السر بينحفظ مشفر وما بيظهر مرة ثانية.`,
              `Configure each offerwall partner. Leave member share blank to use the global ${settings.userSharePct}%. Secrets are encrypted at rest and never shown again.`,
            )}
          </p>
        </div>
      </div>
      <div className="stack">
        {networks.map((n) => (
          <div key={n.id} className="stack" style={{ gap: 0 }}>
            <NetworkForm n={n} base={base} revenue={rev.get(n.id) ?? 0} defaultShare={settings.userSharePct} lang={lang} />
            {n.secretEnc ? (
              <ActionForm action={sendTestPostbackAction} className="card row wr" resetOnOk>
                <input type="hidden" name="networkId" value={n.id} />
                <b className="small">{at("تجربة الربط:", "Test postback:")}</b>
                <input className="input" name="member" dir="ltr" placeholder={at("إيميل العضو أو رقمه", "Member email or ID")} style={{ flex: 2, minWidth: 180 }} aria-label="Member" />
                <input className="input num" name="payout" dir="ltr" defaultValue="1.00" style={{ width: 80 }} aria-label="USD" />
                <Submit className="btn ghost sm">{at("إرسال تأكيد تجريبي", "Send test")}</Submit>
              </ActionForm>
            ) : null}
          </div>
        ))}
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ {at("إضافة شبكة جديدة", "Add new network")}</summary>
          <div style={{ marginTop: 14 }}>
            <NetworkForm n={null} base={base} revenue={0} defaultShare={settings.userSharePct} lang={lang} />
          </div>
        </details>
      </div>
    </>
  );
}

type N = { id: string; name: string; kind: string; enabled: boolean; userShare: number | null; secretEnc: string | null; signatureMode: string; allowedIps: string[]; wallUrl: string | null };

function NetworkForm({ n, base, revenue, defaultShare, lang }: { n: N | null; base: string; revenue: number; defaultShare: number; lang: AdminLang }) {
  const at = makeAt(lang);
  const help = lang === "en" ? MODE_HELP_EN : MODE_HELP_AR;
  const id = n?.id ?? "";
  return (
    <ActionForm action={saveNetworkAction} className={n ? "card stack" : "stack"}>
      <input type="hidden" name="isNew" value={n ? "0" : "1"} />
      {n ? <input type="hidden" name="id" value={n.id} /> : null}
      <div className="row between wr">
        <div>
          <h3 style={{ fontSize: 20 }} dir="ltr">
            {n?.name ?? at("شبكة جديدة", "New network")}
          </h3>
          {n ? <div className="small muted">{n.kind}</div> : null}
        </div>
        <label className="check">
          <span className="switch">
            <input type="checkbox" name="enabled" defaultChecked={n?.enabled ?? false} aria-label={at("تشغيل", "Enabled")} />
            <span />
          </span>
          {at("مفعلة", "Enabled")}
        </label>
      </div>
      <div className="setgrid">
        {!n ? (
          <label className="field">
            <span className="flabel">{at("المعرف (إنجليزي صغير، مثل torox)", "Slug ID (lowercase, e.g. torox)")}</span>
            <input className="input num" name="id" dir="ltr" maxLength={30} />
          </label>
        ) : null}
        <label className="field">
          <span className="flabel">{at("الاسم", "Name")}</span>
          <input className="input" name="name" dir="ltr" defaultValue={n?.name ?? ""} maxLength={40} />
        </label>
        <label className="field">
          <span className="flabel">{at("النوع (إنجليزي: Games / Surveys / Mixed offers…)", "Type (Games / Surveys / Mixed offers…)")}</span>
          <input className="input" name="kind" dir="ltr" defaultValue={n?.kind ?? "Mixed offers"} maxLength={40} />
        </label>
        <label className="field">
          <span className="flabel">{at("حصة العضو %", "Member share %")}</span>
          <input className="input num" name="userShare" dir="ltr" inputMode="numeric" defaultValue={n?.userShare ?? ""} placeholder={`${defaultShare} (${at("عام", "default")})`} />
        </label>
        <label className="field">
          <span className="flabel">{at("طريقة التحقق من التوقيع", "Signature verification mode")}</span>
          <select className="input" name="signatureMode" defaultValue={n?.signatureMode ?? "HMAC_SHA256"} dir="ltr">
            {SIGNATURE_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">{n?.secretEnc ? at("السر محفوظ ✓ (اكتب سر جديد لتغييره فقط)", "Secret saved ✓ (enter new value only to change)") : at("سر الـ Postback (من لوحة الشبكة)", "Postback secret (from network dashboard)")}</span>
          <input className="input num" name="secret" dir="ltr" type="password" autoComplete="off" maxLength={200} />
        </label>
        <label className="field">
          <span className="flabel">{at("IP الشبكة المسموحة (اختياري، مفصولة بمسافة، تقبل /24)", "Allowed IPs (optional, space-separated, supports CIDR)")}</span>
          <input className="input num" name="allowedIps" dir="ltr" defaultValue={n?.allowedIps.join(" ") ?? ""} />
        </label>
      </div>
      <label className="field">
        <span className="flabel">{at("رابط جدار العروض (iframe) — لازم يحتوي {user_id}", "Offer wall iframe URL — must contain {user_id}")}</span>
        <input className="input num" name="wallUrl" dir="ltr" defaultValue={n?.wallUrl ?? ""} placeholder="https://wall.example.com/?app=123&user={user_id}" maxLength={1000} />
      </label>
      <div className="field">
        <span className="flabel">{at("رابط التأكيد (Postback) — انسخه للوحة الشبكة وبدل الماكروهات بماكروهاتها", "Postback URL — paste into the network dashboard and swap macros")}</span>
        <div className="code">{`${base}/api/postback/${id || "{network}"}?subid={user_id}&txid={transaction_id}&payout={payout_usd}&status={1_or_2}&offer={offer_name}&sig={signature}`}</div>
        <div className="tiny muted" dir="ltr" style={{ textAlign: "start" }}>
          {help[n?.signatureMode ?? "HMAC_SHA256"]}
        </div>
      </div>
      <div className="row between wr">
        {n ? (
          <span className="small muted">
            {at("إيراد 30 يوم:", "30d revenue:")} <Usd cents={revenue} />
          </span>
        ) : (
          <span />
        )}
        <Submit className="btn primary sm">{at("حفظ", "Save")}</Submit>
      </div>
    </ActionForm>
  );
}
