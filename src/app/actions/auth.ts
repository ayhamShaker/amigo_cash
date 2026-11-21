"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { FormState } from "@/components/forms";
import {
  checkPasswordLogin,
  changePassword,
  confirmTotpSetup,
  beginTotpSetup,
  disableTotp,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  signup,
  verifySecondFactor,
} from "@/server/auth";
import { bool, raw, safeNext, str, tFrom } from "@/server/action-utils";
import { clearPendingLogin, createSession, currentUser, destroySession, revokeOtherSessions, startPendingLogin, takePendingLoginAttempt } from "@/server/session";
import { deviceId, requestIp } from "@/server/request";
import { recordDevice } from "@/server/fraud";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";

export async function signupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale, t } = tFrom(fd);
  const settings = await getSettings();
  const ip = await requestIp();
  const refFromCookie = (await cookies()).get("amigo_ref")?.value;
  const r = await signup({
    name: str(fd, "name", 40),
    email: str(fd, "email", 254),
    password: raw(fd, "password", 200),
    country: str(fd, "country", 2).toUpperCase(),
    refCode: str(fd, "ref", 20) || refFromCookie || undefined,
    locale,
    ip,
    deviceId: await deviceId(true),
    ageConfirmed: bool(fd, "age"),
  });
  if (!r.ok) {
    const messages: Record<typeof r.error, string> = {
      CLOSED: t("New registrations are closed for a short while. Please try again later."),
      NAME: t("Enter a display name with at least 2 characters."),
      EMAIL: t("Enter a valid email address, like you@email.com."),
      PASSWORD: t("Your password needs at least 8 characters."),
      AGE: t("Confirm that you are {age} or older to continue.", { age: settings.minAge }),
      EMAIL_TAKEN: t("An account with this email already exists. Log in instead."),
      BAD_REFERRAL: t("This referral code does not exist. Check it or leave the field empty."),
      DEVICE_LIMIT: t("An account already exists on this device. Log in to that account instead."),
      VPN: t("Turn off your VPN or proxy to create an account."),
      RATE_LIMIT: t("Too many attempts. Wait a few minutes and try again."),
    };
    return { error: messages[r.error] };
  }
  (await cookies()).delete("amigo_ref");
  await createSession(r.userId);
  redirect(`/${locale}/earn?welcome=1`);
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale, t } = tFrom(fd);
  const ip = await requestIp();
  const r = await checkPasswordLogin(str(fd, "email", 254), raw(fd, "password", 200), ip);
  if (!r.ok) {
    if (r.error === "BANNED") return { error: t("This account is suspended. Contact support for details.") };
    if (r.error === "RATE_LIMIT") return { error: t("Too many attempts. Wait a few minutes and try again.") };
    return { error: t("That email and password do not match. Try again or reset your password.") };
  }
  const next = safeNext(str(fd, "next", 200), locale);
  if (r.needs2fa) {
    await startPendingLogin(r.userId);
    redirect(`/${locale}/two-factor?next=${encodeURIComponent(next)}`);
  }
  await createSession(r.userId);
  await recordDevice(r.userId, await deviceId(true), ip);
  redirect(next);
}

export async function twoFactorLoginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale, t } = tFrom(fd);
  const pending = await takePendingLoginAttempt();
  if (!pending) return { error: t("This sign-in has expired. Log in again.") };
  if (!(await verifySecondFactor(pending.userId, str(fd, "code", 20)))) {
    return { error: t("That code is not right. Check the time on your phone and try the newest code.") };
  }
  await clearPendingLogin(pending.id);
  await createSession(pending.userId);
  await recordDevice(pending.userId, await deviceId(true), await requestIp());
  redirect(safeNext(str(fd, "next", 200), locale));
}

export async function logoutAction(fd: FormData) {
  const { locale } = tFrom(fd);
  await destroySession();
  redirect(`/${locale}`);
}

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = tFrom(fd);
  await requestPasswordReset(str(fd, "email", 254), await requestIp());
  return { ok: t("If an account uses this email, a reset link is on its way.") };
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale, t } = tFrom(fd);
  const pw = raw(fd, "password", 200);
  if (pw !== raw(fd, "repeat", 200)) return { error: t("The two new passwords do not match.") };
  if (pw.length < 8) return { error: t("The new password needs at least 8 characters.") };
  if (!(await resetPassword(str(fd, "token", 200), pw))) return { error: t("This reset link has expired or was already used. Ask for a new one.") };
  redirect(`/${locale}/login?reset=1`);
}

/* ---------- account security (signed-in) ---------- */

async function me() {
  const u = await currentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = tFrom(fd);
  const u = await me();
  const next = raw(fd, "new", 200);
  if (next !== raw(fd, "repeat", 200)) return { error: t("The two new passwords do not match.") };
  const r = await changePassword(u.id, raw(fd, "current", 200), next);
  if (!r.ok) {
    const m = {
      CURRENT: t("Your current password is not correct."),
      LENGTH: t("The new password needs at least 8 characters."),
      SAME: t("Choose a password different from the current one."),
      RATE_LIMIT: t("Too many attempts. Wait a few minutes and try again."),
    } as const;
    return { error: m[r.error] };
  }
  await revokeOtherSessions(u.id, true);
  return { ok: t("Password updated") };
}

export async function startTwoFactorAction(fd: FormData) {
  const { locale } = tFrom(fd);
  const u = await me();
  if (!u.totpEnabled) await beginTotpSetup(u.id);
  redirect(`/${locale}/account/two-factor`);
}

export async function confirmTwoFactorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = tFrom(fd);
  const u = await me();
  const codes = await confirmTotpSetup(u.id, str(fd, "code", 20));
  if (!codes) return { error: t("That code is not right. Check the time on your phone and try the newest code.") };
  await revokeOtherSessions(u.id, true);
  return { ok: t("Two-factor login is on"), data: { codes } };
}

export async function disableTwoFactorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = tFrom(fd);
  const u = await me();
  if (u.role === "ADMIN") return { error: t("Admins must keep two-factor login on.") };
  if (!(await disableTotp(u.id, str(fd, "code", 20)))) return { error: t("That code is not right. Check the time on your phone and try the newest code.") };
  return { ok: t("Two-factor login is off") };
}

export async function resendVerificationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = tFrom(fd);
  const u = await me();
  await sendVerificationEmail(u.id);
  return { ok: t("We sent a new confirmation link to {e}.", { e: u.email }) };
}

export async function signOutEverywhereAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = tFrom(fd);
  const u = await me();
  await revokeOtherSessions(u.id, true);
  return { ok: t("Signed out on every other device.") };
}

export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = tFrom(fd);
  const u = await me();
  const name = str(fd, "name", 40).replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 24 || /[<>]/.test(name)) return { error: t("Display name needs 2+ characters") };
  await db.user.update({ where: { id: u.id }, data: { name } });
  return { ok: t("Changes saved") };
}
