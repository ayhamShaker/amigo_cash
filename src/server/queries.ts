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
export function offerCoins(o: { payoutCents: number; network: { userShare: number | null } }, s: SiteSettings, pct = 100, boostPct = 0) {
  const share = o.network.userShare ?? s.userSharePct;
  return payoutToCoins(Math.round((o.payoutCents * pct) / 100), share, s.coinsPerUsd, boostPct);
}

export function offerMatchesCountry(countries: string[], country: string | null): boolean {
  if (!country || countries.length === 0) return true;
  return countries.includes(country.toUpperCase());
}

export function offerMatchesPlatform(platformText: string, filter: string): boolean {
  if (!filter || filter === "all") return true;
  const p = platformText.toLowerCase();
  if (filter === "android") return p.includes("android");
  if (filter === "ios") return p.includes("ios") || p.includes("iphone") || p.includes("ipad");
  if (filter === "desktop") return p.includes("desktop") || p.includes("web") || p.includes("pc") || p.includes("mac") || p.includes("windows");
  return true;
}

export async function liveOffers(country?: string | null) {
  const all = await db.offer.findMany({
    where: { active: true, network: { enabled: true } },
    include: { network: { select: { name: true, userShare: true } } },
    orderBy: [{ featured: "desc" }, { payoutCents: "desc" }],
    take: 100,
  });
  if (!country) return all.slice(0, 60);
  return all.filter((o) => offerMatchesCountry(o.countries, country)).slice(0, 60);
}

/** Recent real activity for the ticker: credited conversions and paid withdrawals (excluding admin test accounts). */
export async function recentActivity(limit = 12) {
  const [conv, paid] = await Promise.all([
    db.conversion.findMany({
      where: { status: "CREDITED", userId: { not: null }, user: { role: "USER", status: "ACTIVE" } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, coins: true, offerName: true, user: { select: { name: true } } },
    }),
    db.withdrawal.findMany({
      where: { status: "PAID", user: { role: "USER" } },
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

/** Top earners in an arbitrary [since, until) range (offers, surveys and referral commission, minus reversals). */
export async function weeklyLeaderboardRange(since: Date, until: Date, limit = 10) {
  return db.$queryRaw<{ id: string; name: string; country: string; coins: number }[]>`
    SELECT u.id, u.name, u.country, SUM(l.amount)::int AS coins
    FROM "LedgerEntry" l JOIN "User" u ON u.id = l."userId"
    WHERE l."createdAt" >= ${since}
      AND l."createdAt" < ${until}
      AND l.kind IN ('OFFER','SURVEY','REFERRAL','REVERSAL')
      AND u.status = 'ACTIVE' AND u.role = 'USER'
    GROUP BY u.id, u.name, u.country
    HAVING SUM(l.amount) > 0
    ORDER BY coins DESC
    LIMIT ${limit}`;
}

/** Top earners this week (offers, surveys and referral commission, minus reversals). */
export async function weeklyLeaderboard(limit = 10) {
  const since = weekStartUtc();
  const until = new Date(since.getTime() + 7 * 86_400_000);
  return weeklyLeaderboardRange(since, until, limit);
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
