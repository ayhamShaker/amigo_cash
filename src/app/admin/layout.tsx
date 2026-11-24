import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireAdminPage } from "@/server/admin-guard";
import { adminLang, makeAt } from "@/server/admin-lang";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { Icon, Logo } from "@/components/icons";
import { SideNav, type NavItem } from "@/components/nav";
import { ThemeToggle } from "@/components/client-controls";
import { AdminLangToggle } from "@/components/admin-lang-toggle";
import { AdminLive } from "@/components/admin-live";
import "../globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await adminLang();
  return {
    title: lang === "en" ? { default: "Admin Panel", template: "%s · Amigo Cash Admin" } : { default: "لوحة الإدارة", template: "%s · إدارة Amigo Cash" },
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, lang] = await Promise.all([requireAdminPage(), adminLang()]);
  const at = makeAt(lang);
  const [pendingW, waitingChats, settings] = await Promise.all([
    db.withdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    db.chatConversation.count({ where: { unreadAdmin: { gt: 0 } } }),
    getSettings(),
  ]);
  const t = (await cookies()).get("amigo_theme")?.value;
  const theme = t === "dark" || t === "light" ? t : "system";
  const items: NavItem[] = [
    { href: "/admin/overview", label: at("نظرة عامة", "Overview"), icon: "grid" },
    { href: "/admin/users", label: at("المستخدمون", "Users"), icon: "users" },
    { href: "/admin/withdrawals", label: at("السحوبات", "Withdrawals"), icon: "wallet", badge: pendingW },
    { href: "/admin/offers", label: at("العروض", "Offers"), icon: "game" },
    { href: "/admin/networks", label: at("شبكات العروض", "Networks"), icon: "plug" },
    { href: "/admin/postbacks", label: at("سجل التأكيدات", "Postbacks"), icon: "inbox" },
    { href: "/admin/fraud", label: at("مكافحة الاحتيال", "Fraud & Rules"), icon: "shield" },
    { href: "/admin/marketing", label: at("التسويق", "Marketing"), icon: "star" },
    { href: "/admin/methods", label: at("طرق السحب", "Cash-out Methods"), icon: "wallet" },
    { href: "/admin/contest", label: at("المسابقة الأسبوعية", "Weekly Contest"), icon: "trophy" },
    { href: "/admin/promos", label: at("أكواد المكافآت", "Promo Codes"), icon: "tag" },
    { href: "/admin/chat", label: at("الدعم المباشر", "Live Support"), icon: "chat", badge: waitingChats },
    { href: "/admin/settings", label: at("إعدادات الموقع", "Settings"), icon: "sliders" },
    { href: "/admin/audit", label: at("سجل العمليات", "Audit Log"), icon: "file" },
  ];
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Figtree:wght@400;500;600;700;800&display=swap" />
      </head>
      <body className="admin">
        <header className="topbar">
          <div className="topbar-in">
            <Logo href="/admin/overview" />
            <span className="pill accent">{at("لوحة الإدارة", "Admin")}</span>
            <div className="grow" />
            {settings.maintenance ? <span className="pill warn">{at("وضع الصيانة مفعل", "Maintenance ON")}</span> : null}
            <AdminLangToggle current={lang} />
            <ThemeToggle initial={theme} labels={{ toDark: at("الوضع الداكن", "Dark mode"), toLight: at("الوضع الفاتح", "Light mode") }} />
            <a className="btn sm topghost" href={`/${lang}`}>
              <Icon name="eye" />
              <span className="hide-sm">{at("عرض الموقع", "View site")}</span>
            </a>
          </div>
        </header>
        <div className="shell">
          <nav className="side" aria-label={at("لوحة الإدارة", "Admin Panel")}>
            <SideNav items={items} lockLabel="" />
            <div className="sep" />
            <div className="tiny muted" style={{ padding: "0 12px" }}>
              {at("مسجل كمدير:", "Signed in as:")} <span dir="ltr">{admin.email}</span>
            </div>
          </nav>
          <main className="main">
            <div className="main-in">
              <nav className="adminnav" aria-label={at("لوحة الإدارة", "Admin Panel")}>
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
