import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "./settings";

export type IpVerdict = { vpn: boolean; proxy: boolean; tor: boolean; fraudScore: number; country: string | null; checked: boolean };

const cache = new Map<string, { v: IpVerdict; at: number }>();
const TTL = 60 * 60 * 1000;

/**
 * VPN / proxy check through IPQualityScore. Without an API key every IP passes
 * (checked=false), so the site still works in development.
 */
export async function checkIp(ip: string | null): Promise<IpVerdict> {
  const none: IpVerdict = { vpn: false, proxy: false, tor: false, fraudScore: 0, country: null, checked: false };
  const key = env().IPQS_API_KEY;
  if (!ip || !key) return none;
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  try {
    const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(key)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return none;
    const j = (await res.json()) as { success?: boolean; vpn?: boolean; proxy?: boolean; tor?: boolean; fraud_score?: number; country_code?: string };
    if (!j.success) return none;
    const v: IpVerdict = { vpn: !!j.vpn, proxy: !!j.proxy, tor: !!j.tor, fraudScore: Number(j.fraud_score ?? 0), country: j.country_code ?? null, checked: true };
    if (cache.size > 5000) cache.clear();
    cache.set(ip, { v, at: Date.now() });
    return v;
  } catch {
    return none;
  }
}

export function isBadConnection(v: IpVerdict) {
  return v.vpn || v.proxy || v.tor;
}

/** Remembers which device a member used, and flags shared devices. */
export async function recordDevice(userId: string, deviceId: string | null, ip: string | null) {
  if (!deviceId) return;
  await db.userDevice.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    create: { userId, deviceId, ip },
    update: { ip },
  });
  const others = await db.userDevice.count({ where: { deviceId, userId: { not: userId } } });
  if (others > 0) await addFlag(userId, "Multi-account", 30);
}

export async function accountsOnDevice(deviceId: string | null): Promise<number> {
  if (!deviceId) return 0;
  const rows = await db.userDevice.findMany({ where: { deviceId }, select: { userId: true }, distinct: ["userId"] });
  return rows.length;
}

export async function addFlag(userId: string, flag: string, risk: number) {
  await db.$executeRaw`
    UPDATE "User" SET
      flags = CASE WHEN ${flag} = ANY(flags) THEN flags ELSE array_append(flags, ${flag}) END,
      "riskScore" = LEAST(100, "riskScore" + CASE WHEN ${flag} = ANY(flags) THEN 0 ELSE ${risk} END)
    WHERE id = ${userId}`;
  await enforceAutoBan(userId);
}

/**
 * Suspends a member whose risk score reached the owner's auto-ban level.
 * Their coins stay in the ledger; the owner can review and lift it.
 */
export async function enforceAutoBan(userId: string): Promise<boolean> {
  const s = await getSettings();
  const u = await db.user.findUnique({ where: { id: userId }, select: { riskScore: true, status: true, role: true } });
  if (!u || u.status !== "ACTIVE" || u.role === "ADMIN" || u.riskScore < s.autoBanRisk) return false;
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { status: "BANNED" } }),
    db.session.deleteMany({ where: { userId } }),
    db.auditLog.create({ data: { actorId: null, action: "user.auto_ban", targetType: "user", targetId: userId, data: { riskScore: u.riskScore, threshold: s.autoBanRisk } } }),
  ]);
  return true;
}
