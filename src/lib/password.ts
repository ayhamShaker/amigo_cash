import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP recommendation for Argon2id: m=19 MiB, t=2, p=1.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(stored: string | null | undefined, password: string): Promise<boolean> {
  if (!stored) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// Spends the same time as a real check, so login timing does not reveal
// whether an email address has an account.
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hash("timing-equaliser-not-a-real-password", OPTS);
  await verifyPassword(await dummy, password);
}
