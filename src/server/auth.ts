import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decrypt, encrypt, hmacSha256Hex, randomToken, sha256 } from "@/lib/crypto";
import { burnPasswordCheck, hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from "@/lib/password";
import { newBackupCodes, newTotpSecret, normaliseBackupCode, verifyTotp } from "@/lib/totp";
import { addEntry, isUniqueViolation } from "./ledger";
import { getSettings } from "./settings";
import { rateLimit } from "./rate-limit";
import { accountsOnDevice, addFlag, checkIp, isBadConnection, recordDevice } from "./fraud";
import { sendEmail, simpleHtml } from "./email";
import { makeT } from "@/i18n/t";
import { isLocale, type Locale } from "@/i18n/config";

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,}$/;

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeRefCode(name: string) {
  const base = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "AMIG";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += REF_CHARS[randomInt(REF_CHARS.length)];
  return `${base}${suffix}`;
}

function backupHash(code: string) {
  return hmacSha256Hex(env().SESSION_SECRET, `backup:${code}`);
}

/* ---------------- sign up ---------------- */

export type SignupInput = { name: string; email: string; password: string; country: string; refCode?: string; locale: Locale; ip: string | null; deviceId: string | null; ageConfirmed: boolean };
export type SignupError =
  | "CLOSED"
  | "NAME"
  | "EMAIL"
  | "PASSWORD"
  | "AGE"
  | "EMAIL_TAKEN"
  | "BAD_REFERRAL"
  | "DEVICE_LIMIT"
  | "VPN"
  | "RATE_LIMIT";

export async function signup(input: SignupInput): Promise<{ ok: true; userId: string } | { ok: false; error: SignupError }> {
  const settings = await getSettings();
  if (!settings.registrationOpen) return { ok: false, error: "CLOSED" };
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = normaliseEmail(input.email);
  if (name.length < 2 || name.length > 24 || /[<>]/.test(name)) return { ok: false, error: "NAME" };
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "EMAIL" };
  if (input.password.length < PASSWORD_MIN || input.password.length > PASSWORD_MAX) return { ok: false, error: "PASSWORD" };
  if (!input.ageConfirmed) return { ok: false, error: "AGE" };
  if (!(await rateLimit(`signup:ip:${input.ip ?? "none"}`, 5, 3600))) return { ok: false, error: "RATE_LIMIT" };

  const ipv = await checkIp(input.ip);
  if (settings.blockVpn && isBadConnection(ipv)) return { ok: false, error: "VPN" };
  if ((await accountsOnDevice(input.deviceId)) >= settings.maxAccountsPerDevice) return { ok: false, error: "DEVICE_LIMIT" };

  const refCode = input.refCode?.trim().toUpperCase();
  const referrer = refCode ? await db.user.findUnique({ where: { refCode }, select: { id: true, name: true, status: true } }) : null;
  if (refCode && (!referrer || referrer.status !== "ACTIVE")) return { ok: false, error: "BAD_REFERRAL" };

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await createMemberWithBonuses({
      name,
      email,
      passwordHash,
      googleId: null,
      emailVerified: false,
      country: /^[A-Z]{2}$/.test(input.country) ? input.country : "US",
      locale: input.locale,
      referrer,
      ip: input.ip,
    });
    await recordDevice(user.id, input.deviceId, input.ip);
    if (ipv.checked && ipv.fraudScore >= 85) await addFlag(user.id, "High-risk IP", 30);
    await sendVerificationEmail(user.id);
    return { ok: true, userId: user.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "EMAIL_TAKEN" };
    throw e;
  }
}

async function createMemberWithBonuses(args: {
  name: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  emailVerified: boolean;
  country: string;
  locale: Locale;
  referrer: { id: string; name: string } | null;
  ip: string | null;
}) {
  const settings = await getSettings();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: args.name,
            email: args.email,
            passwordHash: args.passwordHash,
            googleId: args.googleId,
            emailVerifiedAt: args.emailVerified ? new Date() : null,
            country: args.country,
            locale: args.locale,
            refCode: makeRefCode(args.name),
            referredById: args.referrer?.id ?? null,
            signupIp: args.ip,
          },
        });
        if (settings.welcomeBonus > 0) {
          await addEntry(tx, { userId: user.id, amount: settings.welcomeBonus, bucket: "AVAILABLE", kind: "WELCOME", description: { k: "Welcome bonus" } });
        }
        if (args.referrer && settings.inviteBonus > 0) {
          await addEntry(tx, { userId: user.id, amount: settings.inviteBonus, bucket: "AVAILABLE", kind: "INVITE_BONUS", description: { k: "Invite bonus from {n}", a: { n: args.referrer.name } } });
        }
        return user;
      });
    } catch (e) {
      // retry only on a referral-code collision; an email collision is final
      if (isUniqueViolation(e) && String((e as { meta?: { target?: unknown } }).meta?.target ?? "").includes("refCode")) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate a referral code");
}

/* ---------------- log in ---------------- */

export type LoginResult = { ok: true; userId: string; needs2fa: boolean } | { ok: false; error: "INVALID" | "BANNED" | "RATE_LIMIT" };

export async function checkPasswordLogin(emailRaw: string, password: string, ip: string | null): Promise<LoginResult> {
  const email = normaliseEmail(emailRaw);
  const ipOk = await rateLimit(`login:ip:${ip ?? "none"}`, 30, 900);
  const emailOk = await rateLimit(`login:email:${sha256(email)}`, 10, 900);
  if (!ipOk || !emailOk) return { ok: false, error: "RATE_LIMIT" };
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, status: true, totpEnabled: true } });
  if (!user || !user.passwordHash) {
    await burnPasswordCheck(password);
    return { ok: false, error: "INVALID" };
  }
  if (!(await verifyPassword(user.passwordHash, password))) return { ok: false, error: "INVALID" };
  if (user.status !== "ACTIVE") return { ok: false, error: "BANNED" };
  return { ok: true, userId: user.id, needs2fa: user.totpEnabled };
}

/* ---------------- two-factor ---------------- */

/**
 * Accepts a current authenticator code (not reused) or an unused backup code.
 * Each successful code is consumed, so it cannot be replayed.
 */
export async function verifySecondFactor(userId: string, input: string): Promise<boolean> {
  if (!(await rateLimit(`2fa:${userId}`, 10, 900))) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabled: true, totpLastCounter: true } });
  if (!user?.totpEnabled || !user.totpSecretEnc) return false;
  const secret = decrypt(user.totpSecretEnc, env().ENCRYPTION_KEY);
  const step = verifyTotp(secret, input);
  if (step !== null) {
    // Only accept a step newer than the last one used.
    const res = await db.user.updateMany({
      where: { id: userId, OR: [{ totpLastCounter: null }, { totpLastCounter: { lt: step } }] },
      data: { totpLastCounter: step },
    });
    return res.count === 1;
  }
  const backup = normaliseBackupCode(input);
  if (!backup) return false;
  const res = await db.backupCode.updateMany({ where: { userId, codeHash: backupHash(backup), usedAt: null }, data: { usedAt: new Date() } });
  return res.count === 1;
}

/** Step 1 of setup: store a new (not yet active) secret and return it. */
export async function beginTotpSetup(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabled: true } });
  if (user.totpEnabled) throw new Error("Two-factor is already on");
  const secret = newTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpSecretEnc: encrypt(secret, env().ENCRYPTION_KEY), totpLastCounter: null } });
  return secret;
}

export async function pendingTotpSecret(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabled: true } });
  if (!u?.totpSecretEnc || u.totpEnabled) return null;
  return decrypt(u.totpSecretEnc, env().ENCRYPTION_KEY);
}

/** Step 2: the member proves the app works; we switch 2FA on and return backup codes. */
export async function confirmTotpSetup(userId: string, code: string): Promise<string[] | null> {
  if (!(await rateLimit(`2fa-setup:${userId}`, 10, 900))) return null;
  const secret = await pendingTotpSecret(userId);
  if (!secret) return null;
  const step = verifyTotp(secret, code);
  if (step === null) return null;
  const codes = newBackupCodes();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { totpEnabled: true, totpLastCounter: step } });
    await tx.backupCode.deleteMany({ where: { userId } });
    await tx.backupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: backupHash(c) })) });
  });
  return codes;
}

export async function disableTotp(userId: string, code: string): Promise<boolean> {
  if (!(await verifySecondFactor(userId, code))) return false;
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecretEnc: null, totpLastCounter: null } }),
    db.backupCode.deleteMany({ where: { userId } }),
  ]);
  return true;
}

/* ---------------- passwords ---------------- */

export type PasswordChangeError = "CURRENT" | "LENGTH" | "SAME" | "RATE_LIMIT";

export async function changePassword(userId: string, current: string, next: string): Promise<{ ok: true } | { ok: false; error: PasswordChangeError }> {
  if (!(await rateLimit(`pwchange:${userId}`, 10, 900))) return { ok: false, error: "RATE_LIMIT" };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, current))) return { ok: false, error: "CURRENT" };
  if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) return { ok: false, error: "LENGTH" };
  if (user.passwordHash && (await verifyPassword(user.passwordHash, next))) return { ok: false, error: "SAME" };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true };
}

const TOKEN_TTL = { PASSWORD_RESET: 60 * 60_000, EMAIL_VERIFY: 48 * 60 * 60_000 } as const;

async function issueToken(userId: string, purpose: keyof typeof TOKEN_TTL) {
  const token = randomToken(32);
  await db.authToken.deleteMany({ where: { userId, purpose, usedAt: null } });
  await db.authToken.create({ data: { id: sha256(token), userId, purpose, expiresAt: new Date(Date.now() + TOKEN_TTL[purpose]) } });
  return token;
}

/** Consumes a single-use token. Returns the user id when valid. */
async function consumeToken(token: string, purpose: keyof typeof TOKEN_TTL): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const rows = await db.authToken.updateManyAndReturn({
    where: { id: sha256(token), purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return rows[0]?.userId ?? null;
}

function localeOf(v: string): Locale {
  return isLocale(v) ? v : "en";
}

/** Always behaves the same, so it cannot be used to find out which emails have accounts. */
export async function requestPasswordReset(emailRaw: string, ip: string | null) {
  const email = normaliseEmail(emailRaw);
  if (!(await rateLimit(`reset:ip:${ip ?? "none"}`, 10, 3600))) return;
  if (!(await rateLimit(`reset:email:${sha256(email)}`, 3, 3600))) return;
  const user = await db.user.findUnique({ where: { email }, select: { id: true, locale: true, status: true } });
  if (!user || user.status !== "ACTIVE") return;
  const token = await issueToken(user.id, "PASSWORD_RESET");
  const locale = localeOf(user.locale);
  const t = makeT(locale);
  const url = `${env().APP_URL}/${locale}/reset-password?token=${token}`;
  const text = t("Someone asked to reset the password for your Amigo Cash account. If it was you, open this link within one hour:") + `\n\n${url}\n\n` + t("If you did not ask for this, you can ignore this email. Your password stays the same.");
  await sendEmail({ to: email, subject: t("Reset your Amigo Cash password"), text, html: simpleHtml(text, { label: t("Reset password"), url }) });
}

export async function resetPassword(token: string, next: string): Promise<boolean> {
  if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) return false;
  const userId = await consumeToken(token, "PASSWORD_RESET");
  if (!userId) return false;
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), emailVerifiedAt: new Date() } }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  return true;
}

export async function sendVerificationEmail(userId: string) {
  if (!(await rateLimit(`verify-mail:${userId}`, 5, 3600))) return false;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, locale: true, emailVerifiedAt: true } });
  if (user.emailVerifiedAt) return true;
  const token = await issueToken(userId, "EMAIL_VERIFY");
  const locale = localeOf(user.locale);
  const t = makeT(locale);
  const url = `${env().APP_URL}/${locale}/verify-email?token=${token}`;
  const text = t("Welcome to Amigo Cash! Confirm your email address so you can cash out:") + `\n\n${url}`;
  return sendEmail({ to: user.email, subject: t("Confirm your email for Amigo Cash"), text, html: simpleHtml(text, { label: t("Confirm email"), url }) });
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "EMAIL_VERIFY");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await maybeBootstrapAdmin(userId);
  return true;
}

/**
 * Makes the owner's account admin once its email is confirmed, so the first
 * admin can be created without database access. The address must be proven
 * (email link or verified Google login), so nobody else can claim it.
 */
export async function maybeBootstrapAdmin(userId: string): Promise<boolean> {
  const owner = env().BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!owner) return false;
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true, role: true, emailVerifiedAt: true } });
  if (!u || u.role === "ADMIN" || !u.emailVerifiedAt || u.email !== owner) return false;
  await db.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
  await db.auditLog.create({ data: { actorId: null, action: "user.make_admin.bootstrap", targetType: "user", targetId: userId } });
  return true;
}

/* ---------------- Google ---------------- */

export type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string };

/**
 * Finds or creates the member for a Google account. A Google login links to an
 * existing email account only when Google says the address is verified.
 */
export async function upsertGoogleUser(p: GoogleProfile, ctx: { locale: Locale; refCode?: string; ip: string | null; deviceId: string | null; country: string }) {
  const settings = await getSettings();
  const byGoogle = await db.user.findUnique({ where: { googleId: p.sub }, select: { id: true, status: true, totpEnabled: true } });
  if (byGoogle) {
    await maybeBootstrapAdmin(byGoogle.id);
    return { ...byGoogle, created: false };
  }
  const email = normaliseEmail(p.email);
  if (!p.emailVerified || !EMAIL_RE.test(email)) return { error: "EMAIL_NOT_VERIFIED" as const };
  const byEmail = await db.user.findUnique({ where: { email }, select: { id: true, status: true, totpEnabled: true } });
  if (byEmail) {
    await db.user.update({ where: { id: byEmail.id }, data: { googleId: p.sub, emailVerifiedAt: new Date() } });
    await maybeBootstrapAdmin(byEmail.id);
    return { ...byEmail, created: false };
  }
  if (!settings.registrationOpen) return { error: "CLOSED" as const };
  const ipv = await checkIp(ctx.ip);
  if (settings.blockVpn && isBadConnection(ipv)) return { error: "VPN" as const };
  if ((await accountsOnDevice(ctx.deviceId)) >= settings.maxAccountsPerDevice) return { error: "DEVICE_LIMIT" as const };
  const refCode = ctx.refCode?.trim().toUpperCase();
  const referrer = refCode ? await db.user.findUnique({ where: { refCode }, select: { id: true, name: true, status: true } }) : null;
  const user = await createMemberWithBonuses({
    name: (p.name || email.split("@")[0] || "Member").replace(/[<>]/g, "").slice(0, 24),
    email,
    passwordHash: null,
    googleId: p.sub,
    emailVerified: true,
    country: ctx.country,
    locale: ctx.locale,
    referrer: referrer && referrer.status === "ACTIVE" ? referrer : null,
    ip: ctx.ip,
  });
  await recordDevice(user.id, ctx.deviceId, ctx.ip);
  await maybeBootstrapAdmin(user.id);
  return { id: user.id, status: user.status, totpEnabled: false, created: true };
}

