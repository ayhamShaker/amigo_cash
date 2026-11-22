import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { decrypt, hmacSha256Hex, md5Hex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { payoutToCoins } from "@/lib/money";
import { ipInAllowList } from "@/lib/ip";
import { Prisma } from "@/generated/prisma/client";
import { creditEarning, isUniqueViolation, reverseEarning } from "./ledger";
import { getSettings } from "./settings";
import { enforceAutoBan } from "./fraud";

/**
 * Offer-network callback ("postback"). Every network gets this URL with its
 * own macros filled in:
 *
 *   https://amigo.cash/api/postback/{network}?subid={user_id}&txid={transaction_id}
 *     &payout={payout_usd}&status={1|2}&offer={offer_name}&sig={signature}
 *
 * status 1 = credit, 2 = reversal (chargeback). payout is in US dollars.
 */
export type SignatureMode = "HMAC_SHA256" | "MD5_CONCAT" | "SECRET_PARAM" | "HMAC_SHA1_URL";
export const SIGNATURE_MODES: SignatureMode[] = ["HMAC_SHA256", "MD5_CONCAT", "SECRET_PARAM", "HMAC_SHA1_URL"];

export type PostbackResult =
  | { http: 200; body: "1"; outcome: "credited" | "duplicate" | "reversed" | "reversal_recorded" }
  | { http: 200; body: "0"; outcome: "rejected"; reason: string }
  | { http: 400 | 403 | 404; body: string; outcome: "refused"; reason: string };

/** Parses "12.5", "0.80", "3" into cents without floating point. */
export function parsePayoutCents(raw: string | null): number | null {
  if (!raw) return null;
  const m = /^(\d{1,7})(?:\.(\d{1,4}))?$/.exec(raw.trim());
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = (m[2] ?? "").padEnd(4, "0");
  // round half up on the 3rd/4th decimal
  const cents = whole * 100 + Number(frac.slice(0, 2)) + (Number(frac.slice(2)) >= 50 ? 1 : 0);
  return cents;
}

export function parseStatus(raw: string | null): "credit" | "reversal" | null {
  const v = (raw ?? "1").trim().toLowerCase();
  if (["1", "credit", "completed", "approved"].includes(v)) return "credit";
  if (["2", "-1", "reversal", "reversed", "chargeback", "rejected"].includes(v)) return "reversal";
  return null;
}

/** The exact string each mode signs. Kept in one place so docs and code agree. */
export function canonicalString(p: { subid: string; txid: string; payout: string; status: string }): string {
  return `${p.subid}:${p.txid}:${p.payout}:${p.status}`;
}

export function verifySignature(
  mode: SignatureMode,
  secret: string,
  url: URL,
): boolean {
  const q = url.searchParams;
  const subid = q.get("subid") ?? "";
  const txid = q.get("txid") ?? "";
  const payout = q.get("payout") ?? "";
  const status = q.get("status") ?? "";
  switch (mode) {
    case "HMAC_SHA256": {
      const sig = (q.get("sig") ?? "").toLowerCase();
      return sig.length === 64 && safeEqual(sig, hmacSha256Hex(secret, canonicalString({ subid, txid, payout, status })));
    }
    case "MD5_CONCAT": {
      const sig = (q.get("sig") ?? "").toLowerCase();
      return sig.length === 32 && safeEqual(sig, md5Hex(`${subid}${txid}${payout}${secret}`));
    }
    case "SECRET_PARAM": {
      const given = q.get("secret") ?? "";
      return given.length > 0 && safeEqual(given, secret);
    }
    case "HMAC_SHA1_URL": {
      // Signature of the full URL without the trailing &hash=... parameter.
      const hash = (q.get("hash") ?? "").toLowerCase();
      const full = url.toString();
      const idx = full.lastIndexOf("&hash=");
      if (idx < 0 || hash.length !== 40) return false;
      const signed = full.slice(0, idx);
      return safeEqual(hash, createHmac("sha1", secret).update(signed).digest("hex"));
    }
  }
}

const TXID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export async function handlePostback(networkId: string, url: URL, ip: string | null): Promise<PostbackResult> {
  const network = await db.network.findUnique({ where: { id: networkId } });
  if (!network) return { http: 404, body: "unknown network", outcome: "refused", reason: "unknown network" };
  if (!network.enabled) return { http: 403, body: "network disabled", outcome: "refused", reason: "network disabled" };
  if (network.allowedIps.length > 0 && (!ip || !ipInAllowList(ip, network.allowedIps))) {
    return { http: 403, body: "forbidden", outcome: "refused", reason: `ip ${ip ?? "unknown"} not allowed` };
  }
  if (!network.secretEnc) return { http: 403, body: "not configured", outcome: "refused", reason: "no secret configured" };
  const secret = decrypt(network.secretEnc, env().ENCRYPTION_KEY);
  if (!verifySignature(network.signatureMode as SignatureMode, secret, url)) {
    return { http: 403, body: "bad signature", outcome: "refused", reason: "bad signature" };
  }

  const q = url.searchParams;
  const txid = q.get("txid") ?? "";
  const subid = q.get("subid") ?? "";
  const status = parseStatus(q.get("status"));
  const payoutCents = parsePayoutCents(q.get("payout"));
  const offerName = (q.get("offer") ?? "Offer").slice(0, 120);
  if (!TXID_RE.test(txid) || !subid || !status || payoutCents === null) {
    return { http: 400, body: "bad request", outcome: "refused", reason: "missing or malformed parameters" };
  }
  const raw = Object.fromEntries(q.entries());
  delete (raw as Record<string, string>).secret; // never store the shared secret

  if (status === "reversal") return handleReversal(network.id, txid, subid, offerName, payoutCents, ip, raw);

  const settings = await getSettings();
  const user = await db.user.findUnique({ where: { id: subid }, select: { id: true, status: true } });
  const share = network.userShare ?? settings.userSharePct;
  const coins = payoutToCoins(payoutCents, share, settings.coinsPerUsd);
  const rejectReason = !user ? "unknown user" : user.status !== "ACTIVE" ? "user banned" : null;

  try {
    return await db.$transaction(async (tx) => {
      const conv = await tx.conversion.create({
        data: {
          networkId: network.id,
          txid,
          userId: user?.id ?? null,
          offerName,
          payoutCents,
          coins: rejectReason ? 0 : coins,
          status: rejectReason ? "REJECTED" : "CREDITED",
          reason: rejectReason,
          ip,
          raw: raw as Prisma.InputJsonValue,
        },
      });
      if (rejectReason || !user) return { http: 200, body: "0", outcome: "rejected", reason: rejectReason ?? "unknown user" } as const;
      const isSurvey = network.kind.toLowerCase().includes("survey");
      await creditEarning(tx, {
        userId: user.id,
        coins,
        kind: isSurvey ? "SURVEY" : "OFFER",
        description: { k: "{o} · {n}", a: { o: offerName, n: network.name } },
        refType: "conversion",
        refId: conv.id,
        settings,
      });
      return { http: 200, body: "1", outcome: "credited" } as const;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { http: 200, body: "1", outcome: "duplicate" };
    throw err;
  }
}

async function handleReversal(
  networkId: string,
  txid: string,
  subid: string,
  offerName: string,
  payoutCents: number,
  ip: string | null,
  raw: Record<string, string>,
): Promise<PostbackResult> {
  try {
    const result = await reversalTx(networkId, txid, subid, offerName, payoutCents, ip, raw);
    if (result.outcome === "reversed" && result.userId) await enforceAutoBan(result.userId);
    return { http: 200, body: "1", outcome: result.outcome };
  } catch (err) {
    if (isUniqueViolation(err)) return { http: 200, body: "1", outcome: "duplicate" };
    throw err;
  }
}

async function reversalTx(
  networkId: string,
  txid: string,
  subid: string,
  offerName: string,
  payoutCents: number,
  ip: string | null,
  raw: Record<string, string>,
): Promise<{ outcome: "reversed" | "reversal_recorded" | "duplicate"; userId?: string | null }> {
  {
    return await db.$transaction(async (tx) => {
      // Lock the conversion row so a reversal and a retry cannot both run.
      const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "Conversion" WHERE "networkId" = ${networkId} AND txid = ${txid} FOR UPDATE`;
      const conv = rows[0];
      if (!conv) {
        // Reversal before credit: record it so a late credit with this txid is ignored.
        const user = await tx.user.findUnique({ where: { id: subid }, select: { id: true } });
        await tx.conversion.create({
          data: { networkId, txid, userId: user?.id ?? null, offerName, payoutCents, coins: 0, status: "REVERSED", reason: "reversal before credit", ip, raw: raw as Prisma.InputJsonValue, reversedAt: new Date() },
        });
        return { outcome: "reversal_recorded" as const };
      }
      if (conv.status !== "CREDITED") return { outcome: "duplicate" as const };
      await reverseEarning(tx, "conversion", conv.id, { k: "Reversed by advertiser · {o}", a: { o: offerName } });
      const updated = await tx.conversion.update({ where: { id: conv.id }, data: { status: "REVERSED", reversedAt: new Date() }, select: { userId: true } });
      if (updated.userId) {
        await tx.user.update({ where: { id: updated.userId }, data: { riskScore: { increment: 15 } } });
        await tx.$executeRaw`UPDATE "User" SET "riskScore" = LEAST("riskScore", 100), flags = CASE WHEN 'Reversal' = ANY(flags) THEN flags ELSE array_append(flags, 'Reversal') END WHERE id = ${updated.userId}`;
      }
      return { outcome: "reversed" as const, userId: updated.userId };
    });
  }
}

/** Admin-triggered reversal from the postback log. */
export async function adminReverseConversion(conversionId: string) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: string; offerName: string; userId: string | null }[]>`
      SELECT id, status, "offerName", "userId" FROM "Conversion" WHERE id = ${conversionId} FOR UPDATE`;
    const conv = rows[0];
    if (!conv || conv.status !== "CREDITED") return 0;
    const total = await reverseEarning(tx, "conversion", conv.id, { k: "Reversed by advertiser · {o}", a: { o: conv.offerName } });
    await tx.conversion.update({ where: { id: conv.id }, data: { status: "REVERSED", reversedAt: new Date(), reason: "reversed by admin" } });
    return total;
  });
}
