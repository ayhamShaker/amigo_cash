import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { approveWithdrawal, markWithdrawalPaid, rejectWithdrawal, requestWithdrawal, WithdrawalError } from "@/server/withdrawals";
import { claimDailyBonus, redeemPromo } from "@/server/rewards";
import { rateLimit } from "@/server/rate-limit";
import { expectLedgerConsistent, makeUser, resetDb, useSettings } from "../support/db";

const TRON = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

beforeEach(async () => {
  await resetDb();
  await useSettings({ coinsPerUsd: 1000, autoApproveUnderCents: 1000, firstWithdrawalManual: true, requireVerifiedEmailToWithdraw: true });
});

describe("withdrawals", () => {
  it("validates method, minimum, maximum and address", async () => {
    const s = await getSettings();
    const u = await makeUser({ balance: 100_000 });
    const expectCode = async (p: Promise<unknown>, code: string) => {
      await expect(p).rejects.toSatisfy((e: unknown) => e instanceof WithdrawalError && e.code === code);
    };
    await expectCode(requestWithdrawal({ userId: u.id, method: "paypal", amountCents: 500, address: "a@b.co", settings: s }), "METHOD_DISABLED");
    await expectCode(requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 100, address: TRON, settings: s }), "BELOW_MINIMUM");
    await expectCode(requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 9_000_000, address: TRON, settings: s }), "ABOVE_MAXIMUM");
    await expectCode(requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 500, address: "not-a-wallet", settings: s }), "BAD_ADDRESS");
    await expectCode(requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 50.5, address: TRON, settings: s }), "BELOW_MINIMUM");
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(100_000);
  });

  it("needs a verified email, an active account and enough coins", async () => {
    const s = await getSettings();
    const unverified = await makeUser({ balance: 10_000, emailVerified: false });
    await expect(requestWithdrawal({ userId: unverified.id, method: "usdt", amountCents: 500, address: TRON, settings: s })).rejects.toThrow("EMAIL_NOT_VERIFIED");
    const banned = await makeUser({ balance: 10_000, status: "BANNED" });
    await expect(requestWithdrawal({ userId: banned.id, method: "usdt", amountCents: 500, address: TRON, settings: s })).rejects.toThrow("NOT_ACTIVE");
    const poor = await makeUser({ balance: 4_999 });
    await expect(requestWithdrawal({ userId: poor.id, method: "usdt", amountCents: 500, address: TRON, settings: s })).rejects.toThrow("INSUFFICIENT_FUNDS");
  });

  it("cannot spend the same coins twice, even with simultaneous requests", async () => {
    const s = await getSettings();
    const u = await makeUser({ balance: 5_000 });
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 500, address: TRON, settings: s })),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.balance).toBe(0);
    expect(await db.withdrawal.count()).toBe(1);
  });

  it("allows only one open withdrawal at a time", async () => {
    const s = await getSettings();
    const u = await makeUser({ balance: 50_000 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 500, address: TRON, settings: s })),
    );
    expect(results.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect((await expectLedgerConsistent(u.id)).user.balance).toBe(45_000);
  });

  it("keeps the first payout for review, then auto-approves small ones", async () => {
    const s = await getSettings();
    const admin = await makeUser();
    const u = await makeUser({ balance: 50_000 });
    const first = await requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 500, address: TRON, settings: s });
    expect(first.status).toBe("PENDING");
    expect(first.firstPayout).toBe(true);
    expect(await approveWithdrawal(first.id, admin.id)).toBe(true);
    expect(await approveWithdrawal(first.id, admin.id)).toBe(false);
    expect(await markWithdrawalPaid(first.id, admin.id, "0xabc")).toBe(true);
    expect(await markWithdrawalPaid(first.id, admin.id, "0xabc")).toBe(false);
    const second = await requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 500, address: TRON, settings: s });
    expect(second.status).toBe("APPROVED");
    const big = await (async () => {
      await markWithdrawalPaid(second.id, admin.id, "0xdef");
      return requestWithdrawal({ userId: u.id, method: "usdt", amountCents: 2_000, address: TRON, settings: s });
    })();
    expect(big.status).toBe("PENDING");
  });

  it("refunds a rejected withdrawal exactly once", async () => {
    const s = await getSettings();
    const admin = await makeUser();
    const u = await makeUser({ balance: 5_000 });
    const w = await requestWithdrawal({ userId: u.id, method: "binance", amountCents: 500, address: "354120987", settings: s });
    const results = await Promise.all([rejectWithdrawal(w.id, admin.id, "Wallet address is invalid"), rejectWithdrawal(w.id, admin.id, "x")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.balance).toBe(5_000);
    expect(await markWithdrawalPaid(w.id, admin.id, "late")).toBe(false);
  });
});

describe("daily bonus", () => {
  it("pays once per day even when clicked many times at once", async () => {
    const s = await getSettings();
    const u = await makeUser();
    const results = await Promise.all(Array.from({ length: 6 }, () => claimDailyBonus(u.id, s)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.balance).toBeGreaterThanOrEqual(s.dailyMin);
    expect(c.user.balance).toBeLessThanOrEqual(s.dailyMax);
    const tomorrow = await claimDailyBonus(u.id, s, new Date(Date.now() + 86_400_000));
    expect(tomorrow.ok).toBe(true);
  });
});

describe("promo codes", () => {
  it("stops at the usage limit and one use per member", async () => {
    await db.promoCode.create({ data: { code: "LIMIT1", coins: 500, maxUses: 1 } });
    const members = await Promise.all(Array.from({ length: 5 }, () => makeUser()));
    const results = await Promise.all(members.map((m) => redeemPromo(m.id, "limit1")));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await db.promoCode.findUniqueOrThrow({ where: { code: "LIMIT1" } })).uses).toBe(1);

    await db.promoCode.create({ data: { code: "MANY", coins: 100, maxUses: 100 } });
    const u = members[0]!;
    const twice = await Promise.all([redeemPromo(u.id, "MANY"), redeemPromo(u.id, " many ")]);
    expect(twice.filter((r) => r.ok)).toHaveLength(1);
    expect((await db.promoCode.findUniqueOrThrow({ where: { code: "MANY" } })).uses).toBe(1);
    expect((await redeemPromo(u.id, "NOPE")).ok).toBe(false);
    for (const m of members) expect((await expectLedgerConsistent(m.id)).ok).toBe(true);
  });
});

describe("rate limit", () => {
  it("allows up to the limit inside a window", async () => {
    const key = `t:${Math.random()}`;
    const results = await Promise.all(Array.from({ length: 7 }, () => rateLimit(key, 5, 60)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
