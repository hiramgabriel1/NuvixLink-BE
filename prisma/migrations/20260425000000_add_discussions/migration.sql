-- CreateTable
CREATE TABLE "Discussion" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discussion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionLike" (
    "userId" TEXT NOT NULL,
    "discussionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionLike_pkey" PRIMARY KEY ("userId","discussionId")
);

-- CreateTable
CREATE TABLE "DiscussionComment" (
    "id" TEXT NOT NULL,
    "discussionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Discussion_authorId_idx" ON "Discussion"("authorId");

-- CreateIndex
CREATE INDEX "Discussion_createdAt_idx" ON "Discussion"("createdAt");

-- CreateIndex
CREATE INDEX "DiscussionLike_discussionId_idx" ON "DiscussionLike"("discussionId");

-- CreateIndex
CREATE INDEX "DiscussionComment_discussionId_idx" ON "DiscussionComment"("discussionId");

-- CreateIndex
CREATE INDEX "DiscussionComment_authorId_idx" ON "DiscussionComment"("authorId");

-- AddForeignKey
ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionLike" ADD CONSTRAINT "DiscussionLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionLike" ADD CONSTRAINT "DiscussionLike_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
