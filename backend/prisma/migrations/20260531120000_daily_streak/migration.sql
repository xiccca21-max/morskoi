-- Daily login streak fields
ALTER TABLE "User" ADD COLUMN "lastDailyClaimAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "loginStreak" INTEGER NOT NULL DEFAULT 0;
