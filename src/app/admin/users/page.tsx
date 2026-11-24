import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { daysAgo } from "@/lib/time";
import { db } from "@/lib/db";
import { Num, Risk } from "@/components/admin-ui";
import type { Prisma } from "@/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return { title: lang === "en" ? "Users" : "المستخدمون" };
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const FILTERS = {
    all: at("الكل", "All"),
    flagged: at("مشبوهون", "Flagged"),
    banned: at("محظورون", "Banned"),
    new: at("جدد (7 أيام)", "New (7d)"),
    admins: at("المدراء", "Admins"),
  } as const;
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
          <h1>{at("المستخدمون", "Users")}</h1>
          <p className="small muted">
            <Num n={total} /> {at("حساب · اضغط على أي مستخدم للتفاصيل والتحكم", "accounts · click any member to inspect and manage")}
          </p>
        </div>
      </div>
      <div className="row wr">
        <form className="grow" style={{ minWidth: 220 }} action="/admin/users">
          <input type="hidden" name="f" value={f} />
          <input className="input" name="q" defaultValue={q} placeholder={at("ابحث بالاسم أو الإيميل أو الـ IP أو كود الإحالة…", "Search by name, email, IP, or referral code…")} aria-label={at("بحث", "Search")} />
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
              <th>{at("المستخدم", "Member")}</th>
              <th>{at("الدولة", "Country")}</th>
              <th>{at("الرصيد", "Balance")}</th>
              <th className="hide-sm">{at("مدى الحياة", "Lifetime")}</th>
              <th>{at("الخطورة", "Risk")}</th>
              <th>{at("الحالة", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {users.length ? (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <a href={`/admin/users/${u.id}`} style={{ textDecoration: "none" }}>
                      <b>{u.name}</b> {u.role === "ADMIN" ? <span className="pill accent">{at("مدير", "Admin")}</span> : null}
                      <div className="tiny muted" dir="ltr" style={{ textAlign: "start" }}>
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
                  <td>{u.status === "BANNED" ? <span className="pill bad">{at("محظور", "Banned")}</span> : <span className="pill good">{at("نشط", "Active")}</span>}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty">
                  {at("ما في نتائج", "No results")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
