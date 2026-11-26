"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { claimDailyBonus, redeemPromo } from "@/server/rewards";
import { requestWithdrawal, WithdrawalError } from "@/server/withdrawals";
import { checkIp, isBadConnection } from "@/server/fraud";
import { requestIp } from "@/server/request";
import { rateLimit } from "@/server/rate-limit";
import { notifyAdminTelegram } from "@/server/telegram";
import { dollarsToCents, str, tFrom } from "@/server/action-utils";
import { formatCoins, formatUsd } from "@/lib/money";
import { db } from "@/lib/db";

async function member() {
  const u = await currentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}

async function connectionBlocked(role?: string): Promise<boolean> {
  if (role === "ADMIN") return false;
  const settings = await getSettings();
  if (!settings.blockVpn) return false;
  return isBadConnection(await checkIp(await requestIp()));
}

export async function dailyBonusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale, t } = tFrom(fd);
  const u = await member();
  if (await connectionBlocked(u.role)) return { error: t("Earning is paused on this connection. Turn off your VPN and reload the page.") };
  const r = await claimDailyBonus(u.id, await getSettings());
  revalidatePath(`/${locale}/earn`);
  if (!r.ok) {
    if (r.reason === "EARN_REQUIRED") {
      return { error: t("Earn {c} more coins from offers or surveys to unlock the daily streak.", { c: formatCoins(r.needCoins) }) };
    }
    return { error: t("Opened. Next chest in {h} hours.", { h: hoursToMidnightUtc() }) };
  }
  return { ok: t("Day {d}: +{c} coins added!", { d: r.day, c: formatCoins(r.coins) }) };
}

function hoursToMidnightUtc() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 3_600_000));
}

export async function promoAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale, t } = tFrom(fd);
  const u = await member();
  if (!(await rateLimit(`promo:${u.id}`, 10, 600))) return { error: t("Too many attempts. Wait a few minutes and try again.") };
  const r = await redeemPromo(u.id, str(fd, "code", 40));
  revalidatePath(`/${locale}/earn`);
  if (!r.ok) {
    const m = { INVALID: t("That code is not valid or has expired"), EXHAUSTED: t("This code has reached its limit"), ALREADY_USED: t("You already used this code") };
    return { error: m[r.reason] };
  }
  return { ok: t("+{c} coins from {code}", { c: formatCoins(r.coins), code: r.code }) };
}

export async function withdrawAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale, t } = tFrom(fd);
  const u = await member();
  const settings = await getSettings();
  if (!(await rateLimit(`withdraw:${u.id}`, 5, 600))) return { error: t("Too many attempts. Wait a few minutes and try again.") };
  const method = str(fd, "method", 20);
  const pm = settings.methods.find((x) => x.id === method);
  if (!pm) return { error: t("Choose a method") };
  const cents = dollarsToCents(str(fd, "amount", 12));
  if (cents === null) return { error: t("Enter an amount in dollars, like 5 or 12.50.") };
  if (await connectionBlocked(u.role)) return { error: t("Turn off your VPN to cash out") };
  try {
    const w = await requestWithdrawal({ userId: u.id, method, amountCents: cents, address: str(fd, "address", 120), settings });
    revalidatePath(`/${locale}/cashout`);
    void notifyAdminTelegram(
      `New withdrawal (${w.status})\nMember: ${u.name} (${u.email})\nMethod: ${pm.name}\nAmount: ${formatUsd(cents - w.feeCents)} (gross ${formatUsd(cents)})\nFirst payout: ${w.firstPayout ? "YES" : "no"}`,
    );
    const name = t(pm.name);
    return {
      ok:
        w.status === "APPROVED"
          ? t("Withdrawal of {v} to {m} approved. It is on its way.", { v: formatUsd(cents - w.feeCents), m: name })
          : `${t("Withdrawal requested.")} ${w.firstPayout ? t("We review first payouts within 24 hours.") : t("Processing now.")}`,
    };
  } catch (e) {
    if (!(e instanceof WithdrawalError)) throw e;
    const messages: Record<WithdrawalError["code"], string> = {
      METHOD_DISABLED: t("This payout method is not available right now."),
      BELOW_MINIMUM: t("The minimum for this method is {v}.", { v: formatUsd(pm.minCents) }),
      ABOVE_MAXIMUM: t("The most you can withdraw at once is {v}.", { v: formatUsd(50_000) }),
      BAD_ADDRESS: t("Check the {f}. It does not look right.", { f: t(pm.field) }),
      NOT_ACTIVE: t("Your account is suspended"),
      EMAIL_NOT_VERIFIED: t("Confirm your email address before your first withdrawal. Check your inbox for the link."),
      EARN_REQUIRED: t("Earn at least {v} from offers or surveys before your first withdrawal.", { v: formatUsd(settings.minEarnedToWithdrawCents) }),
      INSUFFICIENT_FUNDS: t("Not enough coins for this amount"),
      ALREADY_PENDING: t("You already have a withdrawal in progress. Wait for it to finish."),
    };
    return { error: messages[e.code] };
  }
}

/** Starts a featured offer: remembers it and sends the member to the advertiser with their id. */
export async function startOfferAction(fd: FormData) {
  const { locale } = tFrom(fd);
  const u = await currentUser();
  if (!u) redirect(`/${locale}/signup`);
  const id = str(fd, "offer", 40);
  const offer = await db.offer.findFirst({ where: { id, active: true, network: { enabled: true } } });
  if (!offer) redirect(`/${locale}/earn`);
  if (await connectionBlocked(u.role)) redirect(`/${locale}/earn/offer/${offer.id}?vpn=1`);
  await db.offerProgress.upsert({ where: { userId_offerId: { userId: u.id, offerId: offer.id } }, create: { userId: u.id, offerId: offer.id }, update: {} });
  const url = buildTrackingUrl(offer.trackingUrl, u.id);
  if (!url) redirect(`/${locale}/earn/offer/${offer.id}`);
  redirect(url);
}

/** Fills {user_id} and only allows https links. */
function buildTrackingUrl(template: string, userId: string): string | null {
  const filled = template.replaceAll("{user_id}", encodeURIComponent(userId));
  try {
    const url = new URL(filled);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
