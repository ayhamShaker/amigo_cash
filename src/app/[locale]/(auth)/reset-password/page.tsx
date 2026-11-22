import type { Metadata } from "next";
import { pageLocale, pwLabels } from "../../locale";
import { ActionForm, PasswordInput, Submit } from "@/components/forms";
import { resetPasswordAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const { token = "" } = await searchParams;
  return (
    <div className="authcard card stack">
      <h1>{t("Choose a new password")}</h1>
      <ActionForm action={resetPasswordAction} locale={locale} className="stack">
        <input type="hidden" name="token" value={token.slice(0, 200)} />
        <div className="field">
          <label htmlFor="rp-new">{t("New password")}</label>
          <PasswordInput id="rp-new" name="password" autoComplete="new-password" placeholder={t("At least 8 characters")} labels={pwLabels(t)} />
        </div>
        <div className="field">
          <label htmlFor="rp-rep">{t("Repeat new password")}</label>
          <PasswordInput id="rp-rep" name="repeat" autoComplete="new-password" labels={pwLabels(t)} />
        </div>
        <Submit className="btn primary block">{t("Update password")}</Submit>
      </ActionForm>
    </div>
  );
}
