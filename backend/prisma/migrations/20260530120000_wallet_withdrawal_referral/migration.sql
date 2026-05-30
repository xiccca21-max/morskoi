-- User: new columns
ALTER TABLE "User" ADD COLUMN "nickname" TEXT;
ALTER TABLE "User" ADD COLUMN "language" TEXT;
ALTER TABLE "User" ADD COLUMN "withdrawable" REAL NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "agreedToTermsAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;
ALTER TABLE "User" ADD COLUMN "referralCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "dailyDepositLimit" REAL;
ALTER TABLE "User" ADD COLUMN "selfExcludedUntil" DATETIME;

CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- WithdrawalRequest
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "fee" REAL NOT NULL DEFAULT 0,
    "net" REAL NOT NULL,
    "method" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    CONSTRAINT "WithdrawalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WithdrawalRequest_userId_idx" ON "WithdrawalRequest"("userId");
CREATE INDEX "WithdrawalRequest_status_idx" ON "WithdrawalRequest"("status");

-- ActionLog
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ActionLog_userId_idx" ON "ActionLog"("userId");
CREATE INDEX "ActionLog_action_idx" ON "ActionLog"("action");

-- Backfill: существующим юзерам withdrawable = текущий balance (считаем их деньги реальными)
UPDATE "User" SET "withdrawable" = "balance";
