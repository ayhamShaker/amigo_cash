import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { db } from "@/lib/db";
import { ActionForm, Submit } from "@/components/forms";
import { reverseConversionAction } from "@/app/actions/admin";
import { Num, Usd, agoAr } from "@/components/admin-ui";
import type { ConversionStatus } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "سجل التأكيدات" };

const ST: Record<ConversionStatus, [string, string]> = { CREDITED: ["مؤكد", "good"], REVERSED: ["مسترد", "bad"], REJECTED: ["مرفوض", "warn"] };

export default async function PostbacksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = sp.s && sp.s in ST ? (sp.s as ConversionStatus) : undefined;
  const list = await db.conversion.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true } }, network: { select: { name: true } } },
  });
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>سجل التأكيدات (Postbacks)</h1>
          <p className="small muted">كل مرة الشبكة بتأكد إنو عضو خلص مهمة، بيوصل إشعار هون وبينضاف الرصيد تلقائيا. كل إشعار بيتحقق من التوقيع، والـ IP إذا محدد، وما بيتكرر نفس رقم العملية.</p>
        </div>
      </div>
      <div className="tabs">
        <a className={`tab ${!status ? "on" : ""}`} href="/admin/postbacks">
          الكل
        </a>
        {Object.entries(ST).map(([k, [l]]) => (
          <a key={k} className={`tab ${status === k ? "on" : ""}`} href={`/admin/postbacks?s=${k}`}>
            {l}
          </a>
        ))}
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>الشبكة</th>
              <th>العضو</th>
              <th>العرض</th>
              <th>الإيراد</th>
              <th>للعضو</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="small">{agoAr(c.createdAt)}</td>
                <td dir="ltr">{c.network.name}</td>
                <td>{c.user ? <a href={`/admin/users/${c.user.id}`}>{c.user.name}</a> : "—"}</td>
                <td className="small" dir="ltr">
                  {c.offerName}
                  <div className="tiny muted">tx {c.txid}</div>
                </td>
                <td>
                  <Usd cents={c.payoutCents} />
                </td>
                <td>
                  <Num n={c.coins} />
                </td>
                <td>
                  <span className={`pill ${ST[c.status][1]}`}>{ST[c.status][0]}</span>
                  {c.reason ? <div className="tiny muted">{c.reason}</div> : null}
                </td>
                <td>
                  {c.status === "CREDITED" ? (
                    <ActionForm action={reverseConversionAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <Submit className="btn ghost sm">استرداد</Submit>
                    </ActionForm>
                  ) : null}
                </td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td colSpan={8} className="empty">
                  لسا ما وصل أي تأكيد.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="small muted">زر «استرداد» تستخدمه لما الشبكة تسحب العمولة بعد التدقيق ولم ترسل إشعار استرداد بنفسها: بينخصم المبلغ من العضو ومن عمولة اللي دعاه، وبترتفع درجة خطورته.</p>
    </>
  );
}
