import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { ActionForm, Submit } from "@/components/forms";
import { forgotPasswordAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ForgotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  return (
    <div className="authcard card stack">
      <h1>{t("Reset your password")}</h1>
      <p className="small muted">{t("Enter your email and we will send you a reset link.")}</p>
      <ActionForm action={forgotPasswordAction} locale={locale} className="stack">
        <div className="field">
          <label htmlFor="fg-email">{t("Email")}</label>
          <input className="input" id="fg-email" name="email" type="email" dir="ltr" autoComplete="email" maxLength={254} placeholder="you@email.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <Submit className="btn primary block">{t("Send reset link")}</Submit>
      </ActionForm>
      <p className="small muted center">
        <a href={`/${locale}/login`}>{t("Log in")}</a>
      </p>
    </div>
  );
}
