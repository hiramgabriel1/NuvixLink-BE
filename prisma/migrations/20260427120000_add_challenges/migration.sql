-- CreateEnum
CREATE TYPE "ChallengeMode" AS ENUM ('SOLO', 'TEAMS');

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "mode" "ChallengeMode" NOT NULL,
    "prizeDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeSoloEnrollment" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeSoloEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeTeam" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Challenge_creatorId_idx" ON "Challenge"("creatorId");

-- CreateIndex
CREATE INDEX "Challenge_endsAt_idx" ON "Challenge"("endsAt");

-- CreateIndex
CREATE INDEX "Challenge_mode_idx" ON "Challenge"("mode");

-- CreateIndex
CREATE INDEX "ChallengeSoloEnrollment_userId_idx" ON "ChallengeSoloEnrollment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeSoloEnrollment_challengeId_userId_key" ON "ChallengeSoloEnrollment"("challengeId", "userId");

-- CreateIndex
CREATE INDEX "ChallengeTeam_challengeId_idx" ON "ChallengeTeam"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeTeamMember_userId_idx" ON "ChallengeTeamMember"("userId");

-- CreateIndex
CREATE INDEX "ChallengeTeamMember_teamId_idx" ON "ChallengeTeamMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeTeamMember_teamId_userId_key" ON "ChallengeTeamMember"("teamId", "userId");

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeSoloEnrollment" ADD CONSTRAINT "ChallengeSoloEnrollment_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeSoloEnrollment" ADD CONSTRAINT "ChallengeSoloEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeTeam" ADD CONSTRAINT "ChallengeTeam_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeTeamMember" ADD CONSTRAINT "ChallengeTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ChallengeTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeTeamMember" ADD CONSTRAINT "ChallengeTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
