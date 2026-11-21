import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Lightweight poll for the admin panel: how many chats are waiting, and the newest activity. */
export async function GET() {
  const u = await currentUser();
  if (!u || u.role !== "ADMIN" || !u.totpEnabled) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [waiting, latest] = await Promise.all([
    db.chatConversation.count({ where: { unreadAdmin: { gt: 0 } } }),
    db.chatConversation.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  return NextResponse.json({ waiting, latest: latest?.updatedAt.toISOString() ?? null });
}
