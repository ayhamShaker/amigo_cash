import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { describe } from "@/i18n/t";
import type { Locale } from "@/i18n/config";

export type NotifyKind = "balance" | "withdrawal" | "support" | "earning" | "reversal" | "account";

/** Adds a notification for a member. Never throws: a failed notification must not undo money work. */
export async function notify(userId: string, kind: NotifyKind, body: { k: string; a?: Record<string, string | number> }, href?: string) {
  try {
    await db.notification.create({ data: { userId, kind, body: body as Prisma.InputJsonValue, href: href ?? null } });
  } catch (e) {
    console.error("[notify] failed", (e as Error).message);
  }
}

export type NotificationView = { id: string; kind: string; text: string; href: string | null; read: boolean; createdAt: string };

export async function listNotifications(userId: string, locale: Locale, take = 20): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    text: describe(locale, n.body),
    href: n.href ? `/${locale}${n.href}` : null,
    read: !!n.readAt,
    createdAt: n.createdAt.toISOString(),
  }));
}
