import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";

export const METHOD_IDS = ["usdt", "ltc", "btc", "binance", "amazon", "paypal"] as const;
export type MethodId = (typeof METHOD_IDS)[number];

const method = z.object({ enabled: z.boolean(), minCents: z.number().int().min(50).max(1_000_000), feeCents: z.number().int().min(0).max(100_000) });

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
  methods: z.object(Object.fromEntries(METHOD_IDS.map((m) => [m, method])) as Record<MethodId, typeof method>),
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
  methods: {
    usdt: { enabled: true, minCents: 200, feeCents: 0 },
    ltc: { enabled: true, minCents: 100, feeCents: 0 },
    btc: { enabled: true, minCents: 1000, feeCents: 50 },
    binance: { enabled: true, minCents: 100, feeCents: 0 },
    amazon: { enabled: true, minCents: 500, feeCents: 0 },
    paypal: { enabled: false, minCents: 500, feeCents: 0 },
  },
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
    base.methods = { ...DEFAULT_SETTINGS.methods, ...(s.methods ?? {}) };
    base.bannerText = { ...DEFAULT_SETTINGS.bannerText, ...(s.bannerText ?? {}) };
  }
  const parsed = siteSettingsSchema.safeParse(base);
  return parsed.success ? parsed.data : structuredClone(DEFAULT_SETTINGS);
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
