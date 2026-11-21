/**
 * Gives an existing account admin rights.
 *   npm run admin:make -- you@example.com
 * The account must then turn on two-factor login (Account → Two-factor login)
 * before the admin panel opens.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:make -- you@example.com");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const user = await db.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No account uses ${email}. Sign up on the site first, then run this again.`);
  process.exit(1);
}
await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
await db.session.deleteMany({ where: { userId: user.id } });
await db.auditLog.create({ data: { actorId: null, action: "user.make_admin.cli", targetType: "user", targetId: user.id } });
console.log(`${email} is now an admin. Log in again, turn on two-factor login on the Account page, then open /admin.`);
await db.$disconnect();
