import { isIP } from "node:net";

/**
 * Client IP from X-Forwarded-For, trusting only the last `trustedHops` proxies
 * we control. Anything further left can be forged by the client.
 */
export function clientIpFromHeaders(headers: Headers, trustedHops: number, trustCloudflare = false): string | null {
  // Only safe when the origin accepts traffic from Cloudflare alone.
  const cf = trustCloudflare ? headers.get("cf-connecting-ip") : null;
  if (cf && isIP(cf.trim())) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff && trustedHops > 0) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const candidate = parts[Math.max(0, parts.length - trustedHops)];
    if (candidate && isIP(candidate)) return candidate;
  }
  const real = headers.get("x-real-ip");
  if (real && isIP(real.trim())) return real.trim();
  return null;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

/** Exact match, or IPv4 CIDR like "203.0.113.0/24". */
export function ipInAllowList(ip: string, list: string[]): boolean {
  const ipNorm = ip.replace(/^::ffff:/, "");
  for (const raw of list) {
    const entry = raw.trim();
    if (!entry) continue;
    if (!entry.includes("/")) {
      if (entry === ipNorm) return true;
      continue;
    }
    const [base, bitsStr] = entry.split("/");
    const bits = Number(bitsStr);
    const a = ipv4ToInt(ipNorm);
    const b = ipv4ToInt(base ?? "");
    if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((a & mask) === (b & mask)) return true;
  }
  return false;
}
