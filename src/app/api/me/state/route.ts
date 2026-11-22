import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Tiny fingerprint of everything on a member's pages that can change without
 * them doing anything (balance, holds, withdrawal status). The page polls it
 * and re-renders only when it changes.
 */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ v: "guest" });
  const [lastEntry, lastWithdrawal] = await Promise.all([
    db.ledgerEntry.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    db.withdrawal.findFirst({ where: { userId: u.id }, orderBy: { reviewedAt: { sort: "desc", nulls: "last" } }, select: { id: true, status: true } }),
  ]);
  return NextResponse.json({ v: [u.balance, u.pending, u.emailVerifiedAt ? 1 : 0, lastEntry?.id ?? "", lastWithdrawal?.id ?? "", lastWithdrawal?.status ?? ""].join("|") });
}
