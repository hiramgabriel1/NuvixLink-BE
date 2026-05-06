-- CreateIndex
CREATE INDEX "HiddenPost_userId_idx" ON "HiddenPost"("userId");

-- CreateIndex
CREATE INDEX "Post_isDraft_createdAt_idx" ON "Post"("isDraft", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Post_isDraft_authorId_createdAt_idx" ON "Post"("isDraft", "authorId", "createdAt" DESC);
