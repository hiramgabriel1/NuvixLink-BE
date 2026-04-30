-- CreateTable
CREATE TABLE "HiddenDiscussion" (
    "userId" TEXT NOT NULL,
    "discussionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenDiscussion_pkey" PRIMARY KEY ("userId","discussionId")
);

-- CreateIndex
CREATE INDEX "HiddenDiscussion_discussionId_idx" ON "HiddenDiscussion"("discussionId");

-- AddForeignKey
ALTER TABLE "HiddenDiscussion" ADD CONSTRAINT "HiddenDiscussion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenDiscussion" ADD CONSTRAINT "HiddenDiscussion_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
