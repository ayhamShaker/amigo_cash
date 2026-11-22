import { db } from "@/lib/db";
import { encrypt, randomToken } from "@/lib/crypto";
import { clearSettingsCache, DEFAULT_SETTINGS, saveSettings, type SiteSettings } from "@/server/settings";

/** Empties every table between tests. */
export async function resetDb() {
  if (!/test/.test(process.env.DATABASE_URL ?? "")) throw new Error("resetDb only runs against a test database");
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  clearSettingsCache();
}

export async function useSettings(patch: Partial<SiteSettings> = {}) {
  return saveSettings({ ...structuredClone(DEFAULT_SETTINGS), ...patch });
}

let n = 0;
export async function makeUser(data: Partial<{ email: string; name: string; referredById: string; balance: number; status: "ACTIVE" | "BANNED"; emailVerified: boolean; paidOnce: boolean }> = {}) {
  n += 1;
  const u = await db.user.create({
    data: {
      email: data.email ?? `user${n}-${randomToken(4)}@example.com`,
      name: data.name ?? `User ${n}`,
      refCode: `R${n}${randomToken(3).toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
      referredById: data.referredById,
      status: data.status ?? "ACTIVE",
      emailVerifiedAt: data.emailVerified === false ? null : new Date(),
      paidOnce: data.paidOnce ?? false,
    },
  });
  if (data.balance) {
    await db.$transaction(async (tx) => {
      const { addEntry } = await import("@/server/ledger");
      await addEntry(tx, { userId: u.id, amount: data.balance!, bucket: "AVAILABLE", kind: "ADJUST", description: { k: "seed" } });
    });
  }
  return db.user.findUniqueOrThrow({ where: { id: u.id } });
}

export async function makeNetwork(id = "testnet", opts: Partial<{ secret: string; mode: string; allowedIps: string[]; enabled: boolean; userShare: number | null; kind: string }> = {}) {
  return db.network.create({
    data: {
      id,
      name: id.toUpperCase(),
      kind: opts.kind ?? "Games",
      enabled: opts.enabled ?? true,
      userShare: opts.userShare ?? null,
      secretEnc: encrypt(opts.secret ?? "s3cret", process.env.ENCRYPTION_KEY!),
      signatureMode: opts.mode ?? "HMAC_SHA256",
      allowedIps: opts.allowedIps ?? [],
    },
  });
}

/** Ledger sums must always equal the cached balances. */
export async function expectLedgerConsistent(userId: string) {
  const [avail, pend, user] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { userId, bucket: "AVAILABLE" }, _sum: { amount: true } }),
    db.ledgerEntry.aggregate({ where: { userId, bucket: "PENDING" }, _sum: { amount: true } }),
    db.user.findUniqueOrThrow({ where: { id: userId } }),
  ]);
  return { ok: (avail._sum.amount ?? 0) === user.balance && (pend._sum.amount ?? 0) === user.pending, user, available: avail._sum.amount ?? 0, pending: pend._sum.amount ?? 0 };
}
