import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/server/session";
import { listNotifications } from "@/server/notify";
import { sameOrigin } from "@/server/origin";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

/** The member's latest notifications, for the bell menu. */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ items: [] }, { status: 401 });
  const l = req.nextUrl.searchParams.get("l");
  return NextResponse.json({ items: await listNotifications(u.id, isLocale(l) ? l : "en") });
}

/** Marks every notification as read (opening the bell menu). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
