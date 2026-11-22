import "server-only";
import type { Tx } from "@/lib/db";
import { db } from "@/lib/db";
import type { LedgerBucket, LedgerKind } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type { SiteSettings } from "./settings";

/** Translatable description stored with each entry: message key + arguments. */
export type Desc = { k: string; a?: Record<string, string | number> };

export class InsufficientFundsError extends Error {
  constructor() {
    super("INSUFFICIENT_FUNDS");
  }
}

/** Kinds that count towards lifetime earnings (and levels). */
const EARNING_KINDS: ReadonlySet<LedgerKind> = new Set([
  "WELCOME",
  "OFFER",
  "SURVEY",
  "BONUS",
  "REFERRAL",
  "INVITE_BONUS",
  "PROMO",
  "CONTEST",
]);

type EntryInput = {
  userId: string;
  amount: number;
  bucket: LedgerBucket;
  kind: LedgerKind;
  description: Desc;
  refType?: string;
  refId?: string;
  releaseAt?: Date | null;
};

/**
 * Writes one ledger entry and moves the cached balance by the same amount.
 * Must run inside a transaction. Use `debitAvailable` for anything that must
 * not take the balance below zero.
 */
export async function addEntry(tx: Tx, e: EntryInput) {
  if (!Number.isInteger(e.amount) || e.amount === 0) throw new Error("Ledger amount must be a non-zero integer");
  const entry = await tx.ledgerEntry.create({
    data: {
      userId: e.userId,
      amount: e.amount,
      bucket: e.bucket,
      kind: e.kind,
      description: e.description as Prisma.InputJsonValue,
      refType: e.refType,
      refId: e.refId,
      releaseAt: e.releaseAt ?? null,
    },
  });
  const earning = EARNING_KINDS.has(e.kind) && e.amount > 0;
  await tx.user.update({
    where: { id: e.userId },
    data: {
      ...(e.bucket === "AVAILABLE" ? { balance: { increment: e.amount } } : { pending: { increment: e.amount } }),
      ...(earning ? { lifetimeEarned: { increment: e.amount } } : {}),
    },
  });
  return entry;
}

/**
 * Takes coins from the available balance only if enough is there. The check and
 * the update are one SQL statement, so two requests at the same moment cannot
 * both spend the same coins.
 */
export async function debitAvailable(tx: Tx, e: Omit<EntryInput, "bucket" | "amount"> & { coins: number }) {
  if (!Number.isInteger(e.coins) || e.coins <= 0) throw new Error("Debit must be a positive integer");
  const res = await tx.user.updateMany({
    where: { id: e.userId, balance: { gte: e.coins } },
    data: { balance: { decrement: e.coins } },
  });
  if (res.count !== 1) throw new InsufficientFundsError();
  return tx.ledgerEntry.create({
    data: {
      userId: e.userId,
      amount: -e.coins,
      bucket: "AVAILABLE",
      kind: e.kind,
      description: e.description as Prisma.InputJsonValue,
      refType: e.refType,
      refId: e.refId,
    },
  });
}

/**
 * Credits an offer or survey reward. Large rewards are held in PENDING for
 * `holdDays`. The referrer's commission follows the same bucket and release date,
 * so a reversed reward also takes back the commission.
 */
export async function creditEarning(
  tx: Tx,
  args: {
    userId: string;
    coins: number;
    kind: "OFFER" | "SURVEY";
    description: Desc;
    refType: string;
    refId: string;
    settings: SiteSettings;
    now?: Date;
  },
) {
  const { settings } = args;
  const now = args.now ?? new Date();
  if (args.coins <= 0) return { held: false, commission: 0 };
  const holdCoins = Math.ceil((settings.holdThresholdCents * settings.coinsPerUsd) / 100);
  const held = settings.holdDays > 0 && args.coins >= holdCoins;
  const releaseAt = held ? new Date(now.getTime() + settings.holdDays * 86_400_000) : null;
  const bucket: LedgerBucket = held ? "PENDING" : "AVAILABLE";

  await addEntry(tx, {
    userId: args.userId,
    amount: args.coins,
    bucket,
    kind: args.kind,
    description: args.description,
    refType: args.refType,
    refId: args.refId,
    releaseAt,
  });

  const user = await tx.user.findUniqueOrThrow({
    where: { id: args.userId },
    select: { name: true, referredBy: { select: { id: true, status: true } } },
  });
  let commission = 0;
  if (user.referredBy && user.referredBy.status === "ACTIVE" && settings.referralPct > 0) {
    commission = Math.floor((args.coins * settings.referralPct) / 100);
    if (commission > 0) {
      await addEntry(tx, {
        userId: user.referredBy.id,
        amount: commission,
        bucket,
        kind: "REFERRAL",
        description: { k: "Referral commission from {n}", a: { n: user.name } },
        refType: `referral:${args.refType}`,
        refId: args.refId,
        releaseAt,
      });
    }
  }
  await tx.user.update({ where: { id: args.userId }, data: { lastSeenAt: now } });
  return { held, commission };
}

/**
 * Takes back every positive entry created for (refType, refId), including the
 * referral commission. Pending coins leave the pending bucket; coins that were
 * already released come off the available balance, which may go negative.
 */
export async function reverseEarning(tx: Tx, refType: string, refId: string, reason: Desc) {
  const entries = await tx.ledgerEntry.findMany({
    where: { refId, refType: { in: [refType, `referral:${refType}`] }, amount: { gt: 0 }, kind: { not: "RELEASE" } },
  });
  let total = 0;
  for (const e of entries) {
    const stillPending = e.bucket === "PENDING" && !e.releasedAt;
    if (stillPending) {
      // stop it from being released later
      const claimed = await tx.ledgerEntry.updateMany({ where: { id: e.id, releasedAt: null }, data: { releasedAt: new Date() } });
      if (claimed.count !== 1) continue;
    }
    await addEntry(tx, {
      userId: e.userId,
      amount: -e.amount,
      bucket: stillPending ? "PENDING" : "AVAILABLE",
      kind: "REVERSAL",
      description: reason,
      refType: e.refType ?? undefined,
      refId: e.refId ?? undefined,
    });
    await tx.user.update({ where: { id: e.userId }, data: { lifetimeEarned: { decrement: e.amount } } });
    total += e.amount;
  }
  return total;
}

/** Moves matured PENDING credits to AVAILABLE. Safe to run concurrently. */
export async function releaseDueHolds(opts: { userId?: string; now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const due = await db.ledgerEntry.findMany({
    where: {
      bucket: "PENDING",
      amount: { gt: 0 },
      releasedAt: null,
      releaseAt: { lte: now },
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    take: opts.limit ?? 500,
    orderBy: { releaseAt: "asc" },
  });
  let released = 0;
  for (const e of due) {
    await db.$transaction(async (tx) => {
      const claimed = await tx.ledgerEntry.updateMany({ where: { id: e.id, releasedAt: null }, data: { releasedAt: now } });
      if (claimed.count !== 1) return; // another worker got it first
      const d: Desc = { k: "Released after review", a: {} };
      await addEntry(tx, { userId: e.userId, amount: -e.amount, bucket: "PENDING", kind: "RELEASE", description: d, refType: e.refType ?? undefined, refId: e.refId ?? undefined });
      await addEntry(tx, { userId: e.userId, amount: e.amount, bucket: "AVAILABLE", kind: "RELEASE", description: (e.description as Desc) ?? d, refType: e.refType ?? undefined, refId: e.refId ?? undefined });
      released += e.amount;
    });
  }
  return released;
}

/** Admin balance correction. Positive adds, negative removes (may go below zero). */
export async function adjustBalance(tx: Tx, userId: string, coins: number, reason: string) {
  return addEntry(tx, {
    userId,
    amount: coins,
    bucket: "AVAILABLE",
    kind: "ADJUST",
    description: { k: "{r}", a: { r: reason.slice(0, 200) } },
  });
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
