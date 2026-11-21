import "server-only";
import { z } from "zod";

/**
 * Server configuration. Read once and validated, so a missing or weak secret
 * stops the app at boot instead of failing quietly in production.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // 32 random bytes, base64. Encrypts TOTP secrets and network postback secrets at rest.
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  CRON_SECRET: z.string().min(12),
  // Optional integrations. Features that need them switch off when they are missing.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Amigo Cash <support@amigo.cash>"),
  IPQS_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // How many reverse proxies sit in front of the app (Cloudflare + host = 1 or 2).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  // Set to "true" only when the origin firewall accepts traffic from Cloudflare alone.
  TRUST_CLOUDFLARE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  const live = parsed.data.APP_URL.startsWith("https://");
  if (live && parsed.data.SESSION_SECRET.includes("dev-only")) {
    throw new Error("SESSION_SECRET is still the development value");
  }
  if (live && parsed.data.ENCRYPTION_KEY === "ZGV2LW9ubHktZW5jcnlwdGlvbi1rZXktMzItYnl0ZXM=") {
    throw new Error("ENCRYPTION_KEY is still the development value");
  }
  cached = parsed.data;
  return cached;
}
