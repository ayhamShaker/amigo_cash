import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { totp } from "@/lib/totp";
import { sha256 } from "@/lib/crypto";
import {
  beginTotpSetup,
  changePassword,
  checkPasswordLogin,
  confirmTotpSetup,
  disableTotp,
  requestPasswordReset,
  resetPassword,
  signup,
  upsertGoogleUser,
  verifyEmail,
  verifySecondFactor,
} from "@/server/auth";
import { expectLedgerConsistent, makeUser, resetDb, useSettings } from "../support/db";

const base = { name: "Sam Rivers", password: "correct horse 9", country: "US", locale: "en" as const, ip: "198.51.100.1", deviceId: "device-aaaaaaaaaaaaaaaaaaaa", ageConfirmed: true };
let ipN = 0;
const nextIp = () => `198.51.100.${++ipN % 250}`;

beforeEach(async () => {
  await resetDb();
  await useSettings({ welcomeBonus: 250, inviteBonus: 250, maxAccountsPerDevice: 1 });
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("sign up", () => {
  it("creates a member with a welcome bonus and lower-cased email", async () => {
    const r = await signup({ ...base, email: "Sam@Example.com", ip: nextIp() });
    expect(r.ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { email: "sam@example.com" } });
    expect(u.balance).toBe(250);
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    expect(u.emailVerifiedAt).toBeNull();
    expect((await expectLedgerConsistent(u.id)).ok).toBe(true);
  });

  it("validates input and refuses duplicates", async () => {
    expect((await signup({ ...base, email: "x@example.com", name: "A", ip: nextIp() })).ok).toBe(false);
    expect((await signup({ ...base, email: "bad", ip: nextIp() })).ok).toBe(false);
    expect((await signup({ ...base, email: "y@example.com", password: "short", ip: nextIp() })).ok).toBe(false);
    expect((await signup({ ...base, email: "z@example.com", ageConfirmed: false, ip: nextIp() })).ok).toBe(false);
    expect((await signup({ ...base, email: "<b>@example.com", ip: nextIp(), name: "<script>" })).ok).toBe(false);
    await signup({ ...base, email: "dup@example.com", deviceId: "d1-aaaaaaaaaaaaaaaaaaaa", ip: nextIp() });
    const again = await signup({ ...base, email: "DUP@example.com", deviceId: "d2-aaaaaaaaaaaaaaaaaaaa", ip: nextIp() });
    expect(again).toEqual({ ok: false, error: "EMAIL_TAKEN" });
  });

  it("limits accounts per device", async () => {
    expect((await signup({ ...base, email: "one@example.com", deviceId: "shared-aaaaaaaaaaaaaaaa", ip: nextIp() })).ok).toBe(true);
    expect(await signup({ ...base, email: "two@example.com", deviceId: "shared-aaaaaaaaaaaaaaaa", ip: nextIp() })).toEqual({ ok: false, error: "DEVICE_LIMIT" });
  });

  it("applies an invite code and gives the invite bonus", async () => {
    const ref = await makeUser();
    const r = await signup({ ...base, email: "friend@example.com", refCode: ref.refCode.toLowerCase(), deviceId: "f-aaaaaaaaaaaaaaaaaaaa", ip: nextIp() });
    expect(r.ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { email: "friend@example.com" } });
    expect(u.referredById).toBe(ref.id);
    expect(u.balance).toBe(500);
    expect(await signup({ ...base, email: "f2@example.com", refCode: "NOPE99", deviceId: "g-aaaaaaaaaaaaaaaaaaaa", ip: nextIp() })).toEqual({ ok: false, error: "BAD_REFERRAL" });
  });

  it("respects closed registration and rate limits by IP", async () => {
    await useSettings({ registrationOpen: false });
    expect(await signup({ ...base, email: "c@example.com", ip: nextIp() })).toEqual({ ok: false, error: "CLOSED" });
    await useSettings({ maxAccountsPerDevice: 20 });
    const ip = "203.0.113.200";
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await signup({ ...base, email: `rl${i}@example.com`, ip, deviceId: `rl${i}-aaaaaaaaaaaaaaaaaa` }));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.at(-1)).toEqual({ ok: false, error: "RATE_LIMIT" });
  });
});

describe("log in", () => {
  it("accepts the right password and gives one generic error otherwise", async () => {
    await signup({ ...base, email: "login@example.com", ip: nextIp() });
    expect((await checkPasswordLogin("LOGIN@example.com ", base.password, nextIp())).ok).toBe(true);
    expect(await checkPasswordLogin("login@example.com", "wrong password", nextIp())).toEqual({ ok: false, error: "INVALID" });
    expect(await checkPasswordLogin("nobody@example.com", base.password, nextIp())).toEqual({ ok: false, error: "INVALID" });
  });

  it("locks an email after 10 tries in 15 minutes", async () => {
    await signup({ ...base, email: "brute@example.com", ip: nextIp() });
    for (let i = 0; i < 10; i++) await checkPasswordLogin("brute@example.com", `guess-${i}`, nextIp());
    expect(await checkPasswordLogin("brute@example.com", base.password, nextIp())).toEqual({ ok: false, error: "RATE_LIMIT" });
  });

  it("refuses banned members", async () => {
    await signup({ ...base, email: "ban@example.com", ip: nextIp() });
    await db.user.update({ where: { email: "ban@example.com" }, data: { status: "BANNED" } });
    expect(await checkPasswordLogin("ban@example.com", base.password, nextIp())).toEqual({ ok: false, error: "BANNED" });
  });
});

describe("two-factor", () => {
  it("turns on with a real code and refuses replays and old-style codes", async () => {
    const u = await makeUser();
    const secret = await beginTotpSetup(u.id);
    expect(await confirmTotpSetup(u.id, "000000")).toBe(false);
    expect(await confirmTotpSetup(u.id, totp(secret))).toBe(true);
    const stored = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(stored.totpEnabled).toBe(true);
    expect(stored.totpSecretEnc).not.toContain(secret); // encrypted at rest
    // the code used for setup cannot be used again
    expect(await verifySecondFactor(u.id, totp(secret))).toBe(false);
    // next step's code works once
    const next = totp(secret, Date.now() + 30_000);
    expect(await verifySecondFactor(u.id, next)).toBe(true);
    expect(await verifySecondFactor(u.id, next)).toBe(false);
    // backup-style codes are not accepted any more
    expect(await verifySecondFactor(u.id, "4f9a-21c0")).toBe(false);
  });

  it("needs a valid code to switch off", async () => {
    const u = await makeUser();
    const secret = await beginTotpSetup(u.id);
    expect(await confirmTotpSetup(u.id, totp(secret))).toBe(true);
    expect(await disableTotp(u.id, "123456")).toBe(false);
    expect(await disableTotp(u.id, totp(secret, Date.now() + 30_000))).toBe(true);
    const stored = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(stored.totpEnabled).toBe(false);
    expect(stored.totpSecretEnc).toBeNull();
  });

  it("support reset removes 2FA and signs the member out everywhere", async () => {
    const { clearTotp } = await import("@/server/auth");
    const u = await makeUser();
    const secret = await beginTotpSetup(u.id);
    await confirmTotpSetup(u.id, totp(secret));
    await db.session.create({ data: { id: "lost-phone", userId: u.id, expiresAt: new Date(Date.now() + 1e7) } });
    await clearTotp(u.id);
    const stored = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(stored.totpEnabled).toBe(false);
    expect(stored.totpSecretEnc).toBeNull();
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  });
});

describe("passwords and email", () => {
  it("changes a password only with the current one", async () => {
    await signup({ ...base, email: "pw@example.com", ip: nextIp() });
    const u = await db.user.findUniqueOrThrow({ where: { email: "pw@example.com" } });
    expect(await changePassword(u.id, "wrong", "new password 1")).toEqual({ ok: false, error: "CURRENT" });
    expect(await changePassword(u.id, base.password, "short")).toEqual({ ok: false, error: "LENGTH" });
    expect(await changePassword(u.id, base.password, base.password)).toEqual({ ok: false, error: "SAME" });
    expect(await changePassword(u.id, base.password, "new password 1")).toEqual({ ok: true });
    expect((await checkPasswordLogin("pw@example.com", "new password 1", nextIp())).ok).toBe(true);
  });

  it("resets a password with a single-use token and signs out everywhere", async () => {
    await signup({ ...base, email: "reset@example.com", ip: nextIp() });
    const u = await db.user.findUniqueOrThrow({ where: { email: "reset@example.com" } });
    await db.session.create({ data: { id: "s1", userId: u.id, expiresAt: new Date(Date.now() + 1e7) } });
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((m: string) => void logs.push(m));
    await requestPasswordReset("reset@example.com", nextIp());
    const token = /token=([A-Za-z0-9_-]+)/.exec(logs.join("\n"))?.[1];
    expect(token).toBeTruthy();
    const row = await db.authToken.findFirstOrThrow({ where: { userId: u.id, purpose: "PASSWORD_RESET" } });
    expect(row.id).toBe(sha256(token!)); // only the hash is stored
    expect(await resetPassword(token!, "brand new pass 2")).toBe(true);
    expect(await resetPassword(token!, "another pass 3")).toBe(false);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await checkPasswordLogin("reset@example.com", "brand new pass 2", nextIp())).ok).toBe(true);
    // unknown emails behave the same and send nothing
    logs.length = 0;
    await requestPasswordReset("ghost@example.com", nextIp());
    expect(logs).toHaveLength(0);
  });

  it("verifies an email with the emailed link", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((m: string) => void logs.push(m));
    await signup({ ...base, email: "verify@example.com", ip: nextIp() });
    const token = /token=([A-Za-z0-9_-]+)/.exec(logs.join("\n"))?.[1];
    expect(await verifyEmail("not-a-real-token-xxxxxxxxxx")).toBe(false);
    expect(await verifyEmail(token!)).toBe(true);
    expect(await verifyEmail(token!)).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { email: "verify@example.com" } })).emailVerifiedAt).not.toBeNull();
  });
});

describe("owner bootstrap", () => {
  it("makes only the confirmed owner email an admin", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((m: string) => void logs.push(m));
    await signup({ ...base, email: "Owner@Example.com", ip: nextIp(), deviceId: "owner-aaaaaaaaaaaaaaaaaa" });
    expect((await db.user.findUniqueOrThrow({ where: { email: "owner@example.com" } })).role).toBe("USER");
    const token = /token=([A-Za-z0-9_-]+)/.exec(logs.join("\n"))?.[1];
    expect(await verifyEmail(token!)).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { email: "owner@example.com" } })).role).toBe("ADMIN");
    await signup({ ...base, email: "other@example.com", ip: nextIp(), deviceId: "other-aaaaaaaaaaaaaaaaaa" });
    const t2 = /token=([A-Za-z0-9_-]+)/g;
    const all = [...logs.join("\n").matchAll(t2)].map((m) => m[1]);
    await verifyEmail(all.at(-1)!);
    expect((await db.user.findUniqueOrThrow({ where: { email: "other@example.com" } })).role).toBe("USER");
  });
});

describe("Google sign-in", () => {
  const ctx = { locale: "en" as const, ip: "198.51.100.77", deviceId: "google-aaaaaaaaaaaaaaaa", country: "US" };
  it("creates a verified member and finds them again", async () => {
    const a = await upsertGoogleUser({ sub: "g-1", email: "G@Example.com", emailVerified: true, name: "Gina" }, ctx);
    expect("id" in a && a.created).toBe(true);
    const b = await upsertGoogleUser({ sub: "g-1", email: "g@example.com", emailVerified: true, name: "Gina" }, ctx);
    expect("id" in b && !b.created && "id" in a && b.id === a.id).toBe(true);
  });
  it("links to an existing account only for a verified Google email", async () => {
    await signup({ ...base, email: "link@example.com", ip: nextIp(), deviceId: "link-aaaaaaaaaaaaaaaaaa" });
    expect(await upsertGoogleUser({ sub: "g-2", email: "link@example.com", emailVerified: false, name: "X" }, ctx)).toEqual({ error: "EMAIL_NOT_VERIFIED" });
    const r = await upsertGoogleUser({ sub: "g-2", email: "link@example.com", emailVerified: true, name: "X" }, ctx);
    expect("id" in r && !r.created).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { email: "link@example.com" } })).googleId).toBe("g-2");
  });
});

describe("admin password reset link", () => {
  it("gives a one-time link that sets a new password", async () => {
    const { adminPasswordResetLink } = await import("@/server/auth");
    await signup({ ...base, email: "forgot@example.com", ip: nextIp(), deviceId: "forgot-aaaaaaaaaaaaaaaa" });
    const u = await db.user.findUniqueOrThrow({ where: { email: "forgot@example.com" } });
    const link = await adminPasswordResetLink(u.id);
    const token = new URL(link).searchParams.get("token")!;
    expect(link.startsWith("http://localhost:3000/en/reset-password?token=")).toBe(true);
    expect(await resetPassword(token, "fresh password 9")).toBe(true);
    expect(await resetPassword(token, "again password 9")).toBe(false);
    expect((await checkPasswordLogin("forgot@example.com", "fresh password 9", nextIp())).ok).toBe(true);
  });
});
