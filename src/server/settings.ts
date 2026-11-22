import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ADDRESS_KIND_KEYS, DEFAULT_METHODS, isSafeMethodImage, type AddressKind, type PayMethod } from "@/lib/methods";

const method = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,23}$/),
  name: z.string().trim().min(1).max(40),
  sub: z.string().trim().max(60),
  kind: z.enum(ADDRESS_KIND_KEYS as [AddressKind, ...AddressKind[]]),
  field: z.string().trim().min(1).max(60),
  placeholder: z.string().trim().max(80),
  image: z.string().refine(isSafeMethodImage),
  enabled: z.boolean(),
  minCents: z.number().int().min(50).max(1_000_000),
  feeCents: z.number().int().min(0).max(100_000),
});

/** Everything the owner can change from the admin panel. */
export const siteSettingsSchema = z.object({
  coinsPerUsd: z.number().int().min(1).max(1_000_000),
  userSharePct: z.number().int().min(0).max(100),
  referralPct: z.number().int().min(0).max(50),
  welcomeBonus: z.number().int().min(0).max(1_000_000),
  inviteBonus: z.number().int().min(0).max(1_000_000),
  dailyMin: z.number().int().min(0).max(100_000),
  dailyMax: z.number().int().min(0).max(100_000),
  holdThresholdCents: z.number().int().min(0).max(1_000_000),
  holdDays: z.number().int().min(0).max(90),
  blockVpn: z.boolean(),
  vpnStrictness: z.number().int().min(0).max(3),
  maxFraudScore: z.number().int().min(50).max(100),
  maxAccountsPerDevice: z.number().int().min(1).max(20),
  autoBanRisk: z.number().int().min(50).max(100),
  firstWithdrawalManual: z.boolean(),
  autoApproveUnderCents: z.number().int().min(0).max(1_000_000),
  requireVerifiedEmailToWithdraw: z.boolean(),
  maintenance: z.boolean(),
  registrationOpen: z.boolean(),
  minAge: z.number().int().min(13).max(21),
  bannerEnabled: z.boolean(),
  bannerText: z.object({ en: z.string().max(200), es: z.string().max(200), ar: z.string().max(200) }),
  gameBoostPct: z.number().int().min(0).max(200),
  prizesCents: z.array(z.number().int().min(0).max(1_000_000)).max(20),
  supportEmail: z.email(),
  methods: z
    .array(method)
    .max(30)
    .refine((list) => new Set(list.map((m) => m.id)).size === list.length, "duplicate method id"),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const DEFAULT_SETTINGS: SiteSettings = {
  coinsPerUsd: 1000,
  userSharePct: 70,
  referralPct: 10,
  welcomeBonus: 250,
  inviteBonus: 250,
  dailyMin: 10,
  dailyMax: 150,
  holdThresholdCents: 500,
  holdDays: 7,
  blockVpn: true,
  vpnStrictness: 2,
  maxFraudScore: 85,
  maxAccountsPerDevice: 1,
  autoBanRisk: 90,
  firstWithdrawalManual: true,
  autoApproveUnderCents: 1000,
  requireVerifiedEmailToWithdraw: true,
  maintenance: false,
  registrationOpen: true,
  minAge: 18,
  bannerEnabled: false,
  bannerText: { en: "", es: "", ar: "" },
  gameBoostPct: 0,
  prizesCents: [5000, 2500, 1500, 1000, 500, 500, 500, 500, 500, 500],
  supportEmail: "support@amigo.cash",
  methods: DEFAULT_METHODS,
};

const KEY = "site";
let cache: { value: SiteSettings; at: number } | null = null;
const TTL_MS = 5_000;

/** Stored settings merged over the defaults, so new keys get sane values. */
export async function getSettings(): Promise<SiteSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const merged = mergeSettings(row?.value);
  cache = { value: merged, at: Date.now() };
  return merged;
}

export function mergeSettings(stored: unknown): SiteSettings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (stored && typeof stored === "object") {
    const s = stored as Partial<SiteSettings>;
    Object.assign(base, s);
    base.methods = upgradeMethods(s.methods);
    base.bannerText = { ...DEFAULT_SETTINGS.bannerText, ...(s.bannerText ?? {}) };
  }
  const parsed = siteSettingsSchema.safeParse(base);
  return parsed.success ? parsed.data : structuredClone(DEFAULT_SETTINGS);
}

/**
 * Settings saved before methods became editable kept only {enabled, minCents,
 * feeCents} per built-in id. Those are folded into the full default records.
 */
function upgradeMethods(stored: unknown): PayMethod[] {
  if (Array.isArray(stored)) return stored as PayMethod[];
  if (!stored || typeof stored !== "object") return structuredClone(DEFAULT_METHODS);
  const old = stored as Record<string, Partial<PayMethod>>;
  return DEFAULT_METHODS.map((m) => {
    const o = old[m.id];
    return o ? { ...m, enabled: o.enabled ?? m.enabled, minCents: o.minCents ?? m.minCents, feeCents: o.feeCents ?? m.feeCents } : { ...m };
  });
}

export async function saveSettings(next: SiteSettings): Promise<SiteSettings> {
  const value = siteSettingsSchema.parse(next);
  if (value.dailyMax < value.dailyMin) throw new Error("dailyMax must be at least dailyMin");
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  cache = { value, at: Date.now() };
  return value;
}

export function clearSettingsCache() {
  cache = null;
}
