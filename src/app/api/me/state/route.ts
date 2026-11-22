import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/server/session";
import { isLocale } from "@/i18n/config";
import { describe } from "@/i18n/t";

export const dynamic = "force-dynamic";

/** Changes whenever public site content changes (offers, networks, settings). */
async function siteVersion() {
  const [offer, live, network, setting] = await Promise.all([
    db.offer.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.offer.count({ where: { active: true } }),
    db.network.aggregate({ _max: { updatedAt: true } }),
    db.setting.findUnique({ where: { key: "site" }, select: { updatedAt: true } }),
  ]);
  return [offer._max.updatedAt?.getTime() ?? 0, offer._count, live, network._max.updatedAt?.getTime() ?? 0, setting?.updatedAt.getTime() ?? 0].join(".");
}

/**
 * Polled every few seconds by the page. `v` is a fingerprint of what the page
 * shows; when it changes the page re-renders. Members also get their unread
 * notifications so new ones can pop up on screen.
 */
export async function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get("l");
  const locale = isLocale(l) ? l : "en";
  const [u, site] = await Promise.all([currentUser(), siteVersion()]);
  if (!u) return NextResponse.json({ v: `guest|${site}`, unread: 0, fresh: [] });
  const [lastEntry, lastWithdrawal, unread, fresh] = await Promise.all([
    db.ledgerEntry.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    db.withdrawal.findFirst({ where: { userId: u.id }, orderBy: { reviewedAt: { sort: "desc", nulls: "last" } }, select: { id: true, status: true } }),
    db.notification.count({ where: { userId: u.id, readAt: null } }),
    db.notification.findMany({ where: { userId: u.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);
  return NextResponse.json({
    v: [site, u.balance, u.pending, u.emailVerifiedAt ? 1 : 0, lastEntry?.id ?? "", lastWithdrawal?.id ?? "", lastWithdrawal?.status ?? "", unread].join("|"),
    unread,
    fresh: fresh.map((n) => ({ id: n.id, text: describe(locale, n.body), href: n.href ? `/${locale}${n.href}` : null })),
  });
}
