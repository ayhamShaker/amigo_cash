import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { hmacSha256Hex, md5Hex } from "@/lib/crypto";
import { canonicalString, handlePostback, adminReverseConversion } from "@/server/postback";
import { releaseDueHolds } from "@/server/ledger";
import { expectLedgerConsistent, makeNetwork, makeUser, resetDb, useSettings } from "../support/db";

const SECRET = "s3cret";

function signedUrl(p: { subid: string; txid: string; payout: string; status?: string; offer?: string }, net = "testnet", secret = SECRET) {
  const status = p.status ?? "1";
  const sig = hmacSha256Hex(secret, canonicalString({ subid: p.subid, txid: p.txid, payout: p.payout, status }));
  const q = new URLSearchParams({ subid: p.subid, txid: p.txid, payout: p.payout, status, offer: p.offer ?? "Tile Harbor", sig });
  return new URL(`https://amigo.cash/api/postback/${net}?${q}`);
}

beforeEach(async () => {
  await resetDb();
  await useSettings({ holdThresholdCents: 500, holdDays: 7, userSharePct: 70, referralPct: 10, coinsPerUsd: 1000 });
});

describe("postback security", () => {
  it("refuses unknown and disabled networks", async () => {
    const u = await makeUser();
    expect((await handlePostback("nope", signedUrl({ subid: u.id, txid: "t1", payout: "1" }), "1.1.1.1")).http).toBe(404);
    await makeNetwork("off", { enabled: false });
    expect((await handlePostback("off", signedUrl({ subid: u.id, txid: "t1", payout: "1" }, "off"), "1.1.1.1")).http).toBe(403);
  });

  it("refuses a wrong or missing signature and credits nothing", async () => {
    const u = await makeUser();
    await makeNetwork();
    const bad = signedUrl({ subid: u.id, txid: "t1", payout: "1" }, "testnet", "wrong");
    expect((await handlePostback("testnet", bad, null)).http).toBe(403);
    const url = signedUrl({ subid: u.id, txid: "t1", payout: "1" });
    url.searchParams.delete("sig");
    expect((await handlePostback("testnet", url, null)).http).toBe(403);
    // tampering with the payout breaks the signature
    const tampered = signedUrl({ subid: u.id, txid: "t2", payout: "1" });
    tampered.searchParams.set("payout", "100");
    expect((await handlePostback("testnet", tampered, null)).http).toBe(403);
    expect(await db.conversion.count()).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(0);
  });

  it("enforces the IP allow list", async () => {
    const u = await makeUser();
    await makeNetwork("testnet", { allowedIps: ["203.0.113.0/24"] });
    expect((await handlePostback("testnet", signedUrl({ subid: u.id, txid: "t1", payout: "1" }), "8.8.8.8")).http).toBe(403);
    expect((await handlePostback("testnet", signedUrl({ subid: u.id, txid: "t1", payout: "1" }), null)).http).toBe(403);
    expect((await handlePostback("testnet", signedUrl({ subid: u.id, txid: "t1", payout: "1" }), "203.0.113.50")).body).toBe("1");
  });

  it("supports MD5, secret-param and HMAC-SHA1 URL modes", async () => {
    const u = await makeUser();
    await makeNetwork("md5net", { mode: "MD5_CONCAT" });
    const q = new URLSearchParams({ subid: u.id, txid: "m1", payout: "1.00", status: "1", sig: md5Hex(`${u.id}m11.00${SECRET}`) });
    expect((await handlePostback("md5net", new URL(`https://x/api?${q}`), null)).outcome).toBe("credited");

    await makeNetwork("secnet", { mode: "SECRET_PARAM" });
    const q2 = new URLSearchParams({ subid: u.id, txid: "s1", payout: "1.00", status: "1", secret: SECRET });
    expect((await handlePostback("secnet", new URL(`https://x/api?${q2}`), null)).outcome).toBe("credited");
    const conv = await db.conversion.findFirstOrThrow({ where: { networkId: "secnet" } });
    expect(JSON.stringify(conv.raw)).not.toContain(SECRET); // secret is never stored

    await makeNetwork("urlnet", { mode: "HMAC_SHA1_URL", kind: "Surveys" });
    const base = `https://amigo.cash/api/postback/urlnet?subid=${u.id}&txid=h1&payout=1.00&status=1`;
    const hash = createHmac("sha1", SECRET).update(base).digest("hex");
    expect((await handlePostback("urlnet", new URL(`${base}&hash=${hash}`), null)).outcome).toBe("credited");
    expect((await handlePostback("urlnet", new URL(`${base}&hash=${"0".repeat(40)}`), null)).http).toBe(403);
  });

  it("rejects malformed parameters", async () => {
    const u = await makeUser();
    await makeNetwork();
    expect((await handlePostback("testnet", signedUrl({ subid: u.id, txid: "bad txid!", payout: "1" }), null)).http).toBe(400);
    expect((await handlePostback("testnet", signedUrl({ subid: u.id, txid: "t1", payout: "1e9" }), null)).http).toBe(400);
  });
});

describe("crediting", () => {
  it("credits small rewards straight to the balance", async () => {
    const u = await makeUser();
    await makeNetwork();
    const r = await handlePostback("testnet", signedUrl({ subid: u.id, txid: "t1", payout: "2.00" }), null);
    expect(r.outcome).toBe("credited");
    const c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.balance).toBe(1400);
    expect(c.user.pending).toBe(0);
    expect(c.user.lifetimeEarned).toBe(1400);
  });

  it("holds large rewards and releases them after the hold", async () => {
    const u = await makeUser();
    await makeNetwork();
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "big", payout: "20.00" }), null);
    let c = await expectLedgerConsistent(u.id);
    expect(c.user.pending).toBe(14000);
    expect(c.user.balance).toBe(0);
    expect(await releaseDueHolds({ now: new Date(Date.now() + 6 * 86_400_000) })).toBe(0);
    expect(await releaseDueHolds({ now: new Date(Date.now() + 8 * 86_400_000) })).toBe(14000);
    // a second run releases nothing
    expect(await releaseDueHolds({ now: new Date(Date.now() + 9 * 86_400_000) })).toBe(0);
    c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.balance).toBe(14000);
    expect(c.user.pending).toBe(0);
    expect(c.user.lifetimeEarned).toBe(14000);
  });

  it("uses the network's own member share", async () => {
    const u = await makeUser();
    await makeNetwork("testnet", { userShare: 50 });
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "t1", payout: "2.00" }), null);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(1000);
  });

  it("is idempotent, including many identical postbacks at once", async () => {
    const u = await makeUser();
    await makeNetwork();
    const url = signedUrl({ subid: u.id, txid: "dup", payout: "3.00" });
    const results = await Promise.all(Array.from({ length: 8 }, () => handlePostback("testnet", url, null)));
    expect(results.filter((r) => r.outcome === "credited")).toHaveLength(1);
    expect(results.every((r) => r.body === "1")).toBe(true);
    const c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.balance).toBe(2100);
  });

  it("records but does not pay unknown or banned members", async () => {
    const banned = await makeUser({ status: "BANNED" });
    await makeNetwork();
    expect((await handlePostback("testnet", signedUrl({ subid: "nobody", txid: "a", payout: "1" }), null)).body).toBe("0");
    expect((await handlePostback("testnet", signedUrl({ subid: banned.id, txid: "b", payout: "1" }), null)).body).toBe("0");
    expect(await db.conversion.count({ where: { status: "REJECTED" } })).toBe(2);
    expect((await db.user.findUniqueOrThrow({ where: { id: banned.id } })).balance).toBe(0);
  });
});

describe("referrals", () => {
  it("pays the referrer a commission and takes it back on reversal", async () => {
    const ref = await makeUser();
    const friend = await makeUser({ referredById: ref.id });
    await makeNetwork();
    await handlePostback("testnet", signedUrl({ subid: friend.id, txid: "r1", payout: "4.00" }), null);
    expect((await db.user.findUniqueOrThrow({ where: { id: ref.id } })).balance).toBe(280); // 10% of 2,800
    await handlePostback("testnet", signedUrl({ subid: friend.id, txid: "r1", payout: "4.00", status: "2" }), null);
    const r = await expectLedgerConsistent(ref.id);
    const f = await expectLedgerConsistent(friend.id);
    expect(r.ok && f.ok).toBe(true);
    expect(r.user.balance).toBe(0);
    expect(f.user.balance).toBe(0);
    expect(f.user.lifetimeEarned).toBe(0);
    expect(f.user.flags).toContain("Reversal");
  });

  it("holds the commission together with a held reward", async () => {
    const ref = await makeUser();
    const friend = await makeUser({ referredById: ref.id });
    await makeNetwork();
    await handlePostback("testnet", signedUrl({ subid: friend.id, txid: "big", payout: "10.00" }), null);
    const r = await db.user.findUniqueOrThrow({ where: { id: ref.id } });
    expect(r.pending).toBe(700);
    expect(r.balance).toBe(0);
  });
});

describe("reversals", () => {
  it("removes a still-pending reward from pending, and it is never released", async () => {
    const u = await makeUser();
    await makeNetwork();
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "p1", payout: "10.00" }), null);
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "p1", payout: "10.00", status: "2" }), null);
    await releaseDueHolds({ now: new Date(Date.now() + 30 * 86_400_000) });
    const c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.pending).toBe(0);
    expect(c.user.balance).toBe(0);
  });

  it("takes released coins off the balance, even below zero", async () => {
    const u = await makeUser();
    await makeNetwork();
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "x1", payout: "2.00" }), null);
    await db.$transaction(async (tx) => {
      const { debitAvailable } = await import("@/server/ledger");
      await debitAvailable(tx, { userId: u.id, coins: 1400, kind: "WITHDRAWAL", description: { k: "test" } });
    });
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "x1", payout: "2.00", status: "2" }), null);
    const c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.balance).toBe(-1400);
  });

  it("ignores a repeated reversal and blocks a credit that arrives after its reversal", async () => {
    const u = await makeUser();
    await makeNetwork();
    expect((await handlePostback("testnet", signedUrl({ subid: u.id, txid: "late", payout: "1", status: "2" }), null)).outcome).toBe("reversal_recorded");
    expect((await handlePostback("testnet", signedUrl({ subid: u.id, txid: "late", payout: "1" }), null)).outcome).toBe("duplicate");
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "y", payout: "1" }), null);
    const rev = signedUrl({ subid: u.id, txid: "y", payout: "1", status: "2" });
    const outcomes = await Promise.all([handlePostback("testnet", rev, null), handlePostback("testnet", rev, null)]);
    expect(outcomes.map((o) => o.outcome).sort()).toEqual(["duplicate", "reversed"]);
    const c = await expectLedgerConsistent(u.id);
    expect(c.ok).toBe(true);
    expect(c.user.balance).toBe(0);
  });

  it("lets the admin reverse a conversion once", async () => {
    const u = await makeUser();
    await makeNetwork();
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "z", payout: "1" }), null);
    const conv = await db.conversion.findFirstOrThrow();
    expect(await adminReverseConversion(conv.id)).toBe(700);
    expect(await adminReverseConversion(conv.id)).toBe(0);
    expect((await expectLedgerConsistent(u.id)).user.balance).toBe(0);
  });
});

describe("admin test postback", () => {
  it("signs correctly for every mode and credits through the normal pipeline", async () => {
    const { buildSignedUrl } = await import("@/server/postback");
    const u = await makeUser();
    for (const mode of ["HMAC_SHA256", "MD5_CONCAT", "SECRET_PARAM", "HMAC_SHA1_URL"] as const) {
      await makeNetwork(`n-${mode.toLowerCase().replace(/_/g, "-")}`, { mode, allowedIps: ["203.0.113.1"] });
      const id = `n-${mode.toLowerCase().replace(/_/g, "-")}`;
      const url = buildSignedUrl(mode, SECRET, `https://amigo.cash/api/postback/${id}`, { subid: u.id, txid: `t-${mode}`, payout: "1.00", status: "1", offer: "Test offer" });
      // IP allow-list still applies to real traffic…
      expect((await handlePostback(id, url, "8.8.8.8")).http).toBe(403);
      // …but not to the admin's own test
      expect((await handlePostback(id, url, null, { adminTest: true })).outcome).toBe("credited");
    }
    expect((await expectLedgerConsistent(u.id)).user.balance).toBe(2800);
  });
});

describe("notifications", () => {
  it("tells the member about credits, holds, reversals and the referrer about commission", async () => {
    const ref = await makeUser();
    const u = await makeUser({ referredById: ref.id });
    await makeNetwork();
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "n1", payout: "2.00" }), null);
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "n2", payout: "20.00" }), null);
    await handlePostback("testnet", signedUrl({ subid: u.id, txid: "n1", payout: "2.00", status: "2" }), null);
    const mine = await db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } });
    expect(mine.map((n) => (n.body as { k: string }).k)).toEqual([
      "+{c} coins for {o} were added to your balance.",
      "{c} coins for {o} are on hold for {d} days while the advertiser checks it.",
      "The advertiser reversed {o}. Those coins were removed from your balance.",
    ]);
    expect(await db.notification.count({ where: { userId: ref.id } })).toBe(2);
  });
});
