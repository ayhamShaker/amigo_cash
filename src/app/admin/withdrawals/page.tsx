import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ActionForm, Submit } from "@/components/forms";
import { withdrawalAction } from "@/app/actions/admin";
import { Risk, Usd, agoAr, WITHDRAWAL_STATUS_AR } from "@/components/admin-ui";
import { METHOD_META } from "@/lib/methods";
import type { WithdrawalStatus } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "السحوبات" };

const TABS: Record<string, [string, WithdrawalStatus[] | null]> = {
  open: ["بانتظارك", ["PENDING", "APPROVED"]],
  paid: ["مدفوعة", ["PAID"]],
  rejected: ["مرفوضة", ["REJECTED"]],
  all: ["الكل", null],
};

const REASONS: [string, string][] = [
  ["VPN or proxy detected", "تم اكتشاف VPN أو بروكسي"],
  ["Wallet address is invalid", "عنوان المحفظة غير صالح"],
  ["Multiple accounts on one device", "عدة حسابات على جهاز واحد"],
  ["Offer reversed by the advertiser", "العرض استرده المعلن"],
];

export default async function WithdrawalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
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
          <h1>السحوبات</h1>
          <p className="small muted">
            {openSum._count} طلب مفتوح بقيمة <Usd cents={openSum._sum.amountCents ?? 0} />. «جاهز للدفع» يعني تمت الموافقة: أرسل المبلغ من محفظتك ثم اضغط «تم الدفع» وحط رقم العملية.
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
            const [label, cls] = WITHDRAWAL_STATUS_AR[w.status] ?? ["", ""];
            const open = w.status === "PENDING" || w.status === "APPROVED";
            return (
              <div className="card stack" key={w.id} style={{ gap: 10 }}>
                <div className="row between wr">
                  <div className="row wr">
                    <a href={`/admin/users/${w.user.id}`}>
                      <b>{w.user.name}</b>
                    </a>
                    {w.firstPayout ? <span className="pill info">أول سحب</span> : null}
                    <span className={`pill ${cls}`}>{label}</span>
                    <Risk score={w.user.riskScore} />
                    {w.user.flags.map((f) => (
                      <span key={f} className="pill bad">
                        {f}
                      </span>
                    ))}
                  </div>
                  <span className="small muted">{agoAr(w.createdAt)}</span>
                </div>
                <div className="row between wr">
                  <div>
                    <b dir="ltr">{METHOD_META[w.method as keyof typeof METHOD_META]?.name ?? w.method}</b>
                    <div className="code" style={{ marginTop: 4 }}>
                      {w.address}
                    </div>
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      <Usd cents={w.amountCents - w.feeCents} />
                    </div>
                    <div className="tiny muted">
                      المبلغ <Usd cents={w.amountCents} /> − رسوم <Usd cents={w.feeCents} />
                    </div>
                  </div>
                </div>
                {w.note ? <div className="small muted">السبب: {w.note}</div> : null}
                {w.txRef ? (
                  <div className="small muted">
                    رقم العملية: <span dir="ltr">{w.txRef}</span>
                  </div>
                ) : null}
                {open ? (
                  <div className="row wr" style={{ alignItems: "flex-start" }}>
                    {w.status === "PENDING" ? (
                      <ActionForm action={withdrawalAction}>
                        <input type="hidden" name="id" value={w.id} />
                        <input type="hidden" name="op" value="approve" />
                        <Submit className="btn">موافقة</Submit>
                      </ActionForm>
                    ) : null}
                    <ActionForm action={withdrawalAction} className="row wr">
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="op" value="paid" />
                      <input className="input" name="txRef" placeholder="رقم العملية / TX hash" dir="ltr" style={{ width: 220 }} maxLength={200} aria-label="رقم العملية" />
                      <Submit className="btn good">تم الدفع</Submit>
                    </ActionForm>
                    <ActionForm action={withdrawalAction} className="row wr">
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="op" value="reject" />
                      <select className="input" name="reason" style={{ width: 230 }} aria-label="سبب الرفض" defaultValue="">
                        <option value="" disabled>
                          سبب الرفض…
                        </option>
                        {REASONS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <Submit className="btn bad">رفض وإرجاع الرصيد</Submit>
                    </ActionForm>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty">ما في طلبات هون.</div>
      )}
    </>
  );
}
