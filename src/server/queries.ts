import "server-only";
import { db } from "@/lib/db";
import type { SiteSettings } from "./settings";
import { payoutToCoins } from "@/lib/money";

export type OfferStep = { label: string; pct: number };

export function parseSteps(v: unknown): OfferStep[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is { label: unknown; pct: unknown } => !!s && typeof s === "object")
    .map((s) => ({ label: String(s.label ?? ""), pct: Number(s.pct) }))
    .filter((s) => s.label && Number.isFinite(s.pct) && s.pct > 0);
}

/** Coins a member would get for an offer (and each of its steps). */
export function offerCoins(o: { payoutCents: number; network: { userShare: number | null } }, s: SiteSettings, pct = 100) {
  const share = o.network.userShare ?? s.userSharePct;
  return payoutToCoins(Math.round((o.payoutCents * pct) / 100), share, s.coinsPerUsd);
}

export async function liveOffers() {
  return db.offer.findMany({
    where: { active: true, network: { enabled: true } },
    include: { network: { select: { name: true, userShare: true } } },
    orderBy: [{ featured: "desc" }, { payoutCents: "desc" }],
    take: 60,
  });
}

/** Recent real activity for the ticker: credited conversions and paid withdrawals. */
export async function recentActivity(limit = 12) {
  const [conv, paid] = await Promise.all([
    db.conversion.findMany({
      where: { status: "CREDITED", userId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, coins: true, offerName: true, user: { select: { name: true } } },
    }),
    db.withdrawal.findMany({
      where: { status: "PAID" },
      orderBy: { reviewedAt: "desc" },
      take: Math.ceil(limit / 3),
      select: { id: true, amountCents: true, method: true, user: { select: { name: true } } },
    }),
  ]);
  return { conv, paid };
}

export async function publicStats() {
  const [members, paid] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    db.withdrawal.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true } }),
  ]);
  return { members, paidCents: paid._sum.amountCents ?? 0 };
}

export function weekStartUtc(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

/** Top earners this week (offers, surveys and referral commission, minus reversals). */
export async function weeklyLeaderboard(limit = 10) {
  const since = weekStartUtc();
  return db.$queryRaw<{ id: string; name: string; country: string; coins: number }[]>`
    SELECT u.id, u.name, u.country, SUM(l.amount)::int AS coins
    FROM "LedgerEntry" l JOIN "User" u ON u.id = l."userId"
    WHERE l."createdAt" >= ${since}
      AND l.kind IN ('OFFER','SURVEY','REFERRAL','REVERSAL')
      AND u.status = 'ACTIVE' AND u.role = 'USER'
    GROUP BY u.id, u.name, u.country
    HAVING SUM(l.amount) > 0
    ORDER BY coins DESC
    LIMIT ${limit}`;
}

export async function weeklyCoinsFor(userId: string) {
  const since = weekStartUtc();
  const r = await db.ledgerEntry.aggregate({
    where: { userId, createdAt: { gte: since }, kind: { in: ["OFFER", "SURVEY", "REFERRAL", "REVERSAL"] } },
    _sum: { amount: true },
  });
  return r._sum.amount ?? 0;
}

/** Commission earned from each invited friend (credits minus reversals). */
export async function referralBreakdown(userId: string) {
  const friends = await db.user.findMany({
    where: { referredById: userId },
    select: { id: true, name: true, createdAt: true, lifetimeEarned: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const rows = await db.$queryRaw<{ friendId: string; coins: number }[]>`
    SELECT c."userId" AS "friendId", SUM(l.amount)::int AS coins
    FROM "LedgerEntry" l JOIN "Conversion" c ON c.id = l."refId"
    WHERE l."userId" = ${userId} AND l."refType" = 'referral:conversion' AND l.kind IN ('REFERRAL','REVERSAL')
    GROUP BY c."userId"`;
  const map = new Map(rows.map((r) => [r.friendId, r.coins]));
  const total = rows.reduce((a, r) => a + r.coins, 0);
  return { friends: friends.map((f) => ({ ...f, commission: map.get(f.id) ?? 0 })), total };
}
