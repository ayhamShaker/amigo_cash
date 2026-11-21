import type { Metadata } from "next";
import { daysAgo } from "@/lib/time";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { saveNetworkAction } from "@/app/actions/admin";
import { SIGNATURE_MODES } from "@/server/postback";
import { Usd } from "@/components/admin-ui";

export const metadata: Metadata = { title: "شبكات العروض" };

const MODE_HELP: Record<string, string> = {
  HMAC_SHA256: "sig = HMAC-SHA256(السر, subid:txid:payout:status)",
  MD5_CONCAT: "sig = MD5(subid + txid + payout + السر)",
  SECRET_PARAM: "الشبكة ترسل السر كما هو بمتغير secret",
  HMAC_SHA1_URL: "hash = HMAC-SHA1(السر, الرابط كامل بدون &hash=) — مثل BitLabs",
};

export default async function NetworksPage() {
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
          <h1>شبكات العروض</h1>
          <p className="small muted">كل شبكة بسطر. شغّلها أو أوقفها، وحدد حصة العضو (أو اتركها فارغة لتستخدم الحصة العامة {settings.userSharePct}%). السر بينحفظ مشفّر وما بيظهر مرة ثانية.</p>
        </div>
      </div>
      <div className="stack">
        {networks.map((n) => (
          <NetworkForm key={n.id} n={n} base={base} revenue={rev.get(n.id) ?? 0} defaultShare={settings.userSharePct} />
        ))}
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ إضافة شبكة جديدة</summary>
          <div style={{ marginTop: 14 }}>
            <NetworkForm n={null} base={base} revenue={0} defaultShare={settings.userSharePct} />
          </div>
        </details>
      </div>
    </>
  );
}

type N = { id: string; name: string; kind: string; enabled: boolean; userShare: number | null; secretEnc: string | null; signatureMode: string; allowedIps: string[]; wallUrl: string | null };

function NetworkForm({ n, base, revenue, defaultShare }: { n: N | null; base: string; revenue: number; defaultShare: number }) {
  const id = n?.id ?? "";
  return (
    <ActionForm action={saveNetworkAction} className={n ? "card stack" : "stack"}>
      <input type="hidden" name="isNew" value={n ? "0" : "1"} />
      {n ? <input type="hidden" name="id" value={n.id} /> : null}
      <div className="row between wr">
        <div>
          <h3 style={{ fontSize: 20 }} dir="ltr">
            {n?.name ?? "شبكة جديدة"}
          </h3>
          {n ? <div className="small muted">{n.kind}</div> : null}
        </div>
        <label className="check">
          <span className="switch">
            <input type="checkbox" name="enabled" defaultChecked={n?.enabled ?? false} aria-label="تشغيل" />
            <span />
          </span>
          مفعّلة
        </label>
      </div>
      <div className="setgrid">
        {!n ? (
          <label className="field">
            <span className="flabel">المعرّف (إنجليزي صغير، مثل torox)</span>
            <input className="input num" name="id" dir="ltr" maxLength={30} />
          </label>
        ) : null}
        <label className="field">
          <span className="flabel">الاسم</span>
          <input className="input" name="name" dir="ltr" defaultValue={n?.name ?? ""} maxLength={40} />
        </label>
        <label className="field">
          <span className="flabel">النوع (إنجليزي: Games / Surveys / Mixed offers…)</span>
          <input className="input" name="kind" dir="ltr" defaultValue={n?.kind ?? "Mixed offers"} maxLength={40} />
        </label>
        <label className="field">
          <span className="flabel">حصة العضو %</span>
          <input className="input num" name="userShare" dir="ltr" inputMode="numeric" defaultValue={n?.userShare ?? ""} placeholder={`${defaultShare} (عام)`} />
        </label>
        <label className="field">
          <span className="flabel">طريقة التحقق من التوقيع</span>
          <select className="input" name="signatureMode" defaultValue={n?.signatureMode ?? "HMAC_SHA256"} dir="ltr">
            {SIGNATURE_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">{n?.secretEnc ? "السر محفوظ ✓ (اكتب سر جديد لتغييره فقط)" : "سر الـ Postback (من لوحة الشبكة)"}</span>
          <input className="input num" name="secret" dir="ltr" type="password" autoComplete="off" maxLength={200} />
        </label>
        <label className="field">
          <span className="flabel">IP الشبكة المسموحة (اختياري، مفصولة بمسافة، تقبل /24)</span>
          <input className="input num" name="allowedIps" dir="ltr" defaultValue={n?.allowedIps.join(" ") ?? ""} />
        </label>
      </div>
      <label className="field">
        <span className="flabel">رابط جدار العروض (iframe) — لازم يحتوي {"{user_id}"}</span>
        <input className="input num" name="wallUrl" dir="ltr" defaultValue={n?.wallUrl ?? ""} placeholder="https://wall.example.com/?app=123&user={user_id}" maxLength={1000} />
      </label>
      <div className="field">
        <span className="flabel">رابط التأكيد (Postback) — انسخه للوحة الشبكة وبدّل الماكروهات بماكروهاتها</span>
        <div className="code">{`${base}/api/postback/${id || "{network}"}?subid={user_id}&txid={transaction_id}&payout={payout_usd}&status={1_or_2}&offer={offer_name}&sig={signature}`}</div>
        <div className="tiny muted" dir="ltr" style={{ textAlign: "right" }}>
          {MODE_HELP[n?.signatureMode ?? "HMAC_SHA256"]}
        </div>
      </div>
      <div className="row between wr">
        {n ? (
          <span className="small muted">
            إيراد 30 يوم: <Usd cents={revenue} />
          </span>
        ) : (
          <span />
        )}
        <Submit className="btn primary sm">حفظ</Submit>
      </div>
    </ActionForm>
  );
}
