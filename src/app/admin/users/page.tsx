import type { Metadata } from "next";
import { daysAgo } from "@/lib/time";
import { db } from "@/lib/db";
import { Num, Risk } from "@/components/admin-ui";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "المستخدمون" };

const FILTERS = { all: "الكل", flagged: "مشبوهون", banned: "محظورون", new: "جدد (7 أيام)", admins: "المدراء" } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const f = (sp.f ?? "all") in FILTERS ? (sp.f as keyof typeof FILTERS) : "all";
  const conditions: Prisma.UserWhereInput[] = [];
  if (q) conditions.push({ OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { id: q }, { signupIp: q }, { refCode: q.toUpperCase() }] });
  if (f === "flagged") conditions.push({ OR: [{ riskScore: { gte: 50 } }, { flags: { isEmpty: false } }] });
  if (f === "banned") conditions.push({ status: "BANNED" });
  if (f === "new") conditions.push({ createdAt: { gte: daysAgo(7) } });
  if (f === "admins") conditions.push({ role: "ADMIN" });
  const where: Prisma.UserWhereInput = { AND: conditions };
  const [users, total] = await Promise.all([db.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }), db.user.count({ where })]);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>المستخدمون</h1>
          <p className="small muted">
            <Num n={total} /> حساب · اضغط على أي مستخدم للتفاصيل والتحكم
          </p>
        </div>
      </div>
      <div className="row wr">
        <form className="grow" style={{ minWidth: 220 }} action="/admin/users">
          <input type="hidden" name="f" value={f} />
          <input className="input" name="q" defaultValue={q} placeholder="ابحث بالاسم أو الإيميل أو الـ IP أو كود الإحالة…" aria-label="بحث" />
        </form>
        <div className="tabs">
          {Object.entries(FILTERS).map(([k, l]) => (
            <a key={k} className={`tab ${f === k ? "on" : ""}`} href={`/admin/users?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
              {l}
            </a>
          ))}
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>الدولة</th>
              <th>الرصيد</th>
              <th className="hide-sm">مدى الحياة</th>
              <th>الخطورة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {users.length ? (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <a href={`/admin/users/${u.id}`} style={{ textDecoration: "none" }}>
                      <b>{u.name}</b> {u.role === "ADMIN" ? <span className="pill accent">مدير</span> : null}
                      <div className="tiny muted" dir="ltr" style={{ textAlign: "right" }}>
                        {u.email}
                      </div>
                    </a>
                  </td>
                  <td>
                    <span className="cc">{u.country}</span>
                  </td>
                  <td>
                    <Num n={u.balance} />
                  </td>
                  <td className="hide-sm">
                    <Num n={u.lifetimeEarned} />
                  </td>
                  <td>
                    <Risk score={u.riskScore} />
                    {u.flags.map((fl) => (
                      <span key={fl} className="pill bad" style={{ marginInlineStart: 4 }}>
                        {fl}
                      </span>
                    ))}
                  </td>
                  <td>{u.status === "BANNED" ? <span className="pill bad">محظور</span> : <span className="pill good">نشط</span>}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty">
                  ما في نتائج
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
