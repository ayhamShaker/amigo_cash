import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { requireAdminPage } from "@/server/admin-guard";
import { ActionForm, Submit } from "@/components/forms";
import { adjustBalanceAction, clearFlagsAction, releaseUserHoldsAction, setRoleAction, setUserStatusAction } from "@/app/actions/admin";
import { Num, Risk, Usd, agoAr, WITHDRAWAL_STATUS_AR } from "@/components/admin-ui";
import { coinsToCents } from "@/lib/money";
import { describe } from "@/i18n/t";
import { METHOD_META } from "@/lib/methods";

export const metadata: Metadata = { title: "ملف المستخدم" };

const KIND_AR: Record<string, string> = {
  WELCOME: "ترحيب", OFFER: "عرض", SURVEY: "استبيان", BONUS: "صندوق يومي", REFERRAL: "إحالة", INVITE_BONUS: "مكافأة دعوة", PROMO: "كود",
  CONTEST: "مسابقة", ADJUST: "تعديل يدوي", WITHDRAWAL: "سحب", REFUND: "استرجاع", REVERSAL: "استرداد", RELEASE: "تحرير",
};

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdminPage();
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id: id.slice(0, 40) }, include: { referredBy: { select: { id: true, name: true } }, _count: { select: { referrals: true } } } });
  if (!u) notFound();
  const settings = await getSettings();
  const [ledger, withdrawals, devices, sessions] = await Promise.all([
    db.ledgerEntry.findMany({ where: { userId: u.id, kind: { not: "RELEASE" } }, orderBy: { createdAt: "desc" }, take: 25 }),
    db.withdrawal.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.userDevice.findMany({ where: { userId: u.id }, select: { deviceId: true, ip: true } }),
    db.session.count({ where: { userId: u.id, expiresAt: { gt: new Date() } } }),
  ]);
  const deviceIds = devices.map((d) => d.deviceId);
  const ips = [...new Set([u.signupIp, ...devices.map((d) => d.ip)].filter((x): x is string => !!x))];
  const linked = await db.user.findMany({
    where: { id: { not: u.id }, OR: [{ devices: { some: { deviceId: { in: deviceIds } } } }, ...(ips.length ? [{ signupIp: { in: ips } }] : [])] },
    select: { id: true, name: true, status: true },
    take: 20,
  });

  return (
    <>
      <a className="small" href="/admin/users">
        → المستخدمون
      </a>
      <div className="pagehead">
        <div>
          <h1>{u.name}</h1>
          <div className="row wr" style={{ marginTop: 6 }}>
            {u.status === "BANNED" ? <span className="pill bad">محظور</span> : <span className="pill good">نشط</span>}
            {u.role === "ADMIN" ? <span className="pill accent">مدير</span> : null}
            <span className="cc">{u.country}</span>
            {u.flags.map((f) => (
              <span key={f} className="pill bad">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="grid3">
        <div className="kpi">
          <div className="k">الرصيد المتاح</div>
          <div className="v">
            <Num n={u.balance} />
          </div>
          <div className="d muted">
            <Usd cents={coinsToCents(u.balance, settings.coinsPerUsd)} />
          </div>
        </div>
        <div className="kpi">
          <div className="k">معلّق</div>
          <div className="v">
            <Num n={u.pending} />
          </div>
        </div>
        <div className="kpi">
          <div className="k">مدى الحياة</div>
          <div className="v">
            <Num n={u.lifetimeEarned} />
          </div>
        </div>
      </div>
      <div className="card stack" style={{ gap: 8, fontSize: 14 }}>
        <Row k="البريد">
          <span dir="ltr">{u.email}</span> {u.emailVerifiedAt ? <span className="pill good">مؤكد</span> : <span className="pill warn">غير مؤكد</span>}
        </Row>
        <Row k="IP التسجيل">
          <span className="num" dir="ltr">
            {u.signupIp ?? "—"}
          </span>
        </Row>
        <Row k="الأجهزة">
          <span className="num" dir="ltr">
            {deviceIds.length ? deviceIds.map((d) => d.slice(0, 8)).join(", ") : "—"}
          </span>
        </Row>
        <Row k="حسابات مرتبطة (نفس الجهاز أو الـ IP)">
          {linked.length ? (
            <span>
              {linked.map((l, i) => (
                <span key={l.id}>
                  {i ? "، " : ""}
                  <a href={`/admin/users/${l.id}`}>{l.name}</a>
                  {l.status === "BANNED" ? " (محظور)" : ""}
                </span>
              ))}
            </span>
          ) : (
            <span className="pill good">لا يوجد</span>
          )}
        </Row>
        <Row k="مُحال من">{u.referredBy ? <a href={`/admin/users/${u.referredBy.id}`}>{u.referredBy.name}</a> : "—"} · دعا {u._count.referrals} أشخاص</Row>
        <Row k="درجة الخطورة">
          <Risk score={u.riskScore} />
        </Row>
        <Row k="التحقق بخطوتين">{u.totpEnabled ? <span className="pill good">مفعّل</span> : <span className="pill">غير مفعّل</span>}</Row>
        <Row k="جلسات فعّالة">
          <Num n={sessions} />
        </Row>
        <Row k="تاريخ التسجيل">
          <span dir="ltr">{u.createdAt.toISOString().slice(0, 10)}</span>
        </Row>
      </div>

      <ActionForm action={adjustBalanceAction} className="card stack" resetOnOk>
        <input type="hidden" name="userId" value={u.id} />
        <b>تعديل الرصيد يدوياً</b>
        <div className="row wr">
          <input className="input num" name="coins" type="number" placeholder="مثال: 500 أو ‎-500" dir="ltr" style={{ flex: 1, minWidth: 120 }} aria-label="عدد الكوينز" />
          <input className="input" name="reason" placeholder="السبب (يظهر للمستخدم، بالإنجليزي)" dir="auto" style={{ flex: 2, minWidth: 180 }} maxLength={200} aria-label="السبب" />
          <Submit>تطبيق</Submit>
        </div>
      </ActionForm>

      <div className="row wr">
        {u.id !== me.id ? (
          <ActionForm action={setUserStatusAction}>
            <input type="hidden" name="userId" value={u.id} />
            <input type="hidden" name="status" value={u.status === "BANNED" ? "ACTIVE" : "BANNED"} />
            <Submit className={u.status === "BANNED" ? "btn good" : "btn bad"}>{u.status === "BANNED" ? "رفع الحظر" : "حظر الحساب"}</Submit>
          </ActionForm>
        ) : null}
        {u.flags.length || u.riskScore ? (
          <ActionForm action={clearFlagsAction}>
            <input type="hidden" name="userId" value={u.id} />
            <Submit className="btn ghost">مسح العلامات (موثوق)</Submit>
          </ActionForm>
        ) : null}
        {u.pending > 0 ? (
          <ActionForm action={releaseUserHoldsAction}>
            <input type="hidden" name="userId" value={u.id} />
            <Submit className="btn ghost">تحرير الرصيد المعلّق الآن</Submit>
          </ActionForm>
        ) : null}
        {u.id !== me.id ? (
          <ActionForm action={setRoleAction}>
            <input type="hidden" name="userId" value={u.id} />
            <input type="hidden" name="role" value={u.role === "ADMIN" ? "USER" : "ADMIN"} />
            <Submit className="btn ghost">{u.role === "ADMIN" ? "إزالة صلاحية المدير" : "جعله مدير"}</Submit>
          </ActionForm>
        ) : null}
      </div>

      <h2 style={{ fontSize: 18 }}>آخر الحركات</h2>
      {ledger.length ? (
        <div className="tablewrap">
          <table>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="small">{agoAr(l.createdAt)}</td>
                  <td className="small">
                    {KIND_AR[l.kind] ?? l.kind} · <span dir="ltr">{describe("en", l.description)}</span>
                  </td>
                  <td>
                    <span className="amt" dir="ltr" style={{ color: l.amount < 0 ? "var(--bad)" : "var(--good)" }}>
                      {l.amount > 0 ? "+" : ""}
                      {l.amount.toLocaleString("en-US")}
                    </span>
                  </td>
                  <td>{l.bucket === "PENDING" ? <span className="pill warn">{l.releasedAt ? "محرّر" : "معلّق"}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">ما في حركات.</p>
      )}

      {withdrawals.length ? (
        <>
          <h2 style={{ fontSize: 18 }}>السحوبات</h2>
          <div className="tablewrap">
            <table>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="small">{agoAr(w.createdAt)}</td>
                    <td dir="ltr">{METHOD_META[w.method as keyof typeof METHOD_META]?.name ?? w.method}</td>
                    <td>
                      <Usd cents={w.amountCents} />
                    </td>
                    <td>
                      <span className={`pill ${WITHDRAWAL_STATUS_AR[w.status]?.[1]}`}>{WITHDRAWAL_STATUS_AR[w.status]?.[0]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="row between wr">
      <span className="muted">{k}</span>
      <span>{children}</span>
    </div>
  );
}
