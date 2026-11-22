import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { upsertGoogleUser } from "@/server/auth";
import { createSession, startPendingLogin } from "@/server/session";
import { deviceId, requestIp } from "@/server/request";
import { signupAttribution } from "@/server/marketing";
import { CREATOR_COOKIE, SOURCE_COOKIE } from "@/lib/attribution";
import { rateLimit } from "@/server/rate-limit";
import { isLocale, type Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";

function back(locale: string, query: string) {
  return NextResponse.redirect(new URL(`/${locale}/login?${query}`, env().APP_URL));
}

export async function GET(req: NextRequest) {
  const e = env();
  let saved: { state?: string; verifier?: string; locale?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get("amigo_oauth")?.value ?? "{}");
  } catch {
    /* ignore */
  }
  const locale: Locale = isLocale(saved.locale) ? saved.locale : "en";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!saved.state || !saved.verifier || !state || !safeEqual(state, saved.state) || !code) return back(locale, "google=failed");
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return back(locale, "google=off");
  const ip = await requestIp();
  if (!(await rateLimit(`google:${ip ?? "none"}`, 20, 900))) return back(locale, "google=failed");

  // Exchange the code directly with Google over TLS; the access token is then
  // used once to read the verified profile.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: e.GOOGLE_CLIENT_ID,
      client_secret: e.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!tokenRes?.ok) return back(locale, "google=failed");
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return back(locale, "google=failed");
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!profileRes?.ok) return back(locale, "google=failed");
  const p = (await profileRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!p.sub || !p.email) return back(locale, "google=failed");

  const result = await upsertGoogleUser(
    { sub: p.sub, email: p.email, emailVerified: p.email_verified === true, name: p.name ?? "" },
    { locale, refCode: req.cookies.get("amigo_ref")?.value, ip, deviceId: await deviceId(true), country: "US", attribution: await signupAttribution() },
  );
  if ("error" in result) return back(locale, `google=${result.error === "CLOSED" ? "closed" : result.error === "VPN" ? "vpn" : result.error === "DEVICE_LIMIT" ? "device" : "unverified"}`);
  if (result.status !== "ACTIVE") return back(locale, "google=banned");

  let res: NextResponse;
  if (result.totpEnabled) {
    await startPendingLogin(result.id);
    res = NextResponse.redirect(new URL(`/${locale}/two-factor`, e.APP_URL));
  } else {
    await createSession(result.id);
    res = NextResponse.redirect(new URL(`/${locale}/earn${result.created ? "?welcome=1" : ""}`, e.APP_URL));
  }
  res.cookies.delete({ name: "amigo_oauth", path: "/api/auth/google" });
  if (result.created) {
    res.cookies.delete("amigo_ref");
    res.cookies.delete(SOURCE_COOKIE);
    res.cookies.delete(CREATOR_COOKIE);
  }
  return res;
}
