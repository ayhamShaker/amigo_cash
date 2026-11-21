import { execSync } from "node:child_process";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://amigo:amigo_dev_pw@localhost:5432/amigo_test";

/** Applies any new migrations to the test database once per run. Tests empty the tables themselves. */
export default function setup() {
  if (!/amigo_test|_test\b|test/.test(TEST_DATABASE_URL)) {
    throw new Error("Refusing to run tests against a database whose name does not contain 'test'");
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
