import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { db } from "@/lib/db";
import { ActionForm, Submit } from "@/components/forms";
import { reverseConversionAction } from "@/app/actions/admin";
import { Num, Usd, agoAr } from "@/components/admin-ui";
import type { ConversionStatus } from "@/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Postbacks" : "سجل التأكيدات" };
}

export default async function PostbacksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const ST: Record<ConversionStatus, [string, string]> = {
    CREDITED: [at("مؤكد", "Credited"), "good"],
    REVERSED: [at("مسترد", "Reversed"), "bad"],
    REJECTED: [at("مرفوض", "Rejected"), "warn"],
  };
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
          <h1>{at("سجل التأكيدات (Postbacks)", "Postback log")}</h1>
          <p className="small muted">{at("كل مرة الشبكة بتأكد إنو عضو خلص مهمة، بيوصل إشعار هون وبينضاف الرصيد تلقائيا. كل إشعار بيتحقق من التوقيع، والـ IP إذا محدد، وما بيتكرر نفس رقم العملية.", "Every verified network callback is recorded once per (network, txid) and credits the member automatically.")}</p>
        </div>
      </div>
      <div className="tabs">
        <a className={`tab ${!status ? "on" : ""}`} href="/admin/postbacks">
          {at("الكل", "All")}
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
              <th>{at("الوقت", "Time")}</th>
              <th>{at("الشبكة", "Network")}</th>
              <th>{at("العضو", "Member")}</th>
              <th>{at("العرض", "Offer")}</th>
              <th>{at("الإيراد", "Payout")}</th>
              <th>{at("للعضو", "Coins")}</th>
              <th>{at("الحالة", "Status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="small">{agoAr(c.createdAt, undefined, lang)}</td>
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
                      <Submit className="btn ghost sm">{at("استرداد", "Reverse")}</Submit>
                    </ActionForm>
                  ) : null}
                </td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td colSpan={8} className="empty">
                  {at("لسا ما وصل أي تأكيد.", "No postbacks yet.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="small muted">{at("زر «استرداد» تستخدمه لما الشبكة تسحب العمولة بعد التدقيق ولم ترسل إشعار استرداد بنفسها: بينخصم المبلغ من العضو ومن عمولة اللي دعاه، وبترتفع درجة خطورته.", "Use Reverse when a network deducts a conversion manually without sending a reversal postback.")}</p>
    </>
  );
}
