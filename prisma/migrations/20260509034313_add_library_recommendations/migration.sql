-- CreateTable
CREATE TABLE "LibraryRecommendation" (
    "id" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "packageUrl" TEXT NOT NULL,
    "installCommand" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "docsUrl" TEXT,
    "githubUrl" TEXT,
    "stars" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "LibraryRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryRecommendationVote" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,

    CONSTRAINT "LibraryRecommendationVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryRecommendationReport" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,

    CONSTRAINT "LibraryRecommendationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryRecommendation_ecosystem_idx" ON "LibraryRecommendation"("ecosystem");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryRecommendation_authorId_packageUrl_key" ON "LibraryRecommendation"("authorId", "packageUrl");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryRecommendationVote_userId_recommendationId_key" ON "LibraryRecommendationVote"("userId", "recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryRecommendationReport_userId_recommendationId_key" ON "LibraryRecommendationReport"("userId", "recommendationId");

-- AddForeignKey
ALTER TABLE "LibraryRecommendation" ADD CONSTRAINT "LibraryRecommendation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryRecommendationVote" ADD CONSTRAINT "LibraryRecommendationVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryRecommendationVote" ADD CONSTRAINT "LibraryRecommendationVote_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "LibraryRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryRecommendationReport" ADD CONSTRAINT "LibraryRecommendationReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryRecommendationReport" ADD CONSTRAINT "LibraryRecommendationReport_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "LibraryRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
