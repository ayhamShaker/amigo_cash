import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireAdminPage } from "@/server/admin-guard";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { Icon, Logo } from "@/components/icons";
import { SideNav, type NavItem } from "@/components/nav";
import { ThemeToggle } from "@/components/client-controls";
import { AdminLive } from "@/components/admin-live";
import "../globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "لوحة الإدارة", template: "%s · إدارة Amigo Cash" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const [pendingW, waitingChats, settings] = await Promise.all([
    db.withdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    db.chatConversation.count({ where: { unreadAdmin: { gt: 0 } } }),
    getSettings(),
  ]);
  const t = (await cookies()).get("amigo_theme")?.value;
  const theme = t === "dark" || t === "light" ? t : "system";
  const items: NavItem[] = [
    { href: "/admin/overview", label: "نظرة عامة", icon: "grid" },
    { href: "/admin/users", label: "المستخدمون", icon: "users" },
    { href: "/admin/withdrawals", label: "السحوبات", icon: "wallet", badge: pendingW },
    { href: "/admin/offers", label: "العروض", icon: "game" },
    { href: "/admin/networks", label: "شبكات العروض", icon: "plug" },
    { href: "/admin/postbacks", label: "سجل التأكيدات", icon: "inbox" },
    { href: "/admin/fraud", label: "مكافحة الاحتيال", icon: "shield" },
    { href: "/admin/methods", label: "طرق السحب", icon: "wallet" },
    { href: "/admin/promos", label: "أكواد المكافآت", icon: "tag" },
    { href: "/admin/chat", label: "الدعم المباشر", icon: "chat", badge: waitingChats },
    { href: "/admin/settings", label: "إعدادات الموقع", icon: "sliders" },
    { href: "/admin/audit", label: "سجل العمليات", icon: "file" },
  ];
  return (
    <html lang="ar" dir="rtl" data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Bricolage+Grotesque:opsz,wght@12..96,800&display=swap" />
      </head>
      <body className="admin">
        <header className="topbar">
          <div className="topbar-in">
            <Logo href="/admin/overview" />
            <span className="pill accent">لوحة الإدارة</span>
            <div className="grow" />
            {settings.maintenance ? <span className="pill warn">وضع الصيانة مفعّل</span> : null}
            <ThemeToggle initial={theme} labels={{ toDark: "الوضع الداكن", toLight: "الوضع الفاتح" }} />
            <a className="btn sm topghost" href="/ar">
              <Icon name="eye" />
              <span className="hide-sm">عرض الموقع</span>
            </a>
          </div>
        </header>
        <div className="shell">
          <nav className="side" aria-label="لوحة الإدارة">
            <SideNav items={items} lockLabel="" />
            <div className="sep" />
            <div className="tiny muted" style={{ padding: "0 12px" }}>
              مسجّل كمدير: <span dir="ltr">{admin.email}</span>
            </div>
          </nav>
          <main className="main">
            <div className="main-in">
              <nav className="adminnav" aria-label="لوحة الإدارة">
                <SideNav items={items} lockLabel="" />
              </nav>
              {children}
            </div>
          </main>
        </div>
        <AdminLive />
      </body>
    </html>
  );
}
