import { describe, expect, it } from "vitest";
import { decodeAttribution, detectAttribution, encodeAttribution, sourceFromHost } from "@/lib/attribution";

describe("attribution", () => {
  it("names common referrers", () => {
    expect(sourceFromHost("www.tiktok.com")).toBe("tiktok");
    expect(sourceFromHost("m.youtube.com")).toBe("youtube");
    expect(sourceFromHost("youtu.be")).toBe("youtube");
    expect(sourceFromHost("old.reddit.com")).toBe("reddit");
    expect(sourceFromHost("t.co")).toBe("x");
    expect(sourceFromHost("www.google.co.uk")).toBe("google");
    expect(sourceFromHost("blog.example.org")).toBe("blog.example.org");
  });

  it("prefers utm_source and ignores internal navigation", () => {
    const own = "amigo.cash";
    expect(detectAttribution(new URL("https://amigo.cash/en?utm_source=TikTok&utm_campaign=Video%201"), null, own)).toEqual({ source: "tiktok", medium: null, campaign: "video-1", refHost: null });
    expect(detectAttribution(new URL("https://amigo.cash/en"), "https://www.reddit.com/r/beermoney/", own)).toMatchObject({ source: "reddit", refHost: "www.reddit.com" });
    expect(detectAttribution(new URL("https://amigo.cash/en/earn"), "https://amigo.cash/en", own)).toBeNull();
    expect(detectAttribution(new URL("https://amigo.cash/en"), null, own)).toBeNull();
    expect(detectAttribution(new URL("https://amigo.cash/en"), "not a url", own)).toBeNull();
  });

  it("round-trips the cookie and rejects junk", () => {
    const a = { source: "youtube", medium: "video", campaign: "review-1", refHost: "www.youtube.com" };
    expect(decodeAttribution(encodeAttribution(a))).toEqual(a);
    expect(decodeAttribution("")).toBeNull();
    expect(decodeAttribution("%E0%A4%A|x")).toBeNull();
    expect(decodeAttribution("<script>|a")?.source).toBe("script");
  });
});
