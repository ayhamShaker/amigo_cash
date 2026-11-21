import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/** Every admin action that changes money, users or settings is written here. */
export async function audit(entry: {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  data?: Record<string, unknown>;
  ip?: string | null;
}) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      data: (entry.data ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: entry.ip ?? null,
    },
  });
}
