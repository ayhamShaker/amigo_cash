import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/** Starts "Continue with Google" (authorization code flow with PKCE and state). */
export async function GET(req: NextRequest) {
  const e = env();
  const locale = ["en", "es", "ar"].includes(req.nextUrl.searchParams.get("locale") ?? "") ? req.nextUrl.searchParams.get("locale")! : "en";
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL(`/${locale}/login?google=off`, e.APP_URL));
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  const secure = e.NODE_ENV === "production";
  res.cookies.set("amigo_oauth", JSON.stringify({ state, verifier, locale }), { httpOnly: true, secure, sameSite: "lax", path: "/api/auth/google", maxAge: 600 });
  return res;
}
