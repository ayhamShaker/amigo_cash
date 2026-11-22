import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Invite link: https://amigo.cash/r/CODE remembers the code for 30 days, then opens the home page. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  const saved = req.cookies.get("amigo_locale")?.value;
  const locale = saved === "es" || saved === "ar" ? saved : "en";
  const res = NextResponse.redirect(new URL(`/${locale}`, env().APP_URL));
  const ref = code ? await db.user.findUnique({ where: { refCode: code }, select: { status: true } }) : null;
  if (ref?.status === "ACTIVE") {
    res.cookies.set("amigo_ref", code, { httpOnly: true, sameSite: "lax", secure: (process.env.APP_URL ?? "").startsWith("https://"), path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return res;
}
