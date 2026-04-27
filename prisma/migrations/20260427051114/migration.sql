-- This migration is intentionally minimal.
-- It was applied to the dev database but the local file was missing, causing drift.
-- Re-adding it here brings migration history back in sync.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isNewUser" BOOLEAN NOT NULL DEFAULT true;

