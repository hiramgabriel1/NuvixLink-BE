-- DropIndex
DROP INDEX IF EXISTS "User_clerkUserId_key";

-- AlterTable: remove clerkUserId and restore password NOT NULL
-- First set a placeholder for any null passwords (safety net for dev)
UPDATE "User" SET "password" = '' WHERE "password" IS NULL;

ALTER TABLE "User" ALTER COLUMN "password" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN IF EXISTS "clerkUserId";
