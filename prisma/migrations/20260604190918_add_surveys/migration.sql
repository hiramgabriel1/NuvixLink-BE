-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "questionSurvey" TEXT NOT NULL,
    "options" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyVote" (
    "id" TEXT NOT NULL,
    "option" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,

    CONSTRAINT "SurveyVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Survey_authorId_idx" ON "Survey"("authorId");

-- CreateIndex
CREATE INDEX "SurveyVote_surveyId_idx" ON "SurveyVote"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyVote_userId_idx" ON "SurveyVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyVote_userId_surveyId_key" ON "SurveyVote"("userId", "surveyId");

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyVote" ADD CONSTRAINT "SurveyVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyVote" ADD CONSTRAINT "SurveyVote_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
