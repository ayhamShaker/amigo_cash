import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageLocale } from "../../locale";
import { ActionForm, Submit } from "@/components/forms";
import { twoFactorLoginAction } from "@/app/actions/auth";
import { hasPendingLogin } from "@/server/session";
import { Icon } from "@/components/icons";
import { safeNextPublic } from "@/lib/next-url";

export const metadata: Metadata = { title: "Two-step verification", robots: { index: false } };

export default async function TwoFactorPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const sp = await searchParams;
  if (!(await hasPendingLogin())) redirect(`/${locale}/login`);
  return (
    <div className="authcard card stack">
      <h1>{t("Two-step verification")}</h1>
      <div className="note">
        <Icon name="shield" />
        <span>{t("Enter the 6-digit code from Google Authenticator.")}</span>
      </div>
      <ActionForm action={twoFactorLoginAction} locale={locale} className="stack">
        <input type="hidden" name="next" value={safeNextPublic(sp.next, locale)} />
        <div className="field">
          <label htmlFor="l2-code">{t("Authenticator code")}</label>
          <input className="input num otp" id="l2-code" name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" placeholder="123456" maxLength={12} autoFocus />
        </div>
        <div className="tiny muted">{t("Or use one of your backup codes.")}</div>
        <Submit className="btn primary block lg">{t("Verify")}</Submit>
      </ActionForm>
    </div>
  );
}
