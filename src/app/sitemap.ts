import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";

const PUBLIC_PATHS = ["", "/earn", "/surveys", "/cashout", "/leaderboard", "/referrals", "/help", "/legal/terms", "/legal/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL || "https://amigo.cash").replace(/\/$/, "");
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];
  for (const path of PUBLIC_PATHS) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${base}/${locale}${path}`,
        lastModified: now,
        changeFrequency: path === "" || path === "/earn" ? "daily" : "weekly",
        priority: path === "" ? 1 : path === "/earn" || path === "/cashout" ? 0.9 : 0.7,
        alternates: {
          languages: Object.fromEntries(LOCALES.map((l) => [l, `${base}/${l}${path}`])),
        },
      });
    }
  }
  return entries;
}
