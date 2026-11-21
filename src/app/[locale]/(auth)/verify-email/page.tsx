import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { verifyEmail } from "@/server/auth";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false }, referrer: "no-referrer" };

export default async function VerifyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const { token = "" } = await searchParams;
  const ok = token ? await verifyEmail(token) : false;
  return (
    <div className="authcard card stack" style={{ alignItems: "flex-start" }}>
      <span className="chest-ico" style={{ width: 56, height: 56, background: ok ? "var(--good-soft)" : "var(--bad-soft)", color: ok ? "var(--good)" : "var(--bad)", boxShadow: "none" }}>
        <Icon name={ok ? "check" : "x"} />
      </span>
      <h1>{ok ? t("Email confirmed") : t("This link has expired")}</h1>
      <p className="muted">{ok ? t("Thanks! You can now cash out once you reach the minimum.") : t("Open your account page and send a new confirmation link.")}</p>
      <a className="btn primary" href={`/${locale}/${ok ? "earn" : "account"}`}>
        {ok ? t("Start earning") : t("Account")}
      </a>
    </div>
  );
}
