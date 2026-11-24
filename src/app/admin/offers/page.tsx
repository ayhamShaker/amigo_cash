import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { offerCoins, parseSteps } from "@/server/queries";
import { coinsToCents } from "@/lib/money";
import { ActionForm, Submit } from "@/components/forms";
import { deleteOfferAction, saveOfferAction } from "@/app/actions/admin";
import { Num, Usd } from "@/components/admin-ui";

export const metadata: Metadata = { title: "العروض" };

const CATS: Record<string, string> = { game: "لعبة", app: "تطبيق", signup: "تسجيل", finance: "مالي", trial: "تجربة مجانية" };

export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const [offers, networks, settings] = await Promise.all([
    db.offer.findMany({ include: { network: { select: { name: true, userShare: true, enabled: true } }, _count: { select: { progress: true } } }, orderBy: [{ featured: "desc" }, { createdAt: "desc" }] }),
    db.network.findMany({ orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  const editing = sp.edit ? offers.find((o) => o.id === sp.edit) : null;
  const showForm = !!editing || sp.new === "1";
  const o = editing;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>العروض المميزة</h1>
          <p className="small muted">العروض اللي بتظهر بصفحة «Earn». مكافأة العضو بتنحسب تلقائيا: سعر الشبكة × حصة العضو.</p>
        </div>
        {!showForm ? (
          <a className="btn primary" href="/admin/offers?new=1">
            + عرض جديد
          </a>
        ) : null}
      </div>

      {showForm ? (
        <ActionForm action={saveOfferAction} className="card stack">
          <h2 style={{ fontSize: 18 }}>{o ? `تعديل: ${o.title}` : "عرض جديد"}</h2>
          <input type="hidden" name="id" value={o?.id ?? ""} />
          {networks.length === 0 ? <div className="formmsg bad">أضف شبكة عروض أولا من صفحة «شبكات العروض».</div> : null}
          <div className="setgrid">
            <Field label="اسم العرض (كما يظهر للأعضاء)">
              <input className="input" name="title" dir="auto" defaultValue={o?.title ?? ""} maxLength={80} />
            </Field>
            <Field label="الشبكة">
              <select className="input" name="networkId" defaultValue={o?.networkId ?? networks[0]?.id}>
                {networks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="النوع">
              <select className="input" name="category" defaultValue={o?.category ?? "game"}>
                {Object.entries(CATS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="كم تدفع الشبكة ($)">
              <input className="input num" name="payout" dir="ltr" inputMode="decimal" defaultValue={o ? (o.payoutCents / 100).toFixed(2) : ""} placeholder="12.50" />
            </Field>
            <Field label="اللون">
              <input className="input" name="color" type="color" defaultValue={o?.color ?? "#0284C7"} style={{ height: 46, padding: 4 }} />
            </Field>
            <Field label="المدة (أيام)">
              <input className="input num" name="days" type="number" dir="ltr" defaultValue={o?.days ?? 14} min={1} max={365} />
            </Field>
            <Field label="الأجهزة">
              <input className="input" name="platform" dir="ltr" defaultValue={o?.platform ?? "Android · iOS"} maxLength={40} />
            </Field>
            <Field label="الدول (رموز مفصولة بمسافة، فارغ = الكل)">
              <input className="input num" name="countries" dir="ltr" defaultValue={o?.countries.join(" ") ?? "US GB CA AU"} />
            </Field>
          </div>
          <Field label="رابط صورة/أيقونة اللعبة (اختياري، https://)">
            <input className="input num" name="imageUrl" dir="ltr" defaultValue={o?.imageUrl ?? ""} placeholder="https://cdn.example.com/game-icon.png" maxLength={500} />
          </Field>
          <Field label="رابط التتبع من الشبكة (لازم يحتوي {user_id})">
            <input className="input num" name="trackingUrl" dir="ltr" defaultValue={o?.trackingUrl ?? ""} placeholder="https://network.example/click?offer=123&sub1={user_id}" maxLength={1000} />
          </Field>
          <Field label="وصف قصير (إنجليزي)">
            <input className="input" name="description" dir="ltr" defaultValue={o?.description ?? ""} maxLength={300} />
          </Field>
          <Field label='المراحل: كل سطر "اسم المرحلة | النسبة من المبلغ"، المجموع 100'>
            <textarea className="input num" name="steps" dir="ltr" style={{ minHeight: 120 }} defaultValue={o ? parseSteps(o.steps).map((s) => `${s.label} | ${s.pct}`).join("\n") : "Install and open the game | 5\nReach level 20 | 35\nReach level 75 | 60"} />
          </Field>
          <div className="row wr">
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={o ? o.active : true} /> ظاهر للأعضاء
            </label>
            <label className="check">
              <input type="checkbox" name="featured" defaultChecked={o ? o.featured : true} /> مميز بالصفحة الرئيسية
            </label>
          </div>
          <div className="row wr between">
            <a className="btn ghost" href="/admin/offers">
              رجوع
            </a>
            <Submit>حفظ العرض</Submit>
          </div>
        </ActionForm>
      ) : null}

      {o ? (
        <ActionForm action={deleteOfferAction} className="card row wr">
          <input type="hidden" name="id" value={o.id} />
          <span className="grow small">لحذف العرض نهائيا اكتب DELETE:</span>
          <input className="input num" name="confirm" dir="ltr" style={{ width: 140 }} aria-label="تأكيد الحذف" />
          <Submit className="btn bad">حذف</Submit>
        </ActionForm>
      ) : null}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>العرض</th>
              <th>الشبكة</th>
              <th>تدفع الشبكة</th>
              <th>يأخذ العضو</th>
              <th>ربحك</th>
              <th>عدد اللي بدأوه</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {offers.map((x) => {
              const memberCents = coinsToCents(offerCoins(x, settings), settings.coinsPerUsd);
              return (
                <tr key={x.id}>
                  <td>
                    <b dir="ltr">{x.title}</b>
                    <div className="tiny muted">
                      {CATS[x.category]} · {parseSteps(x.steps).length} مراحل · <span dir="ltr">{x.countries.join(" ") || "كل الدول"}</span>
                    </div>
                  </td>
                  <td dir="ltr">
                    {x.network.name}
                    {!x.network.enabled ? <span className="pill">متوقفة</span> : null}
                  </td>
                  <td>
                    <Usd cents={x.payoutCents} />
                  </td>
                  <td>
                    <Usd cents={memberCents} />
                  </td>
                  <td style={{ color: "var(--good)" }}>
                    <Usd cents={x.payoutCents - memberCents} />
                  </td>
                  <td>
                    <Num n={x._count.progress} />
                  </td>
                  <td>
                    {x.active ? <span className="pill good">ظاهر</span> : <span className="pill">مخفي</span>} {x.featured ? <span className="pill accent">مميز</span> : null}
                  </td>
                  <td>
                    <a className="btn ghost sm" href={`/admin/offers?edit=${x.id}`}>
                      تعديل
                    </a>
                  </td>
                </tr>
              );
            })}
            {!offers.length ? (
              <tr>
                <td colSpan={8} className="empty">
                  ما في عروض لسا.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="flabel">{label}</span>
      {children}
    </label>
  );
}
