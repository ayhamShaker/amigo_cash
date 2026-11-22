/**
 * First-touch attribution: where a visitor came from before signing up.
 * Pure helpers shared by the proxy, the API and the server code.
 */

export const SOURCE_COOKIE = "amigo_src";
export const CREATOR_COOKIE = "amigo_creator";
export const ATTRIBUTION_DAYS = 30;

export type Attribution = { source: string; medium: string | null; campaign: string | null; refHost: string | null };

/** Lower-case, safe characters only, short. */
export function clean(v: string | null | undefined, max = 40): string | null {
  if (!v) return null;
  const s = v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return s || null;
}

const HOSTS: [RegExp, string][] = [
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "facebook"],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, "x"],
  [/(^|\.)(discord\.com|discord\.gg|discordapp\.com)$/, "discord"],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, "telegram"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
  [/(^|\.)pinterest\.[a-z.]+$/, "pinterest"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\.[a-z.]+$/, "yahoo"],
  [/(^|\.)trustpilot\.com$/, "trustpilot"],
];

/** Friendly source name for a referring host ("www.tiktok.com" → "tiktok"). */
export function sourceFromHost(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const [re, name] of HOSTS) if (re.test(h)) return name;
  return clean(h, 40) ?? "other";
}

/**
 * Works out the source from the landing URL and the Referer header.
 * Returns null for internal navigation and for visits with nothing to go on.
 */
export function detectAttribution(url: URL, referer: string | null, ownHost: string): Attribution | null {
  const utm = clean(url.searchParams.get("utm_source"));
  let refHost: string | null = null;
  if (referer) {
    try {
      const h = new URL(referer).hostname.toLowerCase();
      if (h && h !== ownHost.toLowerCase()) refHost = clean(h, 80);
    } catch {
      /* ignore a malformed header */
    }
  }
  if (!utm && !refHost) return null;
  return {
    source: utm ?? sourceFromHost(refHost!),
    medium: clean(url.searchParams.get("utm_medium")),
    campaign: clean(url.searchParams.get("utm_campaign"), 60),
    refHost,
  };
}

export function encodeAttribution(a: Attribution): string {
  return [a.source, a.medium ?? "", a.campaign ?? "", a.refHost ?? ""].map((v) => encodeURIComponent(v)).join("|");
}

export function decodeAttribution(v: string | undefined | null): Attribution | null {
  if (!v) return null;
  const parts = v.split("|").map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return "";
    }
  });
  const source = clean(parts[0]);
  if (!source) return null;
  return { source, medium: clean(parts[1]), campaign: clean(parts[2], 60), refHost: clean(parts[3], 80) };
}
