import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { getSettings } from "@/server/settings";
import { db } from "@/lib/db";
import { ActionForm, Submit } from "@/components/forms";
import { withdrawalAction } from "@/app/actions/admin";
import { Risk, Usd, agoAr, withdrawalStatusLabel } from "@/components/admin-ui";
import { methodName } from "@/lib/methods";
import type { WithdrawalStatus } from "@/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Withdrawals" : "السحوبات" };
}

const REASONS: [string, string][] = [
  ["VPN or proxy detected", "تم اكتشاف VPN أو بروكسي"],
  ["Wallet address is invalid", "عنوان المحفظة غير صالح"],
  ["Multiple accounts on one device", "عدة حسابات على جهاز واحد"],
  ["Offer reversed by the advertiser", "العرض استرده المعلن"],
];

export default async function WithdrawalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const TABS: Record<string, [string, WithdrawalStatus[] | null]> = {
    open: [at("بانتظارك", "Open"), ["PENDING", "APPROVED"]],
    paid: [at("مدفوعة", "Paid"), ["PAID"]],
    rejected: [at("مرفوضة", "Rejected"), ["REJECTED"]],
    all: [at("الكل", "All"), null],
  };
  const settings = await getSettings();
  const sp = await searchParams;
  const tab = sp.tab && TABS[sp.tab] ? sp.tab : "open";
  const statuses = TABS[tab]![1];
  const list = await db.withdrawal.findMany({
    where: statuses ? { status: { in: statuses } } : {},
    orderBy: { createdAt: tab === "open" ? "asc" : "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true, riskScore: true, flags: true, emailVerifiedAt: true, _count: { select: { withdrawals: true } } } } },
  });
  const openSum = await db.withdrawal.aggregate({ where: { status: { in: ["PENDING", "APPROVED"] } }, _sum: { amountCents: true }, _count: true });
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{at("السحوبات", "Withdrawals")}</h1>
          <p className="small muted">
            {openSum._count} {at("طلب مفتوح بقيمة", "open requests totaling")} <Usd cents={openSum._sum.amountCents ?? 0} />.{" "}
            {at("«جاهز للدفع» يعني تمت الموافقة: أرسل المبلغ من محفظتك ثم اضغط «تم الدفع» وحط رقم العملية.", '"Ready to pay" means approved: send the payout, then click "Mark paid" with the TX reference.')}
          </p>
        </div>
      </div>
      <div className="tabs">
        {Object.entries(TABS).map(([k, [l]]) => (
          <a key={k} className={`tab ${tab === k ? "on" : ""}`} href={`/admin/withdrawals?tab=${k}`}>
            {l}
          </a>
        ))}
      </div>
      {list.length ? (
        <div className="stack">
          {list.map((w) => {
            const [label, cls] = withdrawalStatusLabel(w.status, lang);
            const open = w.status === "PENDING" || w.status === "APPROVED";
            return (
              <div className="card stack" key={w.id} style={{ gap: 10 }}>
                <div className="row between wr">
                  <div className="row wr">
                    <a href={`/admin/users/${w.user.id}`}>
                      <b>{w.user.name}</b>
                    </a>
                    {w.firstPayout ? <span className="pill info">{at("أول سحب", "First payout")}</span> : null}
                    <span className={`pill ${cls}`}>{label}</span>
                    <Risk score={w.user.riskScore} />
                    {w.user.flags.map((f) => (
                      <span key={f} className="pill bad">
                        {f}
                      </span>
                    ))}
                  </div>
                  <span className="small muted">{agoAr(w.createdAt, undefined, lang)}</span>
                </div>
                <div className="row between wr">
                  <div>
                    <b dir="ltr">{methodName(settings.methods, w.method)}</b>
                    <div className="code" style={{ marginTop: 4 }}>
                      {w.address}
                    </div>
                  </div>
                  <div style={{ textAlign: "end" }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      <Usd cents={w.amountCents - w.feeCents} />
                    </div>
                    <div className="tiny muted">
                      {at("المبلغ", "Gross")} <Usd cents={w.amountCents} /> − {at("رسوم", "fee")} <Usd cents={w.feeCents} />
                    </div>
                  </div>
                </div>
                {w.note ? <div className="small muted">{at("السبب:", "Reason:")} {w.note}</div> : null}
                {w.txRef ? (
                  <div className="small muted">
                    {at("رقم العملية:", "Reference:")} <span dir="ltr">{w.txRef}</span>
                  </div>
                ) : null}
                {open ? (
                  <div className="row wr" style={{ alignItems: "flex-start" }}>
                    {w.status === "PENDING" ? (
                      <ActionForm action={withdrawalAction}>
                        <input type="hidden" name="id" value={w.id} />
                        <input type="hidden" name="op" value="approve" />
                        <Submit className="btn">{at("موافقة", "Approve")}</Submit>
                      </ActionForm>
                    ) : null}
                    <ActionForm action={withdrawalAction} className="row wr">
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="op" value="paid" />
                      <input className="input" name="txRef" placeholder={at("رقم العملية / TX hash", "TX hash / code")} dir="ltr" style={{ width: 220 }} maxLength={200} aria-label={at("رقم العملية", "Reference")} />
                      <Submit className="btn good">{at("تم الدفع", "Mark paid")}</Submit>
                    </ActionForm>
                    <ActionForm action={withdrawalAction} className="row wr">
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="op" value="reject" />
                      <select className="input" name="reason" style={{ width: 230 }} aria-label={at("سبب الرفض", "Rejection reason")} defaultValue="">
                        <option value="" disabled>
                          {at("سبب الرفض…", "Rejection reason…")}
                        </option>
                        {REASONS.map(([en, ar]) => (
                          <option key={en} value={en}>
                            {lang === "en" ? en : ar}
                          </option>
                        ))}
                      </select>
                      <Submit className="btn bad">{at("رفض وإرجاع الرصيد", "Reject & refund")}</Submit>
                    </ActionForm>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty">{at("ما في طلبات هون.", "No withdrawals here.")}</div>
      )}
    </>
  );
}
