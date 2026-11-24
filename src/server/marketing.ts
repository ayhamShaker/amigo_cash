import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { CREATOR_COOKIE, decodeAttribution, SOURCE_COOKIE, type Attribution } from "@/lib/attribution";

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;

function todayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Counts one visit (a browser session) for a source, and optionally country + device. */
export async function recordVisit(source: string, creatorId: string | null, country?: string | null, device?: string | null) {
  const day = todayUtc();
  await db.$executeRaw`
    INSERT INTO "TrafficDay" ("day", "source", "creatorId", "visits") VALUES (${day}, ${source}, ${creatorId ?? ""}, 1)
    ON CONFLICT ("day", "source", "creatorId") DO UPDATE SET "visits" = "TrafficDay"."visits" + 1`;
  const cc = country && /^[A-Z]{2}$/.test(country) ? country : "XX";
  const dev = device === "android" || device === "ios" || device === "desktop" ? device : "desktop";
  if (country !== undefined || device !== undefined) {
    await db.$executeRaw`
      INSERT INTO "TrafficCountry" ("day", "country", "device", "visits") VALUES (${day}, ${cc}, ${dev}, 1)
      ON CONFLICT ("day", "country", "device") DO UPDATE SET "visits" = "TrafficCountry"."visits" + 1`;
  }
}

export type SignupAttribution = Attribution & { creatorId: string | null; creatorBonus: number; creatorName: string | null };

/** Reads the visitor's source and creator cookies at sign-up. */
export async function signupAttribution(): Promise<SignupAttribution | null> {
  const jar = await cookies();
  const a = decodeAttribution(jar.get(SOURCE_COOKIE)?.value);
  const cid = jar.get(CREATOR_COOKIE)?.value;
  const creator = cid ? await db.creator.findUnique({ where: { id: cid }, select: { id: true, name: true, active: true, bonusCoins: true } }) : null;
  const live = creator?.active ? creator : null;
  if (!a && !live) return null;
  return {
    source: live ? "creator" : (a?.source ?? "direct"),
    medium: a?.medium ?? null,
    campaign: live ? null : (a?.campaign ?? null),
    refHost: a?.refHost ?? null,
    creatorId: live?.id ?? null,
    creatorBonus: live?.bonusCoins ?? 0,
    creatorName: live?.name ?? null,
  };
}

export async function clearAttributionCookies() {
  const jar = await cookies();
  jar.delete(SOURCE_COOKIE);
  jar.delete(CREATOR_COOKIE);
}

/* ---------------- reports ---------------- */

export type FunnelRow = {
  key: string;
  visits: number;
  signups: number;
  confirmed: number;
  earners: number;
  earnedCoins: number;
  revenueCents: number;
  paidCents: number;
};

type RawRow = { key: string | null; signups: bigint; confirmed: bigint; earners: bigint; earned: bigint | null; revenue: bigint | null; paid: bigint | null };

function toRows(raw: RawRow[], visits: Map<string, number>): FunnelRow[] {
  const out = new Map<string, FunnelRow>();
  for (const r of raw) {
    const key = r.key ?? "direct";
    out.set(key, {
      key,
      visits: visits.get(key) ?? 0,
      signups: Number(r.signups),
      confirmed: Number(r.confirmed),
      earners: Number(r.earners),
      earnedCoins: Number(r.earned ?? 0),
      revenueCents: Number(r.revenue ?? 0),
      paidCents: Number(r.paid ?? 0),
    });
  }
  for (const [key, v] of visits) if (!out.has(key)) out.set(key, { key, visits: v, signups: 0, confirmed: 0, earners: 0, earnedCoins: 0, revenueCents: 0, paidCents: 0 });
  return [...out.values()].sort((a, b) => b.signups - a.signups || b.visits - a.visits);
}

/**
 * Members who signed up since `since`, grouped by source: sign-ups, confirmed
 * emails, members who earned anything, what they earned, what the networks
 * paid us for them and what we paid out to them.
 */
export async function sourceFunnel(since: Date): Promise<FunnelRow[]> {
  const raw = await db.$queryRaw<RawRow[]>`
    SELECT COALESCE(u."source", 'direct') AS key,
      COUNT(*) AS signups,
      COUNT(u."emailVerifiedAt") AS confirmed,
      COUNT(*) FILTER (WHERE u."lifetimeEarned" > 0) AS earners,
      SUM(u."lifetimeEarned") AS earned,
      SUM((SELECT COALESCE(SUM(c."payoutCents"), 0) FROM "Conversion" c WHERE c."userId" = u.id AND c.status = 'CREDITED')) AS revenue,
      SUM((SELECT COALESCE(SUM(w."amountCents"), 0) FROM "Withdrawal" w WHERE w."userId" = u.id AND w.status = 'PAID')) AS paid
    FROM "User" u
    WHERE u."createdAt" >= ${since} AND u.role = 'USER'
    GROUP BY 1`;
  const v = await db.$queryRaw<{ source: string; visits: bigint }[]>`
    SELECT "source", SUM("visits") AS visits FROM "TrafficDay" WHERE "day" >= ${todayUtc(since)} GROUP BY 1`;
  return toRows(raw, new Map(v.map((x) => [x.source, Number(x.visits)])));
}

/** The same funnel by campaign (utm_campaign). */
export async function campaignFunnel(since: Date): Promise<FunnelRow[]> {
  const raw = await db.$queryRaw<RawRow[]>`
    SELECT COALESCE(u."source", 'direct') || ' · ' || u."campaign" AS key,
      COUNT(*) AS signups,
      COUNT(u."emailVerifiedAt") AS confirmed,
      COUNT(*) FILTER (WHERE u."lifetimeEarned" > 0) AS earners,
      SUM(u."lifetimeEarned") AS earned,
      SUM((SELECT COALESCE(SUM(c."payoutCents"), 0) FROM "Conversion" c WHERE c."userId" = u.id AND c.status = 'CREDITED')) AS revenue,
      SUM((SELECT COALESCE(SUM(w."amountCents"), 0) FROM "Withdrawal" w WHERE w."userId" = u.id AND w.status = 'PAID')) AS paid
    FROM "User" u
    WHERE u."createdAt" >= ${since} AND u.role = 'USER' AND u."campaign" IS NOT NULL
    GROUP BY 1`;
  return toRows(raw, new Map());
}

/** Visitors (TrafficCountry) + signed-up members grouped by country code. */
export async function countryFunnel(since: Date): Promise<FunnelRow[]> {
  const raw = await db.$queryRaw<RawRow[]>`
    SELECT COALESCE(NULLIF(u."country", ''), 'XX') AS key,
      COUNT(*) AS signups,
      COUNT(u."emailVerifiedAt") AS confirmed,
      COUNT(*) FILTER (WHERE u."lifetimeEarned" > 0) AS earners,
      SUM(u."lifetimeEarned") AS earned,
      SUM((SELECT COALESCE(SUM(c."payoutCents"), 0) FROM "Conversion" c WHERE c."userId" = u.id AND c.status = 'CREDITED')) AS revenue,
      SUM((SELECT COALESCE(SUM(w."amountCents"), 0) FROM "Withdrawal" w WHERE w."userId" = u.id AND w.status = 'PAID')) AS paid
    FROM "User" u
    WHERE u."createdAt" >= ${since} AND u.role = 'USER'
    GROUP BY 1`;
  const v = await db.$queryRaw<{ country: string; visits: bigint }[]>`
    SELECT "country", SUM("visits") AS visits FROM "TrafficCountry" WHERE "day" >= ${todayUtc(since)} GROUP BY 1`;
  return toRows(raw, new Map(v.map((x) => [x.country, Number(x.visits)]))).sort((a, b) => b.visits - a.visits || b.signups - a.signups);
}

/** Visitor sessions grouped by device type (android / ios / desktop). */
export async function deviceReport(since: Date): Promise<{ device: string; visits: number }[]> {
  const rows = await db.$queryRaw<{ device: string; visits: bigint }[]>`
    SELECT "device", SUM("visits") AS visits FROM "TrafficCountry" WHERE "day" >= ${todayUtc(since)} GROUP BY 1 ORDER BY visits DESC`;
  return rows.map((r) => ({ device: r.device, visits: Number(r.visits) }));
}

export type CreatorRow = FunnelRow & { id: string; slug: string; name: string; platform: string; active: boolean; bonusCoins: number; clicks: number; account: { id: string; email: string } | null; commissionCoins: number; notes: string };

/** Every creator with the members their link brought (all time) and the commission they earned from them. */
export async function creatorReport(): Promise<CreatorRow[]> {
  const creators = await db.creator.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, email: true } } } });
  if (!creators.length) return [];
  const raw = await db.$queryRaw<(RawRow & { key: string })[]>`
    SELECT u."creatorId" AS key,
      COUNT(*) AS signups,
      COUNT(u."emailVerifiedAt") AS confirmed,
      COUNT(*) FILTER (WHERE u."lifetimeEarned" > 0) AS earners,
      SUM(u."lifetimeEarned") AS earned,
      SUM((SELECT COALESCE(SUM(c."payoutCents"), 0) FROM "Conversion" c WHERE c."userId" = u.id AND c.status = 'CREDITED')) AS revenue,
      SUM((SELECT COALESCE(SUM(w."amountCents"), 0) FROM "Withdrawal" w WHERE w."userId" = u.id AND w.status = 'PAID')) AS paid
    FROM "User" u
    WHERE u."creatorId" IS NOT NULL
    GROUP BY 1`;
  const byId = new Map(raw.map((r) => [r.key, r]));
  const accountIds = creators.map((c) => c.userId).filter((x): x is string => !!x);
  const commission = accountIds.length
    ? await db.ledgerEntry.groupBy({ by: ["userId"], where: { userId: { in: accountIds }, kind: { in: ["REFERRAL", "REVERSAL"] }, refType: { startsWith: "referral:" } }, _sum: { amount: true } })
    : [];
  const comm = new Map(commission.map((c) => [c.userId, c._sum.amount ?? 0]));
  return creators.map((c) => {
    const r = byId.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      platform: c.platform,
      active: c.active,
      bonusCoins: c.bonusCoins,
      clicks: c.clicks,
      notes: c.notes,
      account: c.user,
      commissionCoins: c.userId ? (comm.get(c.userId) ?? 0) : 0,
      key: c.slug,
      visits: c.clicks,
      signups: Number(r?.signups ?? 0),
      confirmed: Number(r?.confirmed ?? 0),
      earners: Number(r?.earners ?? 0),
      earnedCoins: Number(r?.earned ?? 0),
      revenueCents: Number(r?.revenue ?? 0),
      paidCents: Number(r?.paid ?? 0),
    };
  });
}
