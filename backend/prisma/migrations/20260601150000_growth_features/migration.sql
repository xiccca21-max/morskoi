-- Growth features: win streaks, cosmetics, daily chest, group membership

ALTER TABLE "User" ADD COLUMN "winStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "bestWinStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "equippedTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "equippedFrame" TEXT;
ALTER TABLE "User" ADD COLUMN "equippedSkin" TEXT;
ALTER TABLE "User" ADD COLUMN "lastChestAt" DATETIME;

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_chatId_userId_key" ON "GroupMember"("chatId", "userId");
CREATE INDEX "GroupMember_chatId_idx" ON "GroupMember"("chatId");
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");
