import type { Metadata } from "next";
import QRCode from "qrcode";
import { pageLocale, requireMember } from "../../../locale";
import { pendingTotpSecret } from "@/server/auth";
import { otpauthUri } from "@/lib/totp";
import { TwoFactorPanel } from "@/components/two-factor";
import { confirmTwoFactorAction, disableTwoFactorAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Two-factor login", robots: { index: false } };

export default async function TwoFactorSettings({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const user = await requireMember(locale, "/account/two-factor");
  const secret = user.totpEnabled ? null : await pendingTotpSecret(user.id);
  // QR code drawn on our server: the secret never goes to a third-party service.
  const qrSvg = secret ? await QRCode.toString(otpauthUri(secret, user.email), { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 200 }) : null;
  return (
    <>
      <a className="small" href={`/${locale}/account`}>
        ← {t("Account")}
      </a>
      <h1>{user.totpEnabled ? t("Two-factor login") : t("Set up Google Authenticator")}</h1>
      <TwoFactorPanel
        enabled={user.totpEnabled}
        setupAction={confirmTwoFactorAction}
        disableAction={disableTwoFactorAction}
        locale={locale}
        qrSvg={qrSvg}
        secret={secret}
        doneHref={`/${locale}/account`}
        notStarted={t("Start the setup from your account page.")}
        setupLabels={{
          scan: t("1. Scan this QR code with Google Authenticator (or any authenticator app)."),
          manual: t("Can't scan? Enter this key manually:"),
          enter: t("2. Enter the 6-digit code the app shows."),
          code: t("Authenticator code"),
          submit: t("Verify and turn on"),
          tip: t("Tip: turn on cloud backup in Google Authenticator (sign in with your Google account in the app), so your codes come back if you change phones."),
          done: t("Done"),
          on: t("Two-factor login is on"),
        }}
        disableLabels={{ title: t("Turn off two-factor login"), hint: t("Enter a current code from your app to confirm."), code: t("Authenticator code"), submit: t("Turn off"), on: t("Two-factor login is on") }}
      />
    </>
  );
}
