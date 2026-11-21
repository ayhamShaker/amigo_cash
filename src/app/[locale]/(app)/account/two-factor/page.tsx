import type { Metadata } from "next";
import QRCode from "qrcode";
import { pageLocale, requireMember } from "../../../locale";
import { pendingTotpSecret } from "@/server/auth";
import { otpauthUri } from "@/lib/totp";
import { TwoFactorSetup, TwoFactorDisable } from "@/components/two-factor";
import { confirmTwoFactorAction, disableTwoFactorAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Two-factor login", robots: { index: false } };

export default async function TwoFactorSettings({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const user = await requireMember(locale, "/account/two-factor");

  if (user.totpEnabled) {
    return (
      <>
        <a className="small" href={`/${locale}/account`}>
          ← {t("Account")}
        </a>
        <h1>{t("Two-factor login")}</h1>
        <TwoFactorDisable
          action={disableTwoFactorAction}
          locale={locale}
          labels={{ title: t("Turn off two-factor login"), hint: t("Enter a current code from your app to confirm."), code: t("Authenticator code"), submit: t("Turn off"), on: t("Two-factor login is on") }}
        />
      </>
    );
  }

  const secret = await pendingTotpSecret(user.id);
  if (!secret) {
    return (
      <div className="card empty">
        <span>{t("Start the setup from your account page.")}</span>
        <a className="btn primary" href={`/${locale}/account`}>
          {t("Account")}
        </a>
      </div>
    );
  }
  // QR code drawn on the server: the secret never goes to a third-party service.
  const qrSvg = await QRCode.toString(otpauthUri(secret, user.email), { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 200 });
  return (
    <>
      <a className="small" href={`/${locale}/account`}>
        ← {t("Account")}
      </a>
      <h1>{t("Set up Google Authenticator")}</h1>
      <TwoFactorSetup
        action={confirmTwoFactorAction}
        locale={locale}
        qrSvg={qrSvg}
        secret={secret}
        doneHref={`/${locale}/account`}
        labels={{
          scan: t("1. Scan this QR code with Google Authenticator (or any authenticator app)."),
          manual: t("Can't scan? Enter this key manually:"),
          enter: t("2. Enter the 6-digit code the app shows."),
          code: t("Authenticator code"),
          submit: t("Verify and turn on"),
          saveCodes: t("Save these backup codes. Each one works once if you lose your phone."),
          done: t("Done"),
          on: t("Two-factor login is on"),
        }}
      />
    </>
  );
}
