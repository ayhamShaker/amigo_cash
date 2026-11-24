import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { MethodIconPicker } from "@/components/method-icon-picker";
import { addMethodAction, addPresetMethodAction, deleteMethodAction, moveMethodAction, saveMethodAction } from "@/app/actions/methods";
import { ADDRESS_KIND_KEYS, BUILTIN_ICONS, US_UK_PRESETS, type AddressKind, type PayMethod } from "@/lib/methods";

export const metadata: Metadata = { title: "طرق السحب" };

const KIND_AR: Record<AddressKind, string> = {
  trc20: "عنوان TRON (TRC-20) — مثل USDT",
  evm: "عنوان 0x (ERC-20 / BEP-20)",
  btc: "عنوان Bitcoin",
  ltc: "عنوان Litecoin",
  sol: "عنوان Solana",
  binance: "Binance Pay ID (أرقام)",
  email: "إيميل (بطاقات هدايا، PayPal…)",
  text: "نص حر (أي شي تاني)",
};

function usd(c: number) {
  return (c / 100).toFixed(2);
}

function Fields({ m }: { m?: PayMethod }) {
  return (
    <>
      <MethodIconPicker current={m?.image ?? "/methods/usdt.svg"} icons={BUILTIN_ICONS} />
      <div className="grid2" style={{ gap: 12 }}>
        <label className="field">
          <span className="flabel">الاسم (بيظهر للعضو)</span>
          <input className="input" name="name" dir="ltr" defaultValue={m?.name} maxLength={40} placeholder="USDT" />
        </label>
        <label className="field">
          <span className="flabel">سطر تحت الاسم</span>
          <input className="input" name="sub" dir="ltr" defaultValue={m?.sub} maxLength={60} placeholder="Tether · TRC-20" />
        </label>
        <label className="field">
          <span className="flabel">شو بيكتب العضو</span>
          <select className="input" name="kind" defaultValue={m?.kind ?? "text"}>
            {ADDRESS_KIND_KEYS.map((k) => (
              <option key={k} value={k}>
                {KIND_AR[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">عنوان الخانة (بالإنجليزي)</span>
          <input className="input" name="field" dir="ltr" defaultValue={m?.field} maxLength={60} placeholder="TRC20 wallet address" />
        </label>
        <label className="field">
          <span className="flabel">مثال داخل الخانة</span>
          <input className="input" name="placeholder" dir="ltr" defaultValue={m?.placeholder} maxLength={80} />
        </label>
        <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <label className="field grow">
            <span className="flabel">الحد الأدنى ($)</span>
            <input className="input num" name="min" dir="ltr" inputMode="decimal" defaultValue={m ? usd(m.minCents) : "1.00"} />
          </label>
          <label className="field grow">
            <span className="flabel">الرسوم ($)</span>
            <input className="input num" name="fee" dir="ltr" inputMode="decimal" defaultValue={m ? usd(m.feeCents) : "0.00"} />
          </label>
        </div>
      </div>
      <label className="setrow" style={{ borderBottom: 0, padding: 0 }}>
        <b className="small">مفعلة للأعضاء</b>
        <span className="switch">
          <input type="checkbox" name="enabled" defaultChecked={m ? m.enabled : true} />
          <span />
        </span>
      </label>
    </>
  );
}

export default async function MethodsPage() {
  await requireAdminPage();
  const s = await getSettings();
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>طرق السحب</h1>
          <p className="small muted">عدل أي طريقة أو أضف طريقة جديدة. الترتيب هون هو نفس الترتيب اللي بيشوفه العضو. لسوق US/UK يفضل تفعيل PayPal وAmazon وVisa وSteam وLTC/USDC وإطفاء Binance Pay.</p>
        </div>
      </div>

      {US_UK_PRESETS.some((p) => !s.methods.some((m) => m.id === p.id)) ? (
        <div className="card stack">
          <h3 style={{ fontSize: 16 }}>إضافة سريعة لطرق US / UK المطلوبة</h3>
          <div className="row wr" style={{ gap: 8 }}>
            {US_UK_PRESETS.filter((p) => !s.methods.some((m) => m.id === p.id)).map((p) => (
              <ActionForm key={p.id} action={addPresetMethodAction}>
                <input type="hidden" name="preset" value={p.id} />
                <Submit className="btn ghost sm">+ {p.name}</Submit>
              </ActionForm>
            ))}
          </div>
        </div>
      ) : null}

      {s.methods.map((m, i) => (
        <div className="card stack" key={m.id}>
          <div className="row between wr">
            <div className="row wr" style={{ gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local icon or inline upload */}
              <img className="mlogo" src={m.image} alt="" width={40} height={40} />
              <b style={{ fontSize: 17 }} dir="ltr">
                {m.name}
              </b>
              <span className="small muted" dir="ltr">
                {`min $${usd(m.minCents)}${m.feeCents ? ` · fee $${usd(m.feeCents)}` : ""}`}
              </span>
              <span className={`pill ${m.enabled ? "good" : ""}`}>{m.enabled ? "مفعلة" : "مطفأة"}</span>
              <span className="cc">{m.id}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <form action={moveMethodAction}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="dir" value="up" />
                <button className="btn ghost sm" type="submit" disabled={i === 0} aria-label="لفوق">
                  ↑
                </button>
              </form>
              <form action={moveMethodAction}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="dir" value="down" />
                <button className="btn ghost sm" type="submit" disabled={i === s.methods.length - 1} aria-label="لتحت">
                  ↓
                </button>
              </form>
            </div>
          </div>
          <details>
            <summary className="btn ghost sm" style={{ width: "fit-content" }}>
              تعديل
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <ActionForm action={saveMethodAction} className="stack">
                <input type="hidden" name="id" value={m.id} />
                <Fields m={m} />
                <Submit className="btn primary">حفظ</Submit>
              </ActionForm>
              <ActionForm action={deleteMethodAction} className="row wr">
                <input type="hidden" name="id" value={m.id} />
                <span className="small muted grow">حذف الطريقة: السحوبات القديمة بتضل محفوظة. لتوقفها مؤقتا، أطفيها بدل الحذف.</span>
                <Submit className="btn bad sm">حذف</Submit>
              </ActionForm>
            </div>
          </details>
        </div>
      ))}

      <div className="card stack" style={{ borderStyle: "dashed" }}>
        <h3 style={{ fontSize: 18 }}>إضافة طريقة جديدة</h3>
        <ActionForm action={addMethodAction} className="stack" resetOnOk>
          <Fields />
          <Submit className="btn primary">إضافة</Submit>
        </ActionForm>
      </div>
    </>
  );
}
