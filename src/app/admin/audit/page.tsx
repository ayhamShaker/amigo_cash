import type { Metadata } from "next";
import { db } from "@/lib/db";
import { agoAr } from "@/components/admin-ui";

export const metadata: Metadata = { title: "سجل العمليات" };

export default async function AuditPage() {
  const rows = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true } } } });
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>سجل العمليات</h1>
          <p className="small muted">كل تعديل على الأرصدة والسحوبات والإعدادات والمستخدمين بينسجل هون مع الوقت والـ IP. ما حدا بيقدر يعدّله من اللوحة.</p>
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>من</th>
              <th>العملية</th>
              <th>الهدف</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{agoAr(r.createdAt)}</td>
                <td>{r.actor?.name ?? "النظام"}</td>
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
                  ما في عمليات لسا.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
