import { NextResponse, type NextRequest } from "next/server";
import { ATTRIBUTION_DAYS, detectAttribution, encodeAttribution, SOURCE_COOKIE } from "@/lib/attribution";

const LOCALES = ["en", "es", "ar", "hi"];

function pickLocale(req: NextRequest): string {
  const saved = req.cookies.get("amigo_locale")?.value;
  if (saved && LOCALES.includes(saved)) return saved;
  const accept = req.headers.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0] ?? "";
    if (LOCALES.includes(base)) return base;
  }
  return "en";
}

function buildCsp(nonce: string, isDev: boolean, https: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // inline style attributes are used for per-offer colours; styles cannot run code
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    // offer walls are third-party pages shown in an iframe and redirect between their own domains
    "frame-src 'self' https:",
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function securityHeaders(res: NextResponse, csp: string, https: boolean) {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (https) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

/** Remembers where a new visitor came from (first touch, 30 days). */
function rememberSource(req: NextRequest, res: NextResponse) {
  if (req.cookies.get(SOURCE_COOKIE)) return res;
  const a = detectAttribution(req.nextUrl, req.headers.get("referer"), req.nextUrl.hostname);
  if (a) res.cookies.set(SOURCE_COOKIE, encodeAttribution(a), { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * ATTRIBUTION_DAYS });
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isDev = process.env.NODE_ENV !== "production";
  const https = (process.env.APP_URL ?? "").startsWith("https://");
  const first = pathname.split("/")[1] ?? "";

  // Pages without a language prefix go to the visitor's language.
  if (!LOCALES.includes(first) && first !== "admin" && first !== "r" && first !== "c") {
    const url = req.nextUrl.clone();
    url.pathname = `/${pickLocale(req)}${pathname === "/" ? "" : pathname}`;
    return rememberSource(req, NextResponse.redirect(url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, isDev, https);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce from this request header and adds it to its own scripts.
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-pathname", pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (LOCALES.includes(first)) {
    res.cookies.set("amigo_locale", first, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  if (first !== "admin") rememberSource(req, res);
  return securityHeaders(res, csp, https);
}

export const config = {
  matcher: [
    // everything except API routes, Next internals and static files
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|.*\\.(?:png|ico|svg|jpg|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
