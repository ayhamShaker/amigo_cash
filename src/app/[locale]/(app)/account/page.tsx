import type { Metadata } from "next";
import { pageLocale, pwLabels, requireMember, themeCookie } from "../../locale";
import { LangSwitch, ThemeToggle } from "@/components/client-controls";
import { ActionForm, PasswordInput, Submit } from "@/components/forms";
import { changePasswordAction, resendVerificationAction, signOutEverywhereAction, startTwoFactorAction, updateProfileAction, logoutAction } from "@/app/actions/auth";
import { Icon } from "@/components/icons";
import { LevelCard } from "@/components/level";
import { formatDate } from "@/i18n/t";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, t } = await pageLocale(params);
  const user = await requireMember(locale, "/account");
  const sp = await searchParams;
  const theme = await themeCookie();
  return (
    <>
      <div className="pagehead">
        <h1>{t("Account")}</h1>
      </div>
      {sp.admin2fa && user.role === "ADMIN" ? (
        <div className="formmsg bad" dir="rtl" lang="ar">
          <Icon name="shield" />
          <span>لازم تفعّل التحقق بخطوتين (Google Authenticator) قبل ما تدخل لوحة الإدارة.</span>
        </div>
      ) : null}
      {user.role === "ADMIN" && user.totpEnabled ? (
        <a className="btn primary" href="/admin" style={{ alignSelf: "flex-start" }}>
          <Icon name="grid" />
          لوحة الإدارة
        </a>
      ) : null}
      <div className="grid2">
        <div className="card stack">
          <div className="row">
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 22, background: "var(--accent)" }}>
              {user.name[0]?.toUpperCase()}
            </span>
            <div>
              <h3 style={{ fontSize: 20 }}>{user.name}</h3>
              <div className="small muted">
                {t("Member since {d}", { d: formatDate(locale, user.createdAt) })} · <span className="cc">{user.country}</span>
              </div>
            </div>
          </div>
          <LevelCard earned={user.lifetimeEarned} t={t} />
          <div className="row between wr" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <span className="small" style={{ fontWeight: 700 }}>
              {t("Language")}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <LangSwitch current={locale} label={t("Language")} />
              <ThemeToggle initial={theme} labels={{ toDark: t("Switch to dark mode"), toLight: t("Switch to light mode") }} />
            </div>
          </div>
          <a className="small" href={`/${locale}/activity`} style={{ fontWeight: 700, color: "var(--accent)" }}>
            {t("Activity")} →
          </a>
        </div>
        <ActionForm action={updateProfileAction} locale={locale} className="card stack">
          <h3 style={{ fontSize: 17 }}>{t("Details")}</h3>
          <div className="field">
            <label htmlFor="p-name">{t("Display name")}</label>
            <input className="input" id="p-name" name="name" defaultValue={user.name} maxLength={24} />
          </div>
          <div className="field">
            <label htmlFor="p-email">{t("Email")}</label>
            <input className="input" id="p-email" value={user.email} readOnly dir="ltr" />
            <div className="tiny">{user.emailVerifiedAt ? <span className="pill good">{t("Confirmed")}</span> : <span className="pill warn">{t("Not confirmed")}</span>}</div>
          </div>
          <Submit>{t("Save changes")}</Submit>
        </ActionForm>
      </div>

      {!user.emailVerifiedAt ? (
        <ActionForm action={resendVerificationAction} locale={locale} className="card row wr between">
          <div className="row" style={{ gap: 14 }}>
            <Icon name="mail" />
            <div>
              <b>{t("Confirm your email")}</b>
              <div className="small muted">{t("We sent a link to {e}. Confirm it before your first withdrawal.", { e: user.email })}</div>
            </div>
          </div>
          <Submit className="btn ghost">{t("Send the link again")}</Submit>
        </ActionForm>
      ) : null}

      <div className="card row wr between">
        <div className="row" style={{ gap: 14 }}>
          <span className="iconcircle">
            <Icon name="shield" />
          </span>
          <div>
            <b>{t("Two-factor login")}</b> {user.totpEnabled ? <span className="pill good">{t("On")}</span> : <span className="pill">{t("Off")}</span>}
            <div className="small muted">{t("Optional: ask for a code from Google Authenticator every time you log in.")}</div>
          </div>
        </div>
        {user.totpEnabled ? (
          <a className="btn ghost" href={`/${locale}/account/two-factor`}>
            {t("Manage")}
          </a>
        ) : (
          <form action={startTwoFactorAction}>
            <input type="hidden" name="locale" value={locale} />
            <Submit>{t("Set up")}</Submit>
          </form>
        )}
      </div>

      <ActionForm action={changePasswordAction} locale={locale} className="card stack" resetOnOk>
        <h3 style={{ fontSize: 17 }}>{user.hasPassword ? t("Change password") : t("Set a password")}</h3>
        {!user.hasPassword ? (
          <div className="note">
            <Icon name="lock" />
            <span>{t("You signed up with Google, so you can set a password here without the current one.")}</span>
          </div>
        ) : null}
        <div className="pwgrid">
          {user.hasPassword ? (
            <div className="field">
              <label htmlFor="pw-cur">{t("Current password")}</label>
              <PasswordInput id="pw-cur" name="current" autoComplete="current-password" labels={pwLabels(t)} />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="pw-new">{t("New password")}</label>
            <PasswordInput id="pw-new" name="new" autoComplete="new-password" placeholder={t("At least 8 characters")} labels={pwLabels(t)} />
          </div>
          <div className="field">
            <label htmlFor="pw-rep">{t("Repeat new password")}</label>
            <PasswordInput id="pw-rep" name="repeat" autoComplete="new-password" labels={pwLabels(t)} />
          </div>
        </div>
        <div>
          <Submit>{t("Update password")}</Submit>
        </div>
      </ActionForm>

      <div className="card row wr between">
        <div>
          <b>{t("Log out of this device")}</b>
          <div className="small muted">{t("You can log back in with your email or Google.")}</div>
        </div>
        <div className="row wr">
          <ActionForm action={signOutEverywhereAction} locale={locale}>
            <Submit className="btn ghost">{t("Log out other devices")}</Submit>
          </ActionForm>
          <form action={logoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button className="btn ghost" type="submit">
              <Icon name="out" />
              {t("Log out")}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
