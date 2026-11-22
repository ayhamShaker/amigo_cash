process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://amigo:amigo_dev_pw@localhost:5432/amigo_test";
process.env.APP_URL = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdefghijklmnop";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET = "test-cron-secret";
process.env.BOOTSTRAP_ADMIN_EMAIL = "owner@example.com";
