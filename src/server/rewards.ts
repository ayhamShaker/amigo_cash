import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { addEntry, isUniqueViolation } from "./ledger";
import type { SiteSettings } from "./settings";

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** One chest per UTC day. The (userId, day) primary key makes a double claim impossible. */
export async function claimDailyBonus(userId: string, settings: SiteSettings, now = new Date()) {
  const lo = Math.min(settings.dailyMin, settings.dailyMax);
  const hi = Math.max(settings.dailyMin, settings.dailyMax);
  const coins = lo === hi ? lo : randomInt(lo, hi + 1);
  try {
    await db.$transaction(async (tx) => {
      await tx.dailyClaim.create({ data: { userId, day: utcDay(now), coins } });
      if (coins > 0) {
        await addEntry(tx, { userId, amount: coins, bucket: "AVAILABLE", kind: "BONUS", description: { k: "Daily bonus chest" } });
      }
    });
    return { ok: true as const, coins };
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
