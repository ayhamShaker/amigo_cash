import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, otpauthUri, totp, verifyTotp } from "@/lib/totp";

const RFC_KEY = Buffer.from("12345678901234567890", "ascii");

describe("HOTP (RFC 4226 appendix D)", () => {
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  expected.forEach((code, counter) => {
    it(`counter ${counter} → ${code}`, () => expect(hotp(RFC_KEY, counter)).toBe(code));
  });
});

describe("TOTP (RFC 6238 appendix B, SHA-1, 8 digits)", () => {
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [t, code] of vectors) {
    it(`T=${t}`, () => expect(hotp(RFC_KEY, Math.floor(t / 30), 8)).toBe(code));
  }
});

describe("base32", () => {
  it("round-trips random bytes", () => {
    for (let i = 0; i < 50; i++) {
      const buf = Buffer.from(Array.from({ length: 1 + (i % 25) }, () => Math.floor(Math.random() * 256)));
      expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    }
  });
  it("matches the RFC 4648 test vector", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });
  it("rejects invalid characters", () => {
    expect(() => base32Decode("ABC1")).toThrow();
  });
});

describe("verifyTotp", () => {
  const secret = base32Encode(RFC_KEY);
  const now = 1_700_000_000_000;
  it("accepts the current code and one step of drift", () => {
    expect(verifyTotp(secret, totp(secret, now), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now + 30_000), now)).not.toBeNull();
  });
  it("rejects codes two steps away, wrong length and non-digits", () => {
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
  });
  it("accepts a code typed with a space", () => {
    const c = totp(secret, now);
    expect(verifyTotp(secret, `${c.slice(0, 3)} ${c.slice(3)}`, now)).not.toBeNull();
  });
});

describe("helpers", () => {
  it("builds an otpauth URI Google Authenticator understands", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "sam@example.com");
    expect(uri.startsWith("otpauth://totp/Amigo%20Cash%3Asam%40example.com?")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Amigo+Cash");
  });
});
