-- Track visitor sessions by country and device type for admin analytics.
CREATE TABLE "TrafficCountry" (
    "day" DATE NOT NULL,
    "country" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrafficCountry_pkey" PRIMARY KEY ("day","country","device")
);
