import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

export function md5Hex(data: string): string {
  return createHash("md5").update(data).digest("hex");
}

/** Constant-time string comparison. Different lengths compare as unequal. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // still run a comparison so the length check does not show up in timing
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext).
 * The key is 32 bytes, passed base64-encoded.
 */
export function encrypt(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string, keyB64: string): string {
  const [iv, tag, ct] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !ct || iv.length !== 12 || tag.length !== 16) throw new Error("Malformed ciphertext");
  const key = Buffer.from(keyB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
