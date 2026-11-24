import "server-only";
import { db } from "@/lib/db";
import { centsToCoins, formatUsd } from "@/lib/money";
import { addEntry, isUniqueViolation } from "./ledger";
import { getSettings } from "./settings";
import { notify } from "./notify";
import { weekStartUtc, weeklyLeaderboardRange } from "./queries";

export type ContestWinner = {
  userId: string;
  name: string;
  country: string;
  rank: number;
  coins: number;
  prizeCents: number;
  prizeCoins: number;
};

export function previousWeekRange(now = new Date()) {
  const end = weekStartUtc(now);
  const start = new Date(end.getTime() - 7 * 86_400_000);
  return { start, end };
}

/**
 * Pays out a completed week's leaderboard prizes atomically.
 * Primary key on ContestPayout(weekStart) guarantees a week can never be paid twice.
 */
export async function payWeeklyContest(weekStart: Date, adminId: string): Promise<{ ok: true; winners: ContestWinner[]; totalCents: number } | { ok: false; error: "ALREADY_PAID" | "WEEK_NOT_OVER" | "NO_WINNERS" }> {
  const currentStart = weekStartUtc();
  if (weekStart.getTime() >= currentStart.getTime()) return { ok: false, error: "WEEK_NOT_OVER" };
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  const settings = await getSettings();
  const limit = settings.prizesCents.length;
  if (limit === 0) return { ok: false, error: "NO_WINNERS" };
  const top = await weeklyLeaderboardRange(weekStart, weekEnd, limit);
  const winners: ContestWinner[] = top
    .map((r, i) => {
      const prizeCents = settings.prizesCents[i] ?? 0;
      const prizeCoins = centsToCoins(prizeCents, settings.coinsPerUsd);
      return { userId: r.id, name: r.name, country: r.country, rank: i + 1, coins: r.coins, prizeCents, prizeCoins };
    })
    .filter((w) => w.prizeCoins > 0);
  if (winners.length === 0) return { ok: false, error: "NO_WINNERS" };

  const totalCents = winners.reduce((a, w) => a + w.prizeCents, 0);
  try {
    await db.$transaction(async (tx) => {
      await tx.contestPayout.create({
        data: {
          weekStart,
          paidById: adminId,
          totalCents,
          winners,
        },
      });
      for (const w of winners) {
        await addEntry(tx, {
          userId: w.userId,
          amount: w.prizeCoins,
          bucket: "AVAILABLE",
          kind: "CONTEST",
          description: { k: "Weekly race · #{r} prize", a: { r: w.rank } },
          refType: "contest",
          refId: weekStart.toISOString().slice(0, 10),
        });
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "ALREADY_PAID" };
    throw e;
  }

  for (const w of winners) {
    await notify(
      w.userId,
      "earning",
      { k: "You finished #{r} in the weekly race and won {v}!", a: { r: w.rank, v: formatUsd(w.prizeCents) } },
      "/leaderboard",
    );
  }
  return { ok: true, winners, totalCents };
}
