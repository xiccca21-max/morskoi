-- Performance indexes for hot query paths
CREATE INDEX "Match_status_endedAt_idx" ON "Match"("status", "endedAt");
CREATE INDEX "Transaction_userId_type_status_createdAt_idx" ON "Transaction"("userId", "type", "status", "createdAt");
CREATE INDEX "WithdrawalRequest_userId_status_createdAt_idx" ON "WithdrawalRequest"("userId", "status", "createdAt");
CREATE INDEX "Lobby_hostId_status_idx" ON "Lobby"("hostId", "status");
