-- AlterTable
ALTER TABLE "Lobby" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Lobby_isPublic_status_idx" ON "Lobby"("isPublic", "status");
