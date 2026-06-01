-- Training matches: free practice vs bot, no wager / stats impact
ALTER TABLE "Match" ADD COLUMN "isTraining" BOOLEAN NOT NULL DEFAULT false;
