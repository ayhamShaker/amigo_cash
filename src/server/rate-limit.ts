import "server-only";
import { db } from "@/lib/db";

/**
 * Fixed-window counter stored in Postgres, so limits hold across every server
 * instance without extra infrastructure. One upsert per check.
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" (key, count, "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."resetAt" < now() THEN 1 ELSE "RateLimit".count + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < now() THEN now() + make_interval(secs => ${windowSec}) ELSE "RateLimit"."resetAt" END
    RETURNING count`;
  return (rows[0]?.count ?? 1) <= limit;
}

export async function pruneRateLimits() {
  await db.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < now() - interval '1 hour'`;
}
