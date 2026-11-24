import "server-only";
import { env } from "@/lib/env";

/**
 * Verifies a Cloudflare Turnstile token on sign-up.
 * When TURNSTILE_SITE_KEY or TURNSTILE_SECRET_KEY is empty, returns true (disabled).
 */
export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<boolean> {
  const e = env();
  if (!e.TURNSTILE_SITE_KEY || !e.TURNSTILE_SECRET_KEY) return true;
  const clean = (token ?? "").trim();
  if (!clean) return false;
  try {
    const body = new URLSearchParams({
      secret: e.TURNSTILE_SECRET_KEY,
      response: clean,
      ...(ip ? { remoteip: ip } : {}),
    });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { success?: boolean };
    return !!j.success;
  } catch {
    return false;
  }
}
