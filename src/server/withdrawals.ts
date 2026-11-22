import "server-only";
import { db } from "@/lib/db";
import { centsToCoins } from "@/lib/money";
import { ADDRESS_KINDS } from "@/lib/methods";
import { addEntry, debitAvailable, InsufficientFundsError } from "./ledger";
import type { SiteSettings } from "./settings";

export type WithdrawError =
  | "METHOD_DISABLED"
  | "BELOW_MINIMUM"
  | "ABOVE_MAXIMUM"
  | "BAD_ADDRESS"
  | "NOT_ACTIVE"
  | "EMAIL_NOT_VERIFIED"
  | "INSUFFICIENT_FUNDS"
  | "ALREADY_PENDING";

export class WithdrawalError extends Error {
  constructor(public code: WithdrawError) {
    super(code);
  }
}

export const MAX_WITHDRAWAL_CENTS = 50_000;

/**
 * Creates a withdrawal and takes the coins in one transaction. The debit locks
 * the member's row, so a second request at the same moment waits and then sees
 * the first one as pending.
 */
export async function requestWithdrawal(args: {
  userId: string;
  method: string;
  amountCents: number;
  address: string;
  settings: SiteSettings;
}) {
  const { settings } = args;
  const m = settings.methods.find((x) => x.id === args.method);
  if (!m || !m.enabled) throw new WithdrawalError("METHOD_DISABLED");
  if (!Number.isInteger(args.amountCents) || args.amountCents < m.minCents) throw new WithdrawalError("BELOW_MINIMUM");
  if (args.amountCents > MAX_WITHDRAWAL_CENTS) throw new WithdrawalError("ABOVE_MAXIMUM");
  const address = args.address.trim();
  if (!ADDRESS_KINDS[m.kind].re.test(address)) throw new WithdrawalError("BAD_ADDRESS");
  const coins = centsToCoins(args.amountCents, settings.coinsPerUsd);

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: args.userId },
      select: { status: true, emailVerifiedAt: true, paidOnce: true, riskScore: true, flags: true },
    });
    if (user.status !== "ACTIVE") throw new WithdrawalError("NOT_ACTIVE");
    if (settings.requireVerifiedEmailToWithdraw && !user.emailVerifiedAt) throw new WithdrawalError("EMAIL_NOT_VERIFIED");

    let debitId: string;
    try {
      const entry = await debitAvailable(tx, {
        userId: args.userId,
        coins,
        kind: "WITHDRAWAL",
        description: { k: "Withdrawal · {m}", a: { m: m.name } },
        refType: "withdrawal",
      });
      debitId = entry.id;
    } catch (e) {
      if (e instanceof InsufficientFundsError) throw new WithdrawalError("INSUFFICIENT_FUNDS");
      throw e;
    }
    const open = await tx.withdrawal.count({ where: { userId: args.userId, status: { in: ["PENDING", "APPROVED"] } } });
    if (open > 0) throw new WithdrawalError("ALREADY_PENDING");

    // Trusted members get small withdrawals approved straight away. A first
    // withdrawal always waits for the owner unless that rule is switched off.
    const autoApprove =
      (user.paidOnce || !settings.firstWithdrawalManual) &&
      args.amountCents <= settings.autoApproveUnderCents &&
      user.riskScore < 50 &&
      user.flags.length === 0;

    const w = await tx.withdrawal.create({
      data: {
        userId: args.userId,
        method: args.method,
        amountCents: args.amountCents,
        feeCents: m.feeCents,
        coins,
        address,
        status: autoApprove ? "APPROVED" : "PENDING",
        firstPayout: !user.paidOnce,
      },
    });
    // link the debit entry to the withdrawal
    await tx.ledgerEntry.update({ where: { id: debitId }, data: { refId: w.id } });
    return w;
  });
}

/** PENDING → APPROVED (ready to send). */
export async function approveWithdrawal(id: string, adminId: string) {
  const res = await db.withdrawal.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "APPROVED", reviewedById: adminId, reviewedAt: new Date() },
  });
  return res.count === 1;
}

/** PENDING/APPROVED → PAID, after the money has actually been sent. */
export async function markWithdrawalPaid(id: string, adminId: string, txRef: string) {
  return db.$transaction(async (tx) => {
    const res = await tx.withdrawal.updateMany({
      where: { id, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "PAID", reviewedById: adminId, reviewedAt: new Date(), txRef: txRef.slice(0, 200) || null },
    });
    if (res.count !== 1) return false;
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id }, select: { userId: true } });
    await tx.user.update({ where: { id: w.userId }, data: { paidOnce: true } });
    return true;
  });
}

/** PENDING/APPROVED → REJECTED and the coins go back to the member. */
export async function rejectWithdrawal(id: string, adminId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const res = await tx.withdrawal.updateMany({
      where: { id, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "REJECTED", reviewedById: adminId, reviewedAt: new Date(), note: reason.slice(0, 200) },
    });
    if (res.count !== 1) return false;
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
    await addEntry(tx, {
      userId: w.userId,
      amount: w.coins,
      bucket: "AVAILABLE",
      kind: "REFUND",
      description: { k: "Refund · withdrawal rejected: {r}", a: { r: reason.slice(0, 200) } },
      refType: "withdrawal",
      refId: w.id,
    });
    return true;
  });
}
