-- Add optional thumbnail image to Offer and ContestPayout table for weekly leaderboard payouts.
ALTER TABLE "Offer" ADD COLUMN "imageUrl" TEXT;

CREATE TABLE "ContestPayout" (
    "weekStart" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidById" TEXT,
    "totalCents" INTEGER NOT NULL,
    "winners" JSONB NOT NULL,

    CONSTRAINT "ContestPayout_pkey" PRIMARY KEY ("weekStart")
);
