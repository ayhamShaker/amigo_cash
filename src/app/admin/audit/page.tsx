import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { db } from "@/lib/db";
import { agoAr } from "@/components/admin-ui";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Audit Log" : "سجل العمليات" };
}

export default async function AuditPage() {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const rows = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true } } } });
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{at("سجل العمليات", "Audit log")}</h1>
          <p className="small muted">{at("كل تعديل على الأرصدة والسحوبات والإعدادات والمستخدمين بينسجل هون مع الوقت والـ IP. ما حدا بيقدر يعدله من اللوحة.", "Every admin change to balances, withdrawals, settings, and users is recorded with timestamp and IP.")}</p>
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>{at("الوقت", "Time")}</th>
              <th>{at("من", "Actor")}</th>
              <th>{at("العملية", "Action")}</th>
              <th>{at("الهدف", "Target")}</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{agoAr(r.createdAt, undefined, lang)}</td>
                <td>{r.actor?.name ?? at("النظام", "System")}</td>
                <td className="small" dir="ltr">
                  {r.action}
                </td>
                <td className="small" dir="ltr">
                  {r.targetType === "user" && r.targetId ? <a href={`/admin/users/${r.targetId}`}>{r.targetId.slice(0, 10)}</a> : r.targetId ? `${r.targetType}:${r.targetId.slice(0, 12)}` : "—"}
                </td>
                <td className="small num" dir="ltr">
                  {r.ip ?? "—"}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="empty">
                  {at("ما في عمليات لسا.", "No audit logs yet.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
