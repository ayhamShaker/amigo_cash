import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { offerCoins, parseSteps } from "@/server/queries";
import { coinsToCents } from "@/lib/money";
import { ActionForm, Submit } from "@/components/forms";
import { deleteOfferAction, saveOfferAction } from "@/app/actions/admin";
import { Num, Usd } from "@/components/admin-ui";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Offers" : "العروض" };
}

export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const CATS: Record<string, string> = {
    game: at("لعبة", "Game"),
    app: at("تطبيق", "App"),
    signup: at("تسجيل", "Sign-up"),
    finance: at("مالي", "Finance"),
    trial: at("تجربة مجانية", "Free trial"),
  };
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
          <h1>{at("العروض المميزة", "Featured offers")}</h1>
          <p className="small muted">{at("العروض اللي بتظهر بصفحة «Earn». مكافأة العضو بتنحسب تلقائيا: سعر الشبكة × حصة العضو.", "Offers shown on Earn. Member reward is computed automatically: network payout × member share.")}</p>
        </div>
        {!showForm ? (
          <a className="btn primary" href="/admin/offers?new=1">
            + {at("عرض جديد", "New offer")}
          </a>
        ) : null}
      </div>

      {showForm ? (
        <ActionForm action={saveOfferAction} className="card stack">
          <h2 style={{ fontSize: 18 }}>{o ? `${at("تعديل:", "Edit:")} ${o.title}` : at("عرض جديد", "New offer")}</h2>
          <input type="hidden" name="id" value={o?.id ?? ""} />
          {networks.length === 0 ? <div className="formmsg bad">{at("أضف شبكة عروض أولا من صفحة «شبكات العروض».", "Add an offer network first on the Networks page.")}</div> : null}
          <div className="setgrid">
            <Field label={at("اسم العرض (كما يظهر للأعضاء)", "Offer title")}>
              <input className="input" name="title" dir="auto" defaultValue={o?.title ?? ""} maxLength={80} />
            </Field>
            <Field label={at("الشبكة", "Network")}>
              <select className="input" name="networkId" defaultValue={o?.networkId ?? networks[0]?.id}>
                {networks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={at("النوع", "Category")}>
              <select className="input" name="category" defaultValue={o?.category ?? "game"}>
                {Object.entries(CATS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={at("كم تدفع الشبكة ($)", "Network payout ($)")}>
              <input className="input num" name="payout" dir="ltr" inputMode="decimal" defaultValue={o ? (o.payoutCents / 100).toFixed(2) : ""} placeholder="12.50" />
            </Field>
            <Field label={at("اللون", "Accent color")}>
              <input className="input" name="color" type="color" defaultValue={o?.color ?? "#0284C7"} style={{ height: 46, padding: 4 }} />
            </Field>
            <Field label={at("المدة (أيام)", "Time limit (days)")}>
              <input className="input num" name="days" type="number" dir="ltr" defaultValue={o?.days ?? 14} min={1} max={365} />
            </Field>
            <Field label={at("الأجهزة", "Platforms")}>
              <input className="input" name="platform" dir="ltr" defaultValue={o?.platform ?? "Android · iOS"} maxLength={40} />
            </Field>
            <Field label={at("الدول (رموز مفصولة بمسافة، فارغ = الكل)", "Countries (ISO codes, blank = all)")}>
              <input className="input num" name="countries" dir="ltr" defaultValue={o?.countries.join(" ") ?? "US GB CA AU"} />
            </Field>
          </div>
          <Field label={at("رابط صورة/أيقونة اللعبة (اختياري، https://)", "Game icon / thumbnail URL (optional, https://)")}>
            <input className="input num" name="imageUrl" dir="ltr" defaultValue={o?.imageUrl ?? ""} placeholder="https://cdn.example.com/game-icon.png" maxLength={500} />
          </Field>
          <Field label={at("رابط التتبع من الشبكة (لازم يحتوي {user_id})", "Tracking URL (must contain {user_id})")}>
            <input className="input num" name="trackingUrl" dir="ltr" defaultValue={o?.trackingUrl ?? ""} placeholder="https://network.example/click?offer=123&sub1={user_id}" maxLength={1000} />
          </Field>
          <Field label={at("وصف قصير (إنجليزي)", "Short description (English)")}>
            <input className="input" name="description" dir="ltr" defaultValue={o?.description ?? ""} maxLength={300} />
          </Field>
          <Field label={at('المراحل: كل سطر "اسم المرحلة | النسبة من المبلغ"، المجموع 100', 'Steps: one per line "Step label | percentage", summing to 100')}>
            <textarea className="input num" name="steps" dir="ltr" style={{ minHeight: 120 }} defaultValue={o ? parseSteps(o.steps).map((s) => `${s.label} | ${s.pct}`).join("\n") : "Install and open the game | 5\nReach level 20 | 35\nReach level 75 | 60"} />
          </Field>
          <div className="row wr">
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={o ? o.active : true} /> {at("ظاهر للأعضاء", "Visible to members")}
            </label>
            <label className="check">
              <input type="checkbox" name="featured" defaultChecked={o ? o.featured : true} /> {at("مميز بالصفحة الرئيسية", "Featured on home")}
            </label>
          </div>
          <div className="row wr between">
            <a className="btn ghost" href="/admin/offers">
              {at("رجوع", "Back")}
            </a>
            <Submit>{at("حفظ العرض", "Save offer")}</Submit>
          </div>
        </ActionForm>
      ) : null}

      {o ? (
        <ActionForm action={deleteOfferAction} className="card row wr">
          <input type="hidden" name="id" value={o.id} />
          <span className="grow small">{at("لحذف العرض نهائيا اكتب DELETE:", "Type DELETE to remove this offer permanently:")}</span>
          <input className="input num" name="confirm" dir="ltr" style={{ width: 140 }} aria-label="DELETE" />
          <Submit className="btn bad">{at("حذف", "Delete")}</Submit>
        </ActionForm>
      ) : null}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>{at("العرض", "Offer")}</th>
              <th>{at("الشبكة", "Network")}</th>
              <th>{at("تدفع الشبكة", "Network pays")}</th>
              <th>{at("يأخذ العضو", "Member gets")}</th>
              <th>{at("ربحك", "Your margin")}</th>
              <th>{at("عدد اللي بدأوه", "Starts")}</th>
              <th>{at("الحالة", "Status")}</th>
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
                      {CATS[x.category]} · {parseSteps(x.steps).length} {at("مراحل", "steps")} · <span dir="ltr">{x.countries.join(" ") || at("كل الدول", "All")}</span>
                    </div>
                  </td>
                  <td dir="ltr">
                    {x.network.name}
                    {!x.network.enabled ? <span className="pill">{at("متوقفة", "Off")}</span> : null}
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
                    {x.active ? <span className="pill good">{at("ظاهر", "Live")}</span> : <span className="pill">{at("مخفي", "Hidden")}</span>} {x.featured ? <span className="pill accent">{at("مميز", "Featured")}</span> : null}
                  </td>
                  <td>
                    <a className="btn ghost sm" href={`/admin/offers?edit=${x.id}`}>
                      {at("تعديل", "Edit")}
                    </a>
                  </td>
                </tr>
              );
            })}
            {!offers.length ? (
              <tr>
                <td colSpan={8} className="empty">
                  {at("ما في عروض لسا.", "No offers yet.")}
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
