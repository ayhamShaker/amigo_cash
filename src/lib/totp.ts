import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "./crypto";

/** RFC 4648 base32 (no padding), the format authenticator apps expect. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP, HMAC-SHA1. */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac("sha1", key).update(msg).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const TOTP_PERIOD = 30;

export function totpCounter(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

export function totp(secretB32: string, nowMs = Date.now()): string {
  return hotp(base32Decode(secretB32), totpCounter(nowMs));
}

/**
 * Checks a 6-digit code, allowing one 30-second step of clock drift either way.
 * Returns the matched counter (callers store it to reject replays) or null.
 */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now()): number | null {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const key = base32Decode(secretB32);
  const c = totpCounter(nowMs);
  for (const w of [0, -1, 1]) {
    if (safeEqual(hotp(key, c + w), digits)) return c + w;
  }
  return null;
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function otpauthUri(secretB32: string, account: string, issuer = "Amigo Cash"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: "6", period: String(TOTP_PERIOD) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Eight one-time backup codes like "4f9a-21c0". */
export function newBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(4).toString("hex");
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  });
}

export function normaliseBackupCode(input: string): string {
  const hex = input.toLowerCase().replace(/[^0-9a-f]/g, "");
  return hex.length === 8 ? `${hex.slice(0, 4)}-${hex.slice(4)}` : "";
}
