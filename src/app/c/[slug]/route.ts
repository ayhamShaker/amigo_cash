import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ATTRIBUTION_DAYS, CREATOR_COOKIE, encodeAttribution, SOURCE_COOKIE } from "@/lib/attribution";
import { rateLimit } from "@/server/rate-limit";
import { requestIp } from "@/server/request";
import { SLUG_RE } from "@/server/marketing";

export const dynamic = "force-dynamic";

const LOCALES = ["en", "es", "ar", "hi"];

/**
 * A creator's personal link: https://amigo.cash/c/<slug>. Counts the click,
 * remembers the creator for 30 days (the last creator link wins) and, when the
 * creator has a member account, uses it as the referrer so they earn commission.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params;
  const slug = raw.toLowerCase();
  const saved = req.cookies.get("amigo_locale")?.value;
  const locale = saved && LOCALES.includes(saved) ? saved : "en";
  const res = NextResponse.redirect(new URL(`/${locale}`, env().APP_URL));
  if (!SLUG_RE.test(slug)) return res;
  const creator = await db.creator.findUnique({ where: { slug }, select: { id: true, active: true, user: { select: { refCode: true, status: true } } } });
  if (!creator?.active) return res;

  const ip = await requestIp();
  // one click per visitor per hour, so refreshing does not inflate the count
  if (await rateLimit(`cclick:${creator.id}:${ip ?? "none"}`, 1, 3600)) {
    await db.creator.update({ where: { id: creator.id }, data: { clicks: { increment: 1 } } });
  }
  const secure = env().APP_URL.startsWith("https://");
  const opts = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 60 * 60 * 24 * ATTRIBUTION_DAYS };
  res.cookies.set(CREATOR_COOKIE, creator.id, opts);
  res.cookies.set(SOURCE_COOKIE, encodeAttribution({ source: "creator", medium: null, campaign: slug, refHost: null }), opts);
  if (creator.user?.status === "ACTIVE") res.cookies.set("amigo_ref", creator.user.refCode, opts);
  return res;
}
