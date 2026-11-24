import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { coinsToCents } from "@/lib/money";
import { ActionForm, Submit } from "@/components/forms";
import { createPromoAction, togglePromoAction } from "@/app/actions/admin";
import { Num, Usd } from "@/components/admin-ui";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Promo Codes" : "أكواد المكافآت" };
}

export default async function PromosPage() {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const [promos, s] = await Promise.all([db.promoCode.findMany({ orderBy: { createdAt: "desc" } }), getSettings()]);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{at("أكواد المكافآت", "Promo codes")}</h1>
          <p className="small muted">{at("أكواد بتوزعها على تيليغرام أو مع المؤثرين. كل عضو بيستخدم الكود مرة وحدة.", "Share promo codes on Discord, Telegram, or with creators. One redemption per member.")}</p>
        </div>
      </div>
      <ActionForm action={createPromoAction} className="card row wr" resetOnOk>
        <label className="field">
          <span className="flabel">{at("الكود", "Code")}</span>
          <input className="input num" name="code" dir="ltr" placeholder="SUMMER26" maxLength={32} style={{ textTransform: "uppercase" }} />
        </label>
        <label className="field">
          <span className="flabel">{at("عدد الكوينز", "Coins")}</span>
          <input className="input num" name="coins" type="number" dir="ltr" defaultValue={100} min={1} />
        </label>
        <label className="field">
          <span className="flabel">{at("عدد الاستخدامات", "Max uses")}</span>
          <input className="input num" name="maxUses" type="number" dir="ltr" defaultValue={100} min={1} />
        </label>
        <div style={{ alignSelf: "flex-end" }}>
          <Submit>+ {at("إنشاء", "Create")}</Submit>
        </div>
      </ActionForm>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>{at("الكود", "Code")}</th>
              <th>{at("المكافأة", "Reward")}</th>
              <th>{at("الاستخدام", "Uses")}</th>
              <th>{at("التكلفة", "Cost")}</th>
              <th>{at("الحالة", "Status")}</th>
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
                    {p.active ? <span className="pill good">{at("مفعل", "Active")}</span> : <span className="pill">{at("متوقف", "Off")}</span>}
                    <Submit className="btn ghost sm">{p.active ? at("إيقاف", "Disable") : at("تفعيل", "Enable")}</Submit>
                  </ActionForm>
                </td>
              </tr>
            ))}
            {!promos.length ? (
              <tr>
                <td colSpan={5} className="empty">
                  {at("ما في أكواد.", "No promo codes yet.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
