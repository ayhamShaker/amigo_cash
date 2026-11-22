import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Lightweight poll for the admin panel: waiting chats, plus a fingerprint of everything the panel shows. */
export async function GET() {
  const u = await currentUser();
  if (!u || u.role !== "ADMIN" || !u.totpEnabled) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [waiting, latest, conv, wd, user, ledger] = await Promise.all([
    db.chatConversation.count({ where: { unreadAdmin: { gt: 0 } } }),
    db.chatConversation.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.conversion.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, status: true } }),
    db.withdrawal.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
    db.user.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
    db.ledgerEntry.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);
  const pending = await db.withdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } });
  return NextResponse.json({
    waiting,
    latest: latest?.updatedAt.toISOString() ?? null,
    // changes whenever anything shown in the panel changes
    v: [latest?.updatedAt.toISOString() ?? "", conv?.id ?? "", conv?.status ?? "", wd?.id ?? "", pending, user?.id ?? "", ledger?.id ?? ""].join("|"),
  });
}
