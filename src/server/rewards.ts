import "server-only";
import { db } from "@/lib/db";
import { centsToCoins } from "@/lib/money";
import { Prisma } from "@/generated/prisma/client";
import { addEntry, isUniqueViolation } from "./ledger";
import type { SiteSettings } from "./settings";

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Shifts a UTC date by deltaDays and returns YYYY-MM-DD. */
function shiftUtcDay(d: Date, deltaDays: number): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + deltaDays));
  return utcDay(copy);
}

/**
 * 7-day escalating daily streak ladder bounded strictly between dailyMin and dailyMax.
 * Keeps daily giveaway cost predictable and profit-safe while rewarding retention.
 */
export function streakLadder(dailyMin: number, dailyMax: number): number[] {
  const lo = Math.max(0, Math.min(dailyMin, dailyMax));
  const hi = Math.max(lo, Math.max(dailyMin, dailyMax));
  const weights = [0, 0.12, 0.25, 0.4, 0.58, 0.78, 1];
  return weights.map((w) => Math.round(lo + (hi - lo) * w));
}

/**
 * Net coins earned from REAL offers & surveys (excluding free welcome, invite,
 * promo, daily chest or manual adjustments). Reversals are subtracted.
 */
export async function realEarnedCoins(userId: string, since?: Date): Promise<number> {
  const rows = await db.$queryRaw<{ coins: number }[]>`
    SELECT COALESCE(SUM(amount), 0)::int AS coins
    FROM "LedgerEntry"
    WHERE "userId" = ${userId}
      AND (
        kind IN ('OFFER', 'SURVEY')
        OR (kind = 'REVERSAL' AND "refType" = 'conversion')
      )
      ${since ? Prisma.sql`AND "createdAt" >= ${since}` : Prisma.empty}`;
  return Math.max(0, rows[0]?.coins ?? 0);
}

/** Counts consecutive claimed days leading up to today or yesterday (0..7). */
export function countConsecutiveDays(days: string[], now = new Date()): { claimedToday: boolean; streak: number } {
  const set = new Set(days);
  const today = utcDay(now);
  const claimedToday = set.has(today);
  let streak = 0;
  const startOffset = claimedToday ? 0 : -1;
  for (let i = 0; i < 7; i++) {
    if (set.has(shiftUtcDay(now, startOffset - i))) streak++;
    else break;
  }
  return { claimedToday, streak };
}

export async function dailyStreakStatus(userId: string, settings: SiteSettings, now = new Date()) {
  const since30d = new Date(now.getTime() - 30 * 86_400_000);
  const [recent, earned30d] = await Promise.all([
    db.dailyClaim.findMany({ where: { userId }, orderBy: { day: "desc" }, take: 14, select: { day: true } }),
    settings.dailyMinEarnedCents > 0 ? realEarnedCoins(userId, since30d) : Promise.resolve(0),
  ]);
  const { claimedToday, streak } = countConsecutiveDays(recent.map((r) => r.day), now);
  const ladder = streakLadder(settings.dailyMin, settings.dailyMax);
  // Next day index (0..6): after day 7, cycles cleanly back to day 1.
  const nextIndex = claimedToday ? Math.max(0, (streak - 1) % 7) : streak % 7;
  const requiredCoins = centsToCoins(settings.dailyMinEarnedCents, settings.coinsPerUsd);
  const eligible = requiredCoins === 0 || earned30d >= requiredCoins;
  return {
    claimedToday,
    streak,
    nextDayNumber: nextIndex + 1,
    nextCoins: ladder[nextIndex]!,
    ladder,
    eligible,
    earned30d,
    requiredCoins,
  };
}

/** One chest per UTC day. The (userId, day) primary key makes a double claim impossible. */
export async function claimDailyBonus(userId: string, settings: SiteSettings, now = new Date()) {
  const status = await dailyStreakStatus(userId, settings, now);
  if (status.claimedToday) return { ok: false as const, reason: "ALREADY_CLAIMED" as const };
  if (!status.eligible) {
    return { ok: false as const, reason: "EARN_REQUIRED" as const, needCoins: Math.max(1, status.requiredCoins - status.earned30d) };
  }
  const coins = status.nextCoins;
  const dayNum = status.nextDayNumber;
  try {
    await db.$transaction(async (tx) => {
      await tx.dailyClaim.create({ data: { userId, day: utcDay(now), coins } });
      if (coins > 0) {
        await addEntry(tx, {
          userId,
          amount: coins,
          bucket: "AVAILABLE",
          kind: "BONUS",
          description: { k: "Daily bonus · Day {d}", a: { d: dayNum } },
        });
      }
    });
    return { ok: true as const, coins, day: dayNum };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false as const, reason: "ALREADY_CLAIMED" as const };
    throw e;
  }
}

export async function hasClaimedToday(userId: string, now = new Date()) {
  const c = await db.dailyClaim.findUnique({ where: { userId_day: { userId, day: utcDay(now) } } });
  return !!c;
}

export type PromoError = "INVALID" | "EXHAUSTED" | "ALREADY_USED";

export function normalisePromo(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

export async function redeemPromo(userId: string, rawCode: string) {
  const code = normalisePromo(rawCode);
  if (!code) return { ok: false as const, reason: "INVALID" as PromoError };
  try {
    return await db.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({ where: { code } });
      if (!promo || !promo.active) return { ok: false as const, reason: "INVALID" as PromoError };
      // Atomic "uses < maxUses" check and increment.
      const bumped = await tx.promoCode.updateMany({
        where: { code, active: true, uses: { lt: promo.maxUses } },
        data: { uses: { increment: 1 } },
      });
      if (bumped.count !== 1) return { ok: false as const, reason: "EXHAUSTED" as PromoError };
      await tx.promoRedemption.create({ data: { code, userId } });
      await addEntry(tx, { userId, amount: promo.coins, bucket: "AVAILABLE", kind: "PROMO", description: { k: "Promo code {code}", a: { code } } });
      return { ok: true as const, coins: promo.coins, code };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false as const, reason: "ALREADY_USED" as PromoError };
    throw e;
  }
}
