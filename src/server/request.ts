import "server-only";
import { cookies, headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/ip";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

export async function requestIp(): Promise<string | null> {
  const e = env();
  return clientIpFromHeaders(await headers(), e.TRUSTED_PROXY_HOPS, e.TRUST_CLOUDFLARE);
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}

export const isProd = () => process.env.NODE_ENV === "production";

/** Long-lived random device id, used to spot many accounts on one device. */
export const DEVICE_COOKIE = "amigo_did";
export async function deviceId(create = false): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{20,64}$/.test(existing)) return existing;
  if (!create) return null;
  const id = randomToken(18);
  jar.set(DEVICE_COOKIE, id, { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  return id;
}
