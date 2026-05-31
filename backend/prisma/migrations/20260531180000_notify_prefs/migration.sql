-- Notify preferences for Telegram bot pushes
ALTER TABLE "User" ADD COLUMN "notifyMatchFound" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyPayout" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyRematch" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyReferral" BOOLEAN NOT NULL DEFAULT true;
