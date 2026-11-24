import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { ActionForm, Submit } from "@/components/forms";
import { ResetLinkForm } from "@/components/reset-link";
import { adjustBalanceAction, clearFlagsAction, confirmEmailAction, passwordResetLinkAction, releaseUserHoldsAction, resetTwoFactorAction, setRoleAction, setUserStatusAction } from "@/app/actions/admin";
import { Num, Risk, Usd, agoAr, withdrawalStatusLabel } from "@/components/admin-ui";
import { coinsToCents } from "@/lib/money";
import { describe } from "@/i18n/t";
import { methodName } from "@/lib/methods";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Member Profile" : "ملف المستخدم" };
}

const KIND_AR: Record<string, string> = {
  WELCOME: "ترحيب", OFFER: "عرض", SURVEY: "استبيان", BONUS: "صندوق يومي", REFERRAL: "إحالة", INVITE_BONUS: "مكافأة دعوة", PROMO: "كود",
  CONTEST: "مسابقة", ADJUST: "تعديل يدوي", WITHDRAWAL: "سحب", REFUND: "استرجاع", REVERSAL: "استرداد", RELEASE: "تحرير",
};

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const [me, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id: id.slice(0, 40) }, include: { referredBy: { select: { id: true, name: true } }, creator: { select: { name: true, slug: true } }, _count: { select: { referrals: true } } } });
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
        {lang === "en" ? "← Users" : "→ المستخدمون"}
      </a>
      <div className="pagehead">
        <div>
          <h1>{u.name}</h1>
          <div className="row wr" style={{ marginTop: 6 }}>
            {u.status === "BANNED" ? <span className="pill bad">{at("محظور", "Banned")}</span> : <span className="pill good">{at("نشط", "Active")}</span>}
            {u.role === "ADMIN" ? <span className="pill accent">{at("مدير", "Admin")}</span> : null}
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
          <div className="k">{at("الرصيد المتاح", "Available balance")}</div>
          <div className="v">
            <Num n={u.balance} />
          </div>
          <div className="d muted">
            <Usd cents={coinsToCents(u.balance, settings.coinsPerUsd)} />
          </div>
        </div>
        <div className="kpi">
          <div className="k">{at("معلق", "Pending")}</div>
          <div className="v">
            <Num n={u.pending} />
          </div>
        </div>
        <div className="kpi">
          <div className="k">{at("مدى الحياة", "Lifetime earned")}</div>
          <div className="v">
            <Num n={u.lifetimeEarned} />
          </div>
        </div>
      </div>
      <div className="card stack" style={{ gap: 8, fontSize: 14 }}>
        <Row k={at("البريد", "Email")}>
          <span dir="ltr">{u.email}</span> {u.emailVerifiedAt ? <span className="pill good">{at("مؤكد", "Verified")}</span> : <span className="pill warn">{at("غير مؤكد", "Unverified")}</span>}
        </Row>
        <Row k={at("جاي من", "Source")}>
          <span dir="ltr">
            {u.creator ? `creator: ${u.creator.name} (/c/${u.creator.slug})` : (u.source ?? "direct")}
            {u.campaign && !u.creator ? ` · ${u.campaign}` : ""}
            {u.refHost ? ` · ${u.refHost}` : ""}
          </span>
        </Row>
        <Row k={at("IP التسجيل", "Sign-up IP")}>
          <span className="num" dir="ltr">
            {u.signupIp ?? "—"}
          </span>
        </Row>
        <Row k={at("الأجهزة", "Devices")}>
          <span className="num" dir="ltr">
            {deviceIds.length ? deviceIds.map((d) => d.slice(0, 8)).join(", ") : "—"}
          </span>
        </Row>
        <Row k={at("حسابات مرتبطة (نفس الجهاز أو الـ IP)", "Linked accounts (shared device / IP)")}>
          {linked.length ? (
            <span>
              {linked.map((l, i) => (
                <span key={l.id}>
                  {i ? ", " : ""}
                  <a href={`/admin/users/${l.id}`}>{l.name}</a>
                  {l.status === "BANNED" ? at(" (محظور)", " (banned)") : ""}
                </span>
              ))}
            </span>
          ) : (
            <span className="pill good">{at("لا يوجد", "None")}</span>
          )}
        </Row>
        <Row k={at("محال من", "Referred by")}>
          {u.referredBy ? <a href={`/admin/users/${u.referredBy.id}`}>{u.referredBy.name}</a> : "—"} · {at("دعا", "invited")} {u._count.referrals}
        </Row>
        <Row k={at("درجة الخطورة", "Risk score")}>
          <Risk score={u.riskScore} />
        </Row>
        <Row k={at("طريقة الدخول", "Sign-in method")}>
          {u.passwordHash ? at("إيميل وكلمة مرور", "Email & password") : <span className="pill warn">{at("Google فقط (بدون كلمة مرور)", "Google only")}</span>}
        </Row>
        <Row k={at("التحقق بخطوتين", "Two-factor (2FA)")}>
          {u.totpEnabled ? <span className="pill good">{at("مفعل", "Enabled")}</span> : <span className="pill">{at("غير مفعل", "Off")}</span>}
        </Row>
        <Row k={at("جلسات فعالة", "Active sessions")}>
          <Num n={sessions} />
        </Row>
        <Row k={at("تاريخ التسجيل", "Joined")}>
          <span dir="ltr">{u.createdAt.toISOString().slice(0, 10)}</span>
        </Row>
      </div>

      <ActionForm action={adjustBalanceAction} className="card stack" resetOnOk>
        <input type="hidden" name="userId" value={u.id} />
        <b>{at("تعديل الرصيد يدويا", "Manual balance adjustment")}</b>
        <div className="row wr">
          <input className="input num" name="coins" type="number" placeholder={at("مثال: 500 أو -500", "e.g. 500 or -500")} dir="ltr" style={{ flex: 1, minWidth: 120 }} aria-label="Coins" />
          <input className="input" name="reason" placeholder={at("السبب (يظهر للمستخدم، بالإنجليزي)", "Reason (shown to member)")} dir="auto" style={{ flex: 2, minWidth: 180 }} maxLength={200} aria-label="Reason" />
          <Submit>{at("تطبيق", "Apply")}</Submit>
        </div>
      </ActionForm>

      <div className="row wr">
        {u.id !== me.id ? (
          <ActionForm action={setUserStatusAction}>
            <input type="hidden" name="userId" value={u.id} />
            <input type="hidden" name="status" value={u.status === "BANNED" ? "ACTIVE" : "BANNED"} />
            <Submit className={u.status === "BANNED" ? "btn good" : "btn bad"}>{u.status === "BANNED" ? at("رفع الحظر", "Unban account") : at("حظر الحساب", "Ban account")}</Submit>
          </ActionForm>
        ) : null}
        {!u.emailVerifiedAt ? (
          <ActionForm action={confirmEmailAction}>
            <input type="hidden" name="userId" value={u.id} />
            <Submit className="btn ghost">{at("تأكيد الإيميل يدويا", "Verify email manually")}</Submit>
          </ActionForm>
        ) : null}
        {u.flags.length || u.riskScore ? (
          <ActionForm action={clearFlagsAction}>
            <input type="hidden" name="userId" value={u.id} />
            <Submit className="btn ghost">{at("مسح العلامات (موثوق)", "Clear flags (trust)")}</Submit>
          </ActionForm>
        ) : null}
        {u.pending > 0 ? (
          <ActionForm action={releaseUserHoldsAction}>
            <input type="hidden" name="userId" value={u.id} />
            <Submit className="btn ghost">{at("تحرير الرصيد المعلق الآن", "Release pending holds now")}</Submit>
          </ActionForm>
        ) : null}
        {u.id !== me.id ? (
          <ActionForm action={setRoleAction}>
            <input type="hidden" name="userId" value={u.id} />
            <input type="hidden" name="role" value={u.role === "ADMIN" ? "USER" : "ADMIN"} />
            <Submit className="btn ghost">{u.role === "ADMIN" ? at("إزالة صلاحية المدير", "Remove admin") : at("جعله مدير", "Make admin")}</Submit>
          </ActionForm>
        ) : null}
      </div>

      {u.id !== me.id ? <ResetLinkForm action={passwordResetLinkAction} userId={u.id} /> : null}

      {u.totpEnabled && u.id !== me.id ? (
        <ActionForm action={resetTwoFactorAction} className="card row wr">
          <input type="hidden" name="userId" value={u.id} />
          <span className="grow small">
            <b>{at("العضو ضيع موبايله؟", "Lost authenticator phone?")}</b>{" "}
            {at("تأكد من هويته أولا، بعدين اكتب RESET لإلغاء التحقق بخطوتين:", "Verify their identity first, then type RESET to disable 2FA:")}
          </span>
          <input className="input num" name="confirm" dir="ltr" style={{ width: 120 }} aria-label="RESET" />
          <Submit className="btn bad">{at("إلغاء التحقق بخطوتين", "Reset 2FA")}</Submit>
        </ActionForm>
      ) : null}

      <h2 style={{ fontSize: 18 }}>{at("آخر الحركات", "Recent ledger entries")}</h2>
      {ledger.length ? (
        <div className="tablewrap">
          <table>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="small">{agoAr(l.createdAt, undefined, lang)}</td>
                  <td className="small">
                    {lang === "en" ? l.kind : (KIND_AR[l.kind] ?? l.kind)} · <span dir="ltr">{describe("en", l.description)}</span>
                  </td>
                  <td>
                    <span className="amt" dir="ltr" style={{ color: l.amount < 0 ? "var(--bad)" : "var(--good)" }}>
                      {l.amount > 0 ? "+" : ""}
                      {l.amount.toLocaleString("en-US")}
                    </span>
                  </td>
                  <td>{l.bucket === "PENDING" ? <span className="pill warn">{l.releasedAt ? at("محرر", "Released") : at("معلق", "Pending")}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">{at("ما في حركات.", "No ledger entries.")}</p>
      )}

      {withdrawals.length ? (
        <>
          <h2 style={{ fontSize: 18 }}>{at("السحوبات", "Withdrawals")}</h2>
          <div className="tablewrap">
            <table>
              <tbody>
                {withdrawals.map((w) => {
                  const [stLabel, stCls] = withdrawalStatusLabel(w.status, lang);
                  return (
                    <tr key={w.id}>
                      <td className="small">{agoAr(w.createdAt, undefined, lang)}</td>
                      <td dir="ltr">{methodName(settings.methods, w.method)}</td>
                      <td>
                        <Usd cents={w.amountCents} />
                      </td>
                      <td>
                        <span className={`pill ${stCls}`}>{stLabel}</span>
                      </td>
                    </tr>
                  );
                })}
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
