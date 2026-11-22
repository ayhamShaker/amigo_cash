import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hmacSha256Hex } from "@/lib/crypto";
import { canonicalString, handlePostback } from "@/server/postback";
import { signup } from "@/server/auth";
import { creatorReport, recordVisit, sourceFunnel } from "@/server/marketing";
import { expectLedgerConsistent, makeNetwork, makeUser, resetDb, useSettings } from "../support/db";

const SECRET = "s3cret";
function signedUrl(p: { subid: string; txid: string; payout: string }) {
  const status = "1";
  const sig = hmacSha256Hex(SECRET, canonicalString({ subid: p.subid, txid: p.txid, payout: p.payout, status }));
  const q = new URLSearchParams({ subid: p.subid, txid: p.txid, payout: p.payout, status, offer: "Tile Harbor", sig });
  return new URL(`https://amigo.cash/api/postback/testnet?${q}`);
}

const base = { password: "correct horse 9", country: "US", locale: "en" as const, ageConfirmed: true };

beforeEach(async () => {
  await resetDb();
  await useSettings({ holdThresholdCents: 500, holdDays: 7, userSharePct: 70, referralPct: 10, coinsPerUsd: 1000, welcomeBonus: 250, inviteBonus: 250 });
});

describe("creator links and sources", () => {
  it("credits a creator's sign-up, bonus and commission, and reports it", async () => {
    const account = await makeUser({ name: "Jake Plays" });
    const creator = await db.creator.create({ data: { slug: "jake", name: "Jake Plays", platform: "TikTok", userId: account.id, bonusCoins: 300, clicks: 4 } });
    const r = await signup({
      ...base,
      name: "Fan One",
      email: "fan1@example.com",
      ip: "198.51.100.10",
      deviceId: "dev-fan1-aaaaaaaaaaaaaaaa",
      refCode: account.refCode,
      attribution: { source: "creator", medium: null, campaign: null, refHost: null, creatorId: creator.id, creatorBonus: 300, creatorName: creator.name },
    });
    expect(r.ok).toBe(true);
    const fan = await db.user.findUniqueOrThrow({ where: { email: "fan1@example.com" } });
    expect(fan).toMatchObject({ source: "creator", creatorId: creator.id, referredById: account.id });
    expect(fan.balance).toBe(250 + 250 + 300); // welcome + invite + creator bonus

    await makeNetwork();
    await handlePostback("testnet", signedUrl({ subid: fan.id, txid: "c1", payout: "4.00" }), null);
    const acc = await expectLedgerConsistent(account.id);
    expect(acc.ok).toBe(true);
    expect(acc.user.balance).toBe(280); // 10% of the fan's 2,800 coins

    const [row] = await creatorReport();
    expect(row).toMatchObject({ slug: "jake", clicks: 4, signups: 1, earners: 1, revenueCents: 400, commissionCoins: 280 });
    expect((await expectLedgerConsistent(fan.id)).ok).toBe(true);
  });

  it("groups members and visits by source", async () => {
    await signup({ ...base, name: "Tik Fan", email: "t1@example.com", ip: "198.51.100.11", deviceId: "dev-t1-aaaaaaaaaaaaaaaaaa", attribution: { source: "tiktok", medium: null, campaign: "video-1", refHost: null, creatorId: null, creatorBonus: 0, creatorName: null } });
    await signup({ ...base, name: "Plain Fan", email: "p1@example.com", ip: "198.51.100.12", deviceId: "dev-p1-aaaaaaaaaaaaaaaaaa" });
    await recordVisit("tiktok", null);
    await recordVisit("tiktok", null);
    await recordVisit("direct", null);
    const rows = await sourceFunnel(new Date(Date.now() - 86_400_000));
    expect(rows.find((x) => x.key === "tiktok")).toMatchObject({ visits: 2, signups: 1 });
    expect(rows.find((x) => x.key === "direct")).toMatchObject({ visits: 1, signups: 1 });
    expect((await db.user.findUniqueOrThrow({ where: { email: "t1@example.com" } })).campaign).toBe("video-1");
  });
});
