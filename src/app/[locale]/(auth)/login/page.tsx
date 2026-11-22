import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageLocale, pwLabels } from "../../locale";
import { ActionForm, PasswordInput, Submit } from "@/components/forms";
import { loginAction } from "@/app/actions/auth";
import { currentUser } from "@/server/session";
import { safeNextPublic } from "@/lib/next-url";
import { GoogleMark } from "@/components/google-mark";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const sp = await searchParams;
  const next = safeNextPublic(sp.next, locale);
  if (await currentUser()) redirect(next);
  const googleMsg: Record<string, string> = {
    off: t("Google sign-in is not set up yet. Use your email and password."),
    failed: t("Google sign-in did not finish. Try again."),
    unverified: t("Your Google email is not verified. Verify it with Google or use email sign-up."),
    closed: t("New registrations are closed for a short while. Please try again later."),
    vpn: t("Turn off your VPN or proxy to create an account."),
    device: t("An account already exists on this device. Log in to that account instead."),
    banned: t("This account is suspended. Contact support for details."),
  };
  return (
    <div className="authcard card stack">
      <h1>{t("Welcome back")}</h1>
      {sp.reset ? <div className="formmsg good">{t("Password updated. Log in with your new password.")}</div> : null}
      {sp.google && googleMsg[sp.google] ? <div className="formmsg bad">{googleMsg[sp.google]}</div> : null}
      <a className="btn ghost block" href={`/api/auth/google/start?locale=${locale}`}>
        <GoogleMark />
        {t("Continue with Google")}
      </a>
      <div className="orline">
        <span />
        <span className="tiny muted">{t("or with email")}</span>
        <span />
      </div>
      <ActionForm action={loginAction} locale={locale} className="stack">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="f-email">{t("Email")}</label>
          <input className="input" id="f-email" name="email" type="email" dir="ltr" autoComplete="email" required maxLength={254} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <div className="field">
          <div className="row between">
            <label htmlFor="f-pass">{t("Password")}</label>
            <a className="small" href={`/${locale}/forgot-password`}>
              {t("Forgot password?")}
            </a>
          </div>
          <PasswordInput id="f-pass" name="password" autoComplete="current-password" labels={pwLabels(t)} />
        </div>
        <Submit className="btn primary block lg">{t("Log in")}</Submit>
      </ActionForm>
      <p className="small muted center">
        {t("New here?")} <a href={`/${locale}/signup`}>{t("Create an account")}</a>
      </p>
    </div>
  );
}
