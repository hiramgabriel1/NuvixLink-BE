-- AlterTable: threaded comments on posts
ALTER TABLE "Comment" ADD COLUMN "parentId" TEXT;

-- AlterTable: threaded comments on discussions
ALTER TABLE "DiscussionComment" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "DiscussionComment_parentId_idx" ON "DiscussionComment"("parentId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
