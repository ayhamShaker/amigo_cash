/**
 * Production-safe seed: default settings and the offer networks we plan to
 * integrate, all switched OFF and without secrets. Re-running it changes nothing
 * that already exists.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const NETWORKS = [
  { id: "torox", name: "Torox", kind: "Games", signatureMode: "MD5_CONCAT" },
  { id: "adgem", name: "AdGem", kind: "Mixed offers", signatureMode: "HMAC_SHA256" },
  { id: "mychips", name: "MyChips", kind: "Play-time games", signatureMode: "HMAC_SHA256" },
  { id: "revu", name: "RevU", kind: "Sign-ups & trials", signatureMode: "HMAC_SHA256" },
  { id: "bitlabs", name: "BitLabs", kind: "Surveys", signatureMode: "HMAC_SHA1_URL" },
  { id: "cpalead", name: "CPAlead", kind: "Mixed offers", signatureMode: "SECRET_PARAM" },
];

async function main() {
  for (const n of NETWORKS) {
    await db.network.upsert({ where: { id: n.id }, create: { ...n, enabled: false }, update: {} });
  }
  console.log(`Seeded ${NETWORKS.length} offer networks (all disabled until you add their secrets in the admin panel).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
