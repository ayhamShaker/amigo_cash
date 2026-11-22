import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { coinsToCents } from "@/lib/money";
import { ActionForm, Submit } from "@/components/forms";
import { createPromoAction, togglePromoAction } from "@/app/actions/admin";
import { Num, Usd } from "@/components/admin-ui";

export const metadata: Metadata = { title: "أكواد المكافآت" };

export default async function PromosPage() {
  await requireAdminPage();
  const [promos, s] = await Promise.all([db.promoCode.findMany({ orderBy: { createdAt: "desc" } }), getSettings()]);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>أكواد المكافآت</h1>
          <p className="small muted">أكواد بتوزعها على تيليغرام أو مع المؤثرين. كل عضو بيستخدم الكود مرة وحدة.</p>
        </div>
      </div>
      <ActionForm action={createPromoAction} className="card row wr" resetOnOk>
        <label className="field">
          <span className="flabel">الكود</span>
          <input className="input num" name="code" dir="ltr" placeholder="SUMMER26" maxLength={32} style={{ textTransform: "uppercase" }} />
        </label>
        <label className="field">
          <span className="flabel">عدد الكوينز</span>
          <input className="input num" name="coins" type="number" dir="ltr" defaultValue={500} min={1} />
        </label>
        <label className="field">
          <span className="flabel">عدد الاستخدامات</span>
          <input className="input num" name="maxUses" type="number" dir="ltr" defaultValue={100} min={1} />
        </label>
        <div style={{ alignSelf: "flex-end" }}>
          <Submit>+ إنشاء</Submit>
        </div>
      </ActionForm>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>الكود</th>
              <th>المكافأة</th>
              <th>الاستخدام</th>
              <th>التكلفة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.code}>
                <td>
                  <span className="cc" style={{ fontSize: 13 }}>
                    {p.code}
                  </span>
                </td>
                <td>
                  <Num n={p.coins} />
                </td>
                <td>
                  <Num n={p.uses} /> / <Num n={p.maxUses} />
                </td>
                <td>
                  <Usd cents={coinsToCents(p.uses * p.coins, s.coinsPerUsd)} />
                </td>
                <td>
                  <ActionForm action={togglePromoAction} className="row">
                    <input type="hidden" name="code" value={p.code} />
                    <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                    {p.active ? <span className="pill good">مفعل</span> : <span className="pill">متوقف</span>}
                    <Submit className="btn ghost sm">{p.active ? "إيقاف" : "تفعيل"}</Submit>
                  </ActionForm>
                </td>
              </tr>
            ))}
            {!promos.length ? (
              <tr>
                <td colSpan={5} className="empty">
                  ما في أكواد.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
