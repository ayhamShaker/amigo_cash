import type { Metadata, Viewport } from "next";
import { dirOf, LOCALES } from "@/i18n/config";
import { pageLocale, themeCookie } from "./locale";
import { getSettings } from "@/server/settings";
import { currentUser } from "@/server/session";
import { ChatWidget } from "@/components/chat-widget";
import { Logo, Icon } from "@/components/icons";
import { LangSwitch, ThemeToggle } from "@/components/client-controls";
import "../globals.css";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1016" },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale, t } = await pageLocale(params);
  return {
    title: { default: "Amigo Cash", template: "%s · Amigo Cash" },
    description: t("Pick a game or app, reach the goal, and the coins land in your balance as soon as the advertiser confirms it. Cash out from {min} in crypto or gift cards.", { min: "$1.00" }),
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])) },
    icons: { icon: "/icon.svg" },
    other: { "content-language": locale },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const [theme, settings, user] = await Promise.all([themeCookie(), getSettings(), currentUser()]);
  const maintenance = settings.maintenance && user?.role !== "ADMIN";

  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {maintenance ? (
          <>
            <header className="topbar">
              <div className="topbar-in">
                <Logo href={`/${locale}`} />
                <div className="grow" />
                <LangSwitch current={locale} label={t("Language")} />
                <ThemeToggle initial={theme} labels={{ toDark: t("Switch to dark mode"), toLight: t("Switch to light mode") }} />
              </div>
            </header>
            <main className="maint">
              <div className="stack" style={{ alignItems: "center", maxWidth: 440 }}>
                <div className="chest-ico">
                  <Icon name="sliders" />
                </div>
                <h1 style={{ fontSize: 34 }}>{t("We're making Amigo Cash better")}</h1>
                <p className="muted">{t("Scheduled maintenance is under way. Your balance and pending rewards are safe. Please check back shortly.")}</p>
              </div>
            </main>
          </>
        ) : (
          <>
            {settings.bannerEnabled && settings.bannerText[locale] ? <div className="banner">{settings.bannerText[locale]}</div> : null}
            {children}
            <ChatWidget
              locale={locale}
              signedIn={!!user}
              labels={{
                open: t("Open live chat"),
                title: t("Live support"),
                online: t("Online · usually replies in 2 min"),
                close: t("Close chat"),
                greeting: t("Hi! How can we help you today?"),
                support: t("Support"),
                name: t("Your name"),
                email: t("Your email"),
                why: t("So we can email you the answer if you leave."),
                start: t("Start chat"),
                placeholder: t("Type a message…"),
                send: t("Send"),
                emailed: t("Also sent to your email"),
                error: t("Your message was not sent. Check your connection and try again."),
                nameError: t("Enter a display name with at least 2 characters."),
                emailError: t("Enter a valid email address, like you@email.com."),
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}
