import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { isProd, requestIp, userAgent } from "./request";

export const SESSION_COOKIE = "amigo_session";
export const PENDING_COOKIE = "amigo_2fa";
const SESSION_DAYS = 30;
const PENDING_MINUTES = 10;

function cookieName(base: string) {
  // __Host- prefix: Secure, path=/, no Domain — the browser refuses anything weaker.
  return isProd() ? `__Host-${base}` : base;
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt, ip: await requestIp(), userAgent: await userAgent() } });
  (await cookies()).set(cookieName(SESSION_COOKIE), token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(cookieName(SESSION_COOKIE))?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(cookieName(SESSION_COOKIE));
}

/** Signs the member out everywhere, optionally keeping the current device. */
export async function revokeOtherSessions(userId: string, keepCurrent: boolean) {
  const token = (await cookies()).get(cookieName(SESSION_COOKIE))?.value;
  const keepId = keepCurrent && token ? sha256(token) : undefined;
  await db.session.deleteMany({ where: { userId, ...(keepId ? { id: { not: keepId } } : {}) } });
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  country: true,
  locale: true,
  emailVerifiedAt: true,
  refCode: true,
  balance: true,
  pending: true,
  lifetimeEarned: true,
  totpEnabled: true,
  passwordHash: true,
  riskScore: true,
  flags: true,
  paidOnce: true,
  createdAt: true,
} as const;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "BANNED";
  country: string;
  locale: string;
  emailVerifiedAt: Date | null;
  refCode: string;
  balance: number;
  pending: number;
  lifetimeEarned: number;
  totpEnabled: boolean;
  hasPassword: boolean;
  riskScore: number;
  flags: string[];
  paidOnce: boolean;
  createdAt: Date;
};

/** The signed-in member for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(cookieName(SESSION_COOKIE))?.value;
  if (!token || token.length > 100) return null;
  const session = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: { select: userSelect } } });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  // Refresh "last used" at most once an hour to keep writes low.
  if (Date.now() - session.lastUsedAt.getTime() > 3_600_000) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
    await db.user.update({ where: { id: session.userId }, data: { lastSeenAt: new Date() } });
  }
  const { passwordHash, ...u } = session.user;
  return { ...u, hasPassword: !!passwordHash };
});

/* ---------- "password OK, waiting for the authenticator code" ---------- */

export async function startPendingLogin(userId: string) {
  const token = randomToken(32);
  await db.pendingLogin.create({ data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + PENDING_MINUTES * 60_000) } });
  (await cookies()).set(cookieName(PENDING_COOKIE), token, { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: PENDING_MINUTES * 60 });
}

/** Returns the waiting user id, counting this as an attempt (max 5). */
export async function takePendingLoginAttempt(): Promise<{ userId: string; id: string } | null> {
  const token = (await cookies()).get(cookieName(PENDING_COOKIE))?.value;
  if (!token) return null;
  const id = sha256(token);
  const updated = await db.pendingLogin.updateManyAndReturn({
    where: { id, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
    data: { attempts: { increment: 1 } },
  });
  const row = updated[0];
  return row ? { userId: row.userId, id } : null;
}

export async function hasPendingLogin(): Promise<boolean> {
  const token = (await cookies()).get(cookieName(PENDING_COOKIE))?.value;
  if (!token) return false;
  const row = await db.pendingLogin.findUnique({ where: { id: sha256(token) } });
  return !!row && row.expiresAt > new Date() && row.attempts < 5;
}

export async function clearPendingLogin(id?: string) {
  const jar = await cookies();
  const token = jar.get(cookieName(PENDING_COOKIE))?.value;
  const key = id ?? (token ? sha256(token) : null);
  if (key) await db.pendingLogin.deleteMany({ where: { id: key } });
  jar.delete(cookieName(PENDING_COOKIE));
}
