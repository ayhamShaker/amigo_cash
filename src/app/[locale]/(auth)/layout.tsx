import { pageLocale, themeCookie } from "../locale";
import { SiteHeader } from "@/components/site-header";
import { currentUser } from "@/server/session";

export default async function AuthLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const [theme, user] = await Promise.all([themeCookie(), currentUser()]);
  return (
    <>
      <SiteHeader locale={locale} t={t} theme={theme} signedIn={!!user} links={false} />
      <main className="authwrap">{children}</main>
    </>
  );
}
