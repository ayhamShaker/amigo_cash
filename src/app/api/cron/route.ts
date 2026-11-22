import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { releaseDueHolds } from "@/server/ledger";
import { pruneRateLimits } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Housekeeping, called every 10–15 minutes by the host's scheduler with
 * `Authorization: Bearer $CRON_SECRET`: releases matured holds and clears
 * expired sessions, tokens and rate-limit rows.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const released = await releaseDueHolds({ limit: 2000 });
  const now = new Date();
  const [sessions, pending, tokens] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.pendingLogin.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } }),
  ]);
  await pruneRateLimits();
  return NextResponse.json({ released, expiredSessions: sessions.count, expiredPending: pending.count, oldTokens: tokens.count });
}
