import "server-only";
import { createHash, createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { decrypt, hmacSha256Hex, md5Hex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { formatUsd, payoutToCoins } from "@/lib/money";
import { ipInAllowList } from "@/lib/ip";
import { levelBoostPct } from "@/components/level";
import { Prisma } from "@/generated/prisma/client";
import { creditEarning, isUniqueViolation, reverseEarning } from "./ledger";
import { getSettings } from "./settings";
import { enforceAutoBan } from "./fraud";
import { notify } from "./notify";
import { notifyAdminTelegram } from "./telegram";

/**
 * Offer-network callback ("postback"). Supports both our canonical format and
 * native signature/parameter formats for major US/UK GPT offerwalls:
 *
 *   - HMAC_SHA256     : sig = HMAC-SHA256(secret, subid:txid:payout:status)
 *   - MD5_CONCAT      : sig = MD5(subid + txid + payout + secret)
 *   - SECRET_PARAM    : secret = shared secret
 *   - HMAC_SHA1_URL   : BitLabs — hash = HMAC-SHA1(secret, full URL without hash param)
 *   - TOROX_MD5       : Torox/OfferToro — sig = MD5(oid + "-" + user_id + "-" + secret)
 *   - CPX_MD5         : CPX Research — hash = MD5(trans_id + "-" + secret)
 *   - AYET_HMAC       : AyeT-Studios — X-Ayetstudios-Security-Hash = HMAC-SHA256(secret, sorted query)
 *   - LOOTABLY_SHA256 : Lootably — hash = SHA256(userID + ip + revenue + currencyReward + secret)
 */
export type SignatureMode =
  | "HMAC_SHA256"
  | "MD5_CONCAT"
  | "SECRET_PARAM"
  | "HMAC_SHA1_URL"
  | "TOROX_MD5"
  | "CPX_MD5"
  | "AYET_HMAC"
  | "LOOTABLY_SHA256";

export const SIGNATURE_MODES: SignatureMode[] = [
  "HMAC_SHA256",
  "MD5_CONCAT",
  "SECRET_PARAM",
  "HMAC_SHA1_URL",
  "TOROX_MD5",
  "CPX_MD5",
  "AYET_HMAC",
  "LOOTABLY_SHA256",
];

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

export function parseStatus(raw: string | null, isChargeback?: string | null): "credit" | "reversal" | null {
  if (isChargeback && ["1", "true", "yes"].includes(isChargeback.trim().toLowerCase())) return "reversal";
  const v = (raw ?? "1").trim().toLowerCase();
  if (["1", "credit", "completed", "approved", "0"].includes(v)) return v === "0" && isChargeback ? "credit" : v === "0" ? null : "credit";
  if (["2", "-1", "reversal", "reversed", "chargeback", "rejected"].includes(v)) return "reversal";
  return null;
}

/** First non-empty query parameter among aliases. */
function pickParam(q: URLSearchParams, ...names: string[]): string {
  for (const n of names) {
    const v = q.get(n);
    if (v !== null && v !== "") return v;
  }
  return "";
}

/** Canonical sorted query string for AyeT-Studios HMAC verification. */
export function sortedQueryString(url: URL): string {
  const entries = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(entries).toString();
}

/** The exact string our canonical HMAC_SHA256 mode signs. */
export function canonicalString(p: { subid: string; txid: string; payout: string; status: string }): string {
  return `${p.subid}:${p.txid}:${p.payout}:${p.status}`;
}

/** Builds a correctly signed postback URL (used by admin "send test" and tests). */
export function buildSignedUrl(
  mode: SignatureMode,
  secret: string,
  base: string,
  p: { subid: string; txid: string; payout: string; status: string; offer: string },
): URL {
  const url = new URL(base);
  for (const [k, v] of Object.entries(p)) url.searchParams.set(k, v);
  if (mode === "HMAC_SHA256") url.searchParams.set("sig", hmacSha256Hex(secret, canonicalString(p)));
  else if (mode === "MD5_CONCAT") url.searchParams.set("sig", md5Hex(`${p.subid}${p.txid}${p.payout}${secret}`));
  else if (mode === "SECRET_PARAM") url.searchParams.set("secret", secret);
  else if (mode === "HMAC_SHA1_URL") url.searchParams.set("hash", createHmac("sha1", secret).update(url.toString()).digest("hex"));
  else if (mode === "TOROX_MD5") url.searchParams.set("sig", md5Hex(`${p.txid}-${p.subid}-${secret}`));
  else if (mode === "CPX_MD5") url.searchParams.set("hash", md5Hex(`${p.txid}-${secret}`));
  else if (mode === "LOOTABLY_SHA256") {
    const raw = `${p.subid}127.0.0.1${p.payout}${p.payout}${secret}`;
    url.searchParams.set("ip", "127.0.0.1");
    url.searchParams.set("currencyReward", p.payout);
    url.searchParams.set("hash", createHash("sha256").update(raw).digest("hex"));
  } else if (mode === "AYET_HMAC") {
    // For test URLs without custom header, also attach sig header via buildSignedHeaders
    url.searchParams.set("sig", hmacSha256Hex(secret, sortedQueryString(url)));
  }
  return url;
}

export function buildSignedHeaders(mode: SignatureMode, secret: string, url: URL): Headers | undefined {
  if (mode !== "AYET_HMAC") return undefined;
  const clean = new URL(url.toString());
  clean.searchParams.delete("sig");
  return new Headers({ "x-ayetstudios-security-hash": hmacSha256Hex(secret, sortedQueryString(clean)) });
}

export function verifySignature(mode: SignatureMode, secret: string, url: URL, headers?: Headers): boolean {
  const q = url.searchParams;
  const subid = pickParam(q, "subid", "user_id", "userID", "uid", "external_identifier");
  const txid = pickParam(q, "txid", "trans_id", "transaction_id", "oid");
  const payout = pickParam(q, "payout", "payout_usd", "amount_usd", "revenue", "amount");
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
      // BitLabs: HMAC-SHA1 of full URL without the hash parameter (supports trailing &hash= or any position).
      const hash = (q.get("hash") ?? "").toLowerCase();
      if (hash.length !== 40) return false;
      const full = url.toString();
      const idx = full.lastIndexOf("&hash=");
      if (idx >= 0) {
        const signed = full.slice(0, idx);
        if (safeEqual(hash, createHmac("sha1", secret).update(signed).digest("hex"))) return true;
      }
      const stripped = new URL(full);
      stripped.searchParams.delete("hash");
      return safeEqual(hash, createHmac("sha1", secret).update(stripped.toString()).digest("hex"));
    }
    case "TOROX_MD5": {
      // Torox / OfferToro: MD5(oid + "-" + user_id + "-" + secret)
      const sig = pickParam(q, "sig", "signature", "hash").toLowerCase();
      return sig.length === 32 && safeEqual(sig, md5Hex(`${txid}-${subid}-${secret}`));
    }
    case "CPX_MD5": {
      // CPX Research: MD5(trans_id + "-" + secret)
      const hash = pickParam(q, "hash", "sig").toLowerCase();
      return hash.length === 32 && safeEqual(hash, md5Hex(`${txid}-${secret}`));
    }
    case "AYET_HMAC": {
      // AyeT-Studios: X-Ayetstudios-Security-Hash = HMAC-SHA256(secret, sorted query string)
      const hdr = (headers?.get("x-ayetstudios-security-hash") ?? "").toLowerCase();
      if (hdr.length === 64) {
        return safeEqual(hdr, hmacSha256Hex(secret, sortedQueryString(url)));
      }
      // Allow admin test fallback using ?sig= when no header is supplied
      const sig = (q.get("sig") ?? "").toLowerCase();
      if (sig.length !== 64) return false;
      const clean = new URL(url.toString());
      clean.searchParams.delete("sig");
      return safeEqual(sig, hmacSha256Hex(secret, sortedQueryString(clean)));
    }
    case "LOOTABLY_SHA256": {
      // Lootably: SHA256(userID + ip + revenue + currencyReward + secret)
      const hash = pickParam(q, "hash", "sig").toLowerCase();
      if (hash.length !== 64) return false;
      const userIp = q.get("ip") ?? "";
      const currencyReward = pickParam(q, "currencyReward", "currency_reward", "payout");
      const expected = createHash("sha256").update(`${subid}${userIp}${payout}${currencyReward}${secret}`).digest("hex");
      return safeEqual(hash, expected);
    }
  }
}

const TXID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export async function handlePostback(
  networkId: string,
  url: URL,
  ip: string | null,
  opts: { adminTest?: boolean; headers?: Headers } = {},
): Promise<PostbackResult> {
  const network = await db.network.findUnique({ where: { id: networkId } });
  if (!network) return { http: 404, body: "unknown network", outcome: "refused", reason: "unknown network" };
  if (!network.enabled) return { http: 403, body: "network disabled", outcome: "refused", reason: "network disabled" };
  if (!opts.adminTest && network.allowedIps.length > 0 && (!ip || !ipInAllowList(ip, network.allowedIps))) {
    return { http: 403, body: "forbidden", outcome: "refused", reason: `ip ${ip ?? "unknown"} not allowed` };
  }
  if (!network.secretEnc) return { http: 403, body: "not configured", outcome: "refused", reason: "no secret configured" };
  const secret = decrypt(network.secretEnc, env().ENCRYPTION_KEY);
  if (!verifySignature(network.signatureMode as SignatureMode, secret, url, opts.headers)) {
    return { http: 403, body: "bad signature", outcome: "refused", reason: "bad signature" };
  }

  const q = url.searchParams;
  const txid = pickParam(q, "txid", "trans_id", "transaction_id", "oid");
  const subid = pickParam(q, "subid", "user_id", "userID", "uid", "external_identifier");
  const status = parseStatus(q.get("status"), q.get("is_chargeback"));
  const payoutCents = parsePayoutCents(pickParam(q, "payout", "payout_usd", "amount_usd", "revenue", "amount") || null);
  const offerName = (pickParam(q, "offer", "offer_name", "campaign_name") || "Offer").slice(0, 120);
  if (!TXID_RE.test(txid) || !subid || !status || payoutCents === null) {
    return { http: 400, body: "bad request", outcome: "refused", reason: "missing or malformed parameters" };
  }
  const raw = Object.fromEntries(q.entries());
  delete (raw as Record<string, string>).secret; // never store the shared secret

  if (status === "reversal") return handleReversal(network.id, network.name, txid, subid, offerName, payoutCents, ip, raw);

  const settings = await getSettings();
  const user = await db.user.findUnique({ where: { id: subid }, select: { id: true, status: true, lifetimeEarned: true } });
  const share = network.userShare ?? settings.userSharePct;
  const boost = user ? levelBoostPct(user.lifetimeEarned, settings.levelBoostEnabled) : 0;
  const coins = payoutToCoins(payoutCents, share, settings.coinsPerUsd, boost);
  const rejectReason = !user ? "unknown user" : user.status !== "ACTIVE" ? "user banned" : null;

  try {
    const result = await db.$transaction(async (tx) => {
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
      const credit = await creditEarning(tx, {
        userId: user.id,
        coins,
        kind: isSurvey ? "SURVEY" : "OFFER",
        description: { k: "{o} · {n}", a: { o: offerName, n: network.name } },
        refType: "conversion",
        refId: conv.id,
        settings,
      });
      return { http: 200, body: "1", outcome: "credited", credit } as const;
    });
    if (result.outcome === "credited" && user) {
      const { credit } = result;
      await notify(
        user.id,
        "earning",
        credit.held
          ? { k: "{c} coins for {o} are on hold for {d} days while the advertiser checks it.", a: { c: coins.toLocaleString("en-US"), o: offerName, d: settings.holdDays } }
          : { k: "+{c} coins for {o} were added to your balance.", a: { c: coins.toLocaleString("en-US"), o: offerName } },
        "/activity",
      );
      if (credit.referrerId) await notify(credit.referrerId, "earning", { k: "+{c} coins referral commission from a friend.", a: { c: credit.commission.toLocaleString("en-US") } }, "/referrals");
      return { http: 200, body: "1", outcome: "credited" };
    }
    return result.outcome === "rejected" ? result : { http: 200, body: "1", outcome: "credited" };
  } catch (err) {
    if (isUniqueViolation(err)) return { http: 200, body: "1", outcome: "duplicate" };
    throw err;
  }
}

async function handleReversal(
  networkId: string,
  networkName: string,
  txid: string,
  subid: string,
  offerName: string,
  payoutCents: number,
  ip: string | null,
  raw: Record<string, string>,
): Promise<PostbackResult> {
  try {
    const result = await reversalTx(networkId, txid, subid, offerName, payoutCents, ip, raw);
    if (result.outcome === "reversed" && result.userId) {
      await notify(result.userId, "reversal", { k: "The advertiser reversed {o}. Those coins were removed from your balance.", a: { o: offerName } }, "/activity");
      await enforceAutoBan(result.userId);
      void notifyAdminTelegram(`Chargeback / Reversal\nNetwork: ${networkName}\nOffer: ${offerName}\nPayout: ${formatUsd(payoutCents)}\nUser ID: ${result.userId}`);
    }
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
