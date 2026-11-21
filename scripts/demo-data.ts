/**
 * Sample offers and one enabled test network, for local development only.
 *   npm run demo:data
 * Refuses to run when NODE_ENV=production.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { encrypt } from "../src/lib/crypto";

if (process.env.NODE_ENV === "production") {
  console.error("demo-data is for local development only.");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

await db.network.upsert({
  where: { id: "demo" },
  create: { id: "demo", name: "Demo Network", kind: "Games", enabled: true, signatureMode: "HMAC_SHA256", secretEnc: encrypt("demo-secret", process.env.ENCRYPTION_KEY!) },
  update: { enabled: true },
});

const offers = [
  { title: "Tile Harbor", category: "game", payoutCents: 1800, color: "#1FA899", description: "Relaxing tile-matching puzzle set in a seaside town.", steps: [["Install and open the game", 2], ["Reach level 20", 13], ["Reach level 75", 35], ["Reach level 200", 50]] },
  { title: "Sky Raiders 3D", category: "game", payoutCents: 4200, color: "#4A5BE0", description: "Arcade flight shooter with daily boss raids.", steps: [["Finish the tutorial", 3], ["Clear stage 15", 17], ["Clear stage 40", 30], ["Clear stage 80", 50]] },
  { title: "Kingdom Ledger", category: "game", payoutCents: 6500, color: "#8B3FD1", description: "City-building strategy game. Long offer, highest payout.", steps: [["Build your first castle", 2], ["Town Hall level 6", 13], ["Town Hall level 10", 30], ["Town Hall level 14", 55]] },
  { title: "NeoBank Card", category: "finance", payoutCents: 3500, color: "#0F7B6C", description: "Free digital bank account. Identity check required.", steps: [["Open an account and make a first card purchase", 100]] },
  { title: "Budget Buddy", category: "signup", payoutCents: 600, color: "#F08A24", description: "Budgeting app. Free account.", steps: [["Create an account and link a bank", 100]] },
  { title: "StreamBox", category: "trial", payoutCents: 1200, color: "#D93A3A", description: "Movie streaming service. Cancel any time during the trial.", steps: [["Start a 30-day free trial", 100]] },
];
for (const o of offers) {
  const exists = await db.offer.findFirst({ where: { title: o.title } });
  if (exists) continue;
  await db.offer.create({
    data: {
      title: o.title,
      networkId: "demo",
      category: o.category,
      payoutCents: o.payoutCents,
      color: o.color,
      description: o.description,
      countries: ["US", "GB", "CA", "AU"],
      steps: o.steps.map(([label, pct]) => ({ label, pct })),
      trackingUrl: "https://example.com/offer?sub1={user_id}",
    },
  });
}
console.log("Demo network (secret: demo-secret) and sample offers are ready.");
await db.$disconnect();
