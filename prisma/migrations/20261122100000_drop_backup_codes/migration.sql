-- Backup codes are no longer used: two-factor login relies on the authenticator app alone.
-- Dropping the table also invalidates every code that was issued.
DROP TABLE "BackupCode";
