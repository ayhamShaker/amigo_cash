import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { pageLocale, pwLabels } from "../../locale";
import { ActionForm, PasswordInput, Submit } from "@/components/forms";
import { signupAction } from "@/app/actions/auth";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { GoogleMark } from "@/components/google-mark";
import { COUNTRIES } from "@/lib/countries";
import { intlTag } from "@/i18n/config";

export const metadata: Metadata = { title: "Sign up", robots: { index: false } };

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  if (await currentUser()) redirect(`/${locale}/earn`);
  const settings = await getSettings();
  const ref = (await cookies()).get("amigo_ref")?.value ?? "";
  const names = new Intl.DisplayNames([intlTag(locale)], { type: "region" });
  const countries = COUNTRIES.map((c) => ({ c, n: names.of(c) ?? c })).sort((a, b) => a.n.localeCompare(b.n, intlTag(locale)));
  const defaultCountry = locale === "es" ? "AR" : "US";

  if (!settings.registrationOpen) {
    return (
      <div className="authcard card stack">
        <h1>{t("Sign-ups are paused")}</h1>
        <p className="muted">{t("New registrations are closed for a short while. Please try again later.")}</p>
      </div>
    );
  }

  return (
    <div className="authcard card stack">
      <h1>{t("Create your account")}</h1>
      <a className="btn ghost block" href={`/api/auth/google/start?locale=${locale}`}>
        <GoogleMark />
        {t("Continue with Google")}
      </a>
      <div className="orline">
        <span />
        <span className="tiny muted">{t("or with email")}</span>
        <span />
      </div>
      <ActionForm action={signupAction} locale={locale} className="stack">
        <div className="field">
          <label htmlFor="f-name">{t("Display name")}</label>
          <input className="input" id="f-name" name="name" autoComplete="nickname" maxLength={24} placeholder={t("e.g. Sam R.")} />
        </div>
        <div className="field">
          <label htmlFor="f-email">{t("Email")}</label>
          <input className="input" id="f-email" name="email" type="email" dir="ltr" autoComplete="email" maxLength={254} placeholder="you@email.com" />
        </div>
        <div className="field">
          <label htmlFor="f-pass">{t("Password")}</label>
          <PasswordInput id="f-pass" name="password" autoComplete="new-password" placeholder={t("At least 8 characters")} labels={pwLabels(t)} />
        </div>
        <div className="field">
          <label htmlFor="f-country">{t("Country")}</label>
          <select className="input" id="f-country" name="country" defaultValue={defaultCountry}>
            {countries.map(({ c, n }) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-ref">
            {t("Referral code")} <span className="muted">{t("(optional)")}</span>
          </label>
          <input className="input" id="f-ref" name="ref" dir="ltr" maxLength={20} defaultValue={ref} placeholder={t("e.g. JAKE42")} />
        </div>
        <label className="check">
          <input type="checkbox" name="age" id="f-age" />
          <span>
            {t("I am {age} or older and accept the Terms and Privacy Policy.", { age: settings.minAge })}{" "}
            <a href={`/${locale}/legal/terms`}>{t("Terms")}</a> · <a href={`/${locale}/legal/privacy`}>{t("Privacy")}</a>
          </span>
        </label>
        <Submit className="btn primary block lg">{t("Create account")}</Submit>
      </ActionForm>
      <p className="small muted center">
        {t("Already a member?")} <a href={`/${locale}/login`}>{t("Log in")}</a>
      </p>
      {settings.welcomeBonus > 0 ? (
        <div className="pill coin" style={{ alignSelf: "center" }}>
          <span className="coin">A</span>
          {t("{c} welcome bonus on sign-up", { c: settings.welcomeBonus.toLocaleString("en-US") })}
        </div>
      ) : null}
    </div>
  );
}
