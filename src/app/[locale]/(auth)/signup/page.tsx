import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { pageLocale, pwLabels } from "../../locale";
import { ActionForm, PasswordInput, Submit } from "@/components/forms";
import { signupAction } from "@/app/actions/auth";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { visitorCountry } from "@/server/request";
import { GoogleMark } from "@/components/google-mark";
import { TurnstileWidget } from "@/components/turnstile";
import { COUNTRIES, countryName } from "@/lib/countries";
import { env } from "@/lib/env";
import { intlTag } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { t } = await pageLocale(params);
  return { title: t("Sign up"), robots: { index: false } };
}

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  if (await currentUser()) redirect(`/${locale}/earn`);
  const [settings, geoCountry] = await Promise.all([getSettings(), visitorCountry()]);
  const ref = (await cookies()).get("amigo_ref")?.value ?? "";
  const tag = intlTag(locale);
  const countries = COUNTRIES.map((c) => ({ c, n: countryName(c, tag) })).sort((a, b) => a.n.localeCompare(b.n, tag));
  const defaultCountry = geoCountry && (COUNTRIES as readonly string[]).includes(geoCountry) ? geoCountry : locale === "es" ? "AR" : locale === "hi" ? "IN" : "US";
  const e = env();
  const googleOn = !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const turnstileKey = e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET_KEY ? e.TURNSTILE_SITE_KEY : null;

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
      {googleOn ? (
        <>
          <a className="btn ghost block" href={`/api/auth/google/start?locale=${locale}`}>
            <GoogleMark />
            {t("Continue with Google")}
          </a>
          <div className="orline">
            <span />
            <span className="tiny muted">{t("or with email")}</span>
            <span />
          </div>
        </>
      ) : null}
      <ActionForm action={signupAction} locale={locale} className="stack">
        <div className="field">
          <label htmlFor="f-name">{t("Display name")}</label>
          <input className="input" id="f-name" name="name" autoComplete="nickname" maxLength={24} placeholder={t("e.g. Sam R.")} />
        </div>
        <div className="field">
          <label htmlFor="f-email">{t("Email")}</label>
          <input className="input" id="f-email" name="email" type="email" dir="ltr" autoComplete="email" maxLength={254} placeholder="you@email.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
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
        {turnstileKey ? <TurnstileWidget siteKey={turnstileKey} /> : null}
        <Submit className="btn primary block lg">{t("Create account")}</Submit>
      </ActionForm>
      <p className="small muted center">
        {t("Already a member?")} <a href={`/${locale}/login`}>{t("Log in")}</a>
      </p>
      {settings.welcomeBonus > 0 ? (
        <div className="pill coin" style={{ alignSelf: "center" }}>
          <span className="coin" aria-hidden="true">A</span>
          {t("{c} welcome bonus on sign-up", { c: settings.welcomeBonus.toLocaleString("en-US") })}
        </div>
      ) : null}
    </div>
  );
}
