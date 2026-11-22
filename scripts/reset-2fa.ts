/**
 * Emergency: removes two-factor login from an account whose owner lost their
 * phone (for example the site owner, who cannot use the admin panel then).
 *   npm run 2fa:reset -- you@example.com
 * Needs DATABASE_URL of the live database. Signs the account out everywhere.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run 2fa:reset -- you@example.com");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const user = await db.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No account uses ${email}.`);
  process.exit(1);
}
await db.$transaction([
  db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEnc: null, totpLastCounter: null } }),
  db.session.deleteMany({ where: { userId: user.id } }),
  db.auditLog.create({ data: { actorId: null, action: "user.reset_2fa.cli", targetType: "user", targetId: user.id } }),
]);
console.log(`Two-factor login removed for ${email}. Log in and set it up again on the Account page.`);
await db.$disconnect();
