import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "./settings";

export type IpVerdict = {
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  fraudScore: number;
  country: string | null;
  isp: string | null;
  connectionType: string | null;
  /** True when the owner's rules say this connection may not earn or sign up. */
  bad: boolean;
  checked: boolean;
  error?: string;
};

const cache = new Map<string, { v: IpVerdict; at: number }>();
const TTL = 60 * 60 * 1000;

/**
 * VPN / proxy check through IPQualityScore. Without an API key every IP passes
 * (checked=false), so the site still works in development.
 */
export async function checkIp(ip: string | null, opts: { fresh?: boolean } = {}): Promise<IpVerdict> {
  const none: IpVerdict = { vpn: false, proxy: false, tor: false, fraudScore: 0, country: null, isp: null, connectionType: null, bad: false, checked: false };
  const key = env().IPQS_API_KEY;
  if (!ip || !key) return none;
  const { vpnStrictness, maxFraudScore } = await getSettings();
  const ck = `${vpnStrictness}:${maxFraudScore}:${ip}`;
  const hit = cache.get(ck);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL) return hit.v;
  try {
    const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(key)}/${encodeURIComponent(ip)}?strictness=${vpnStrictness}&allow_public_access_points=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      console.error(`[ipqs] HTTP ${res.status}`);
      return { ...none, error: `HTTP ${res.status}` };
    }
    const j = (await res.json()) as {
      success?: boolean;
      message?: string;
      vpn?: boolean;
      active_vpn?: boolean;
      proxy?: boolean;
      tor?: boolean;
      active_tor?: boolean;
      fraud_score?: number;
      country_code?: string;
      ISP?: string;
      connection_type?: string;
    };
    if (!j.success) {
      // e.g. invalid key, unverified account or monthly quota reached
      const msg = String(j.message ?? "unknown error").slice(0, 200);
      console.error(`[ipqs] ${msg}`);
      return { ...none, error: msg };
    }
    const vpn = !!(j.vpn || j.active_vpn);
    const proxy = !!j.proxy;
    const tor = !!(j.tor || j.active_tor);
    const fraudScore = Number(j.fraud_score ?? 0);
    const v: IpVerdict = {
      vpn,
      proxy,
      tor,
      fraudScore,
      country: j.country_code ?? null,
      isp: j.ISP ? String(j.ISP).slice(0, 80) : null,
      connectionType: j.connection_type ? String(j.connection_type).slice(0, 40) : null,
      bad: vpn || proxy || tor || fraudScore >= maxFraudScore,
      checked: true,
    };
    if (cache.size > 5000) cache.clear();
    cache.set(ck, { v, at: Date.now() });
    return v;
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message;
    console.error(`[ipqs] ${msg}`);
    return { ...none, error: msg };
  }
}

export function isBadConnection(v: IpVerdict) {
  return v.bad;
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
