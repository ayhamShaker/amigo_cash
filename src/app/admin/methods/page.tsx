import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt, type AdminLang } from "@/server/admin-lang";
import { getSettings } from "@/server/settings";
import { ActionForm, Submit } from "@/components/forms";
import { MethodIconPicker } from "@/components/method-icon-picker";
import { addMethodAction, addPresetMethodAction, deleteMethodAction, moveMethodAction, saveMethodAction, setAllMethodsMinAction } from "@/app/actions/methods";
import { ADDRESS_KIND_KEYS, ADDRESS_KINDS, BUILTIN_ICONS, US_UK_PRESETS, type AddressKind, type PayMethod } from "@/lib/methods";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Cash-out Methods" : "طرق السحب" };
}

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

function Fields({ m, lang }: { m?: PayMethod; lang: AdminLang }) {
  const at = makeAt(lang);
  return (
    <>
      <MethodIconPicker current={m?.image ?? "/methods/usdt.svg"} icons={BUILTIN_ICONS} />
      <div className="grid2" style={{ gap: 12 }}>
        <label className="field">
          <span className="flabel">{at("الاسم (بيظهر للعضو)", "Display name")}</span>
          <input className="input" name="name" dir="ltr" defaultValue={m?.name} maxLength={40} placeholder="USDT" />
        </label>
        <label className="field">
          <span className="flabel">{at("سطر تحت الاسم", "Subtitle")}</span>
          <input className="input" name="sub" dir="ltr" defaultValue={m?.sub} maxLength={60} placeholder="Tether · TRC-20" />
        </label>
        <label className="field">
          <span className="flabel">{at("شو بيكتب العضو", "Address format")}</span>
          <select className="input" name="kind" defaultValue={m?.kind ?? "text"}>
            {ADDRESS_KIND_KEYS.map((k) => (
              <option key={k} value={k}>
                {lang === "en" ? ADDRESS_KINDS[k].label : KIND_AR[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">{at("عنوان الخانة (بالإنجليزي)", "Input field label")}</span>
          <input className="input" name="field" dir="ltr" defaultValue={m?.field} maxLength={60} placeholder="TRC20 wallet address" />
        </label>
        <label className="field">
          <span className="flabel">{at("مثال داخل الخانة", "Placeholder example")}</span>
          <input className="input" name="placeholder" dir="ltr" defaultValue={m?.placeholder} maxLength={80} />
        </label>
        <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <label className="field grow">
            <span className="flabel">{at("الحد الأدنى ($)", "Minimum ($)")}</span>
            <input className="input num" name="min" dir="ltr" inputMode="decimal" defaultValue={m ? usd(m.minCents) : "10.00"} />
          </label>
          <label className="field grow">
            <span className="flabel">{at("الرسوم ($)", "Fee ($)")}</span>
            <input className="input num" name="fee" dir="ltr" inputMode="decimal" defaultValue={m ? usd(m.feeCents) : "0.00"} />
          </label>
        </div>
      </div>
      <label className="setrow" style={{ borderBottom: 0, padding: 0 }}>
        <b className="small">{at("مفعلة للأعضاء", "Enabled for members")}</b>
        <span className="switch">
          <input type="checkbox" name="enabled" defaultChecked={m ? m.enabled : true} />
          <span />
        </span>
      </label>
    </>
  );
}

export default async function MethodsPage() {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const s = await getSettings();
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{at("طرق السحب", "Cash-out methods")}</h1>
          <p className="small muted">
            {at("عدل أي طريقة أو أضف طريقة جديدة. الترتيب هون هو نفس الترتيب اللي بيشوفه العضو. لسوق US/UK يفضل تفعيل PayPal وAmazon وVisa وSteam وLTC/USDC وإطفاء Binance Pay.", "Edit, reorder, or add payout methods. Order here matches the member cash-out page. For US/UK, enable Amazon, Visa, Steam, LTC/USDC and disable Binance Pay.")}
          </p>
        </div>
      </div>

      <div className="card row wr between">
        <div>
          <b className="small">{at("تغيير الحد الأدنى لكل الطرق دفعة واحدة", "Set minimum for all methods at once")}</b>
          <div className="tiny muted">{at("بيطبّق نفس الحد الأدنى على كل طرق السحب الحالية بضغطة زر.", "Applies the same minimum across every payout method in one click.")}</div>
        </div>
        <ActionForm action={setAllMethodsMinAction} className="row wr">
          <input className="input num" name="min" dir="ltr" inputMode="decimal" defaultValue="10.00" style={{ width: 96 }} aria-label={at("الحد الأدنى بالدولار", "Minimum USD")} />
          <Submit className="btn primary sm">{at("تطبيق على الكل", "Apply to all")}</Submit>
        </ActionForm>
      </div>

      {US_UK_PRESETS.some((p) => !s.methods.some((m) => m.id === p.id)) ? (
        <div className="card stack">
          <h3 style={{ fontSize: 16 }}>{at("إضافة سريعة لطرق US / UK المطلوبة", "Quick-add US / UK presets")}</h3>
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
              <span className={`pill ${m.enabled ? "good" : ""}`}>{m.enabled ? at("مفعلة", "Enabled") : at("مطفأة", "Disabled")}</span>
              <span className="cc">{m.id}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <form action={moveMethodAction}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="dir" value="up" />
                <button className="btn ghost sm" type="submit" disabled={i === 0} aria-label={at("لفوق", "Move up")}>
                  ↑
                </button>
              </form>
              <form action={moveMethodAction}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="dir" value="down" />
                <button className="btn ghost sm" type="submit" disabled={i === s.methods.length - 1} aria-label={at("لتحت", "Move down")}>
                  ↓
                </button>
              </form>
            </div>
          </div>
          <details>
            <summary className="btn ghost sm" style={{ width: "fit-content" }}>
              {at("تعديل", "Edit")}
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <ActionForm action={saveMethodAction} className="stack">
                <input type="hidden" name="id" value={m.id} />
                <Fields m={m} lang={lang} />
                <Submit className="btn primary">{at("حفظ", "Save")}</Submit>
              </ActionForm>
              <ActionForm action={deleteMethodAction} className="row wr">
                <input type="hidden" name="id" value={m.id} />
                <span className="small muted grow">{at("حذف الطريقة: السحوبات القديمة بتضل محفوظة. لتوقفها مؤقتا، أطفيها بدل الحذف.", "Delete method: past withdrawals stay intact. Disable instead to pause temporarily.")}</span>
                <Submit className="btn bad sm">{at("حذف", "Delete")}</Submit>
              </ActionForm>
            </div>
          </details>
        </div>
      ))}

      <div className="card stack" style={{ borderStyle: "dashed" }}>
        <h3 style={{ fontSize: 18 }}>{at("إضافة طريقة جديدة", "Add custom method")}</h3>
        <ActionForm action={addMethodAction} className="stack" resetOnOk>
          <Fields lang={lang} />
          <Submit className="btn primary">{at("إضافة", "Add")}</Submit>
        </ActionForm>
      </div>
    </>
  );
}
