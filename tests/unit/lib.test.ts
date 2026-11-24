import { describe, expect, it } from "vitest";
import { decrypt, encrypt, safeEqual } from "@/lib/crypto";
import { clientIpFromHeaders, ipInAllowList } from "@/lib/ip";
import { centsToCoins, coinsToCents, payoutToCoins } from "@/lib/money";
import { parsePayoutCents, parseStatus, verifySignature, buildSignedUrl, buildSignedHeaders } from "@/server/postback";
import { streakLadder, countConsecutiveDays } from "@/server/rewards";
import { levelBoostPct } from "@/components/level";

const KEY = Buffer.alloc(32, 9).toString("base64");

describe("encryption at rest", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("JBSWY3DPEHPK3PXP", KEY);
    const b = encrypt("JBSWY3DPEHPK3PXP", KEY);
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("detects tampering", () => {
    const a = encrypt("secret", KEY);
    const [iv, tag, ct] = a.split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64url")].join("."), KEY)).toThrow();
  });
  it("fails with the wrong key", () => {
    expect(() => decrypt(encrypt("x", KEY), Buffer.alloc(32, 1).toString("base64"))).toThrow();
  });
});

describe("safeEqual", () => {
  it("compares strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("money", () => {
  it("converts payouts with the member share", () => {
    expect(payoutToCoins(1000, 70, 1000)).toBe(7000); // $10 at 70% → 7,000 coins
    expect(payoutToCoins(123, 70, 1000)).toBe(861);
    expect(payoutToCoins(1000, 70, 1000, 20)).toBe(8400);
    expect(payoutToCoins(0, 70, 1000)).toBe(0);
    expect(payoutToCoins(-5, 70, 1000)).toBe(0);
  });
  it("converts coins and cents", () => {
    expect(centsToCoins(500, 1000)).toBe(5000);
    expect(coinsToCents(5999, 1000)).toBe(599);
  });
});

describe("postback parsing", () => {
  it("parses payouts without floating point errors", () => {
    expect(parsePayoutCents("12.5")).toBe(1250);
    expect(parsePayoutCents("0.80")).toBe(80);
    expect(parsePayoutCents("3")).toBe(300);
    expect(parsePayoutCents("0.105")).toBe(11);
    expect(parsePayoutCents("0.1049")).toBe(10);
    expect(parsePayoutCents("-1")).toBeNull();
    expect(parsePayoutCents("1e5")).toBeNull();
    expect(parsePayoutCents("abc")).toBeNull();
    expect(parsePayoutCents(null)).toBeNull();
  });
  it("maps status values", () => {
    expect(parseStatus("1")).toBe("credit");
    expect(parseStatus(null)).toBe("credit");
    expect(parseStatus("2")).toBe("reversal");
    expect(parseStatus("chargeback")).toBe("reversal");
    expect(parseStatus("1", "1")).toBe("reversal");
    expect(parseStatus("9")).toBeNull();
  });
  it("verifies real offerwall signature modes", () => {
    const modes = ["HMAC_SHA256", "MD5_CONCAT", "SECRET_PARAM", "HMAC_SHA1_URL", "TOROX_MD5", "CPX_MD5", "AYET_HMAC", "LOOTABLY_SHA256"] as const;
    for (const mode of modes) {
      const url = buildSignedUrl(mode, "my-secret", "https://amigo.cash/api/postback/net", {
        subid: "u123",
        txid: "tx-99",
        payout: "2.50",
        status: "1",
        offer: "Castle Clash",
      });
      const headers = buildSignedHeaders(mode, "my-secret", url);
      expect(verifySignature(mode, "my-secret", url, headers)).toBe(true);
      expect(verifySignature(mode, "wrong-secret", url, headers)).toBe(false);
    }
  });
});

describe("profit-safe streak and levels", () => {
  it("builds a bounded 7-day escalating streak ladder", () => {
    const ladder = streakLadder(10, 60);
    expect(ladder).toHaveLength(7);
    expect(ladder[0]).toBe(10);
    expect(ladder[6]).toBe(60);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThanOrEqual(ladder[i - 1]!);
  });
  it("counts consecutive UTC days accurately", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    expect(countConsecutiveDays(["2026-11-24", "2026-11-23", "2026-11-22"], now)).toEqual({ claimedToday: true, streak: 3 });
    expect(countConsecutiveDays(["2026-11-23", "2026-11-22"], now)).toEqual({ claimedToday: false, streak: 2 });
    expect(countConsecutiveDays(["2026-11-20"], now)).toEqual({ claimedToday: false, streak: 0 });
  });
  it("caps level boost cleanly from 0% to 5%", () => {
    expect(levelBoostPct(0, true)).toBe(0);
    expect(levelBoostPct(10_000, true)).toBe(1);
    expect(levelBoostPct(50_000, true)).toBe(2);
    expect(levelBoostPct(150_000, true)).toBe(3);
    expect(levelBoostPct(500_000, true)).toBe(5);
    expect(levelBoostPct(500_000, false)).toBe(0);
  });
});

describe("client IP", () => {
  it("trusts only the configured number of proxies", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" });
    expect(clientIpFromHeaders(h, 1)).toBe("10.0.0.1");
    expect(clientIpFromHeaders(h, 2)).toBe("1.2.3.4");
  });
  it("ignores cf-connecting-ip unless told to trust Cloudflare", () => {
    const h = new Headers({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" });
    expect(clientIpFromHeaders(h, 1)).toBe("1.1.1.1");
    expect(clientIpFromHeaders(h, 1, true)).toBe("9.9.9.9");
  });
  it("ignores garbage", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "not-an-ip" }), 1)).toBeNull();
  });
  it("matches allow lists with CIDR", () => {
    expect(ipInAllowList("203.0.113.9", ["203.0.113.0/24"])).toBe(true);
    expect(ipInAllowList("203.0.114.9", ["203.0.113.0/24"])).toBe(false);
    expect(ipInAllowList("::ffff:198.51.100.7", ["198.51.100.7"])).toBe(true);
    expect(ipInAllowList("1.1.1.1", ["bad/99", ""])).toBe(false);
  });
});
