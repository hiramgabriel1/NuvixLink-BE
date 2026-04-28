-- AlterEnum NotificationType — nuevos valores (ejecutar en orden)
ALTER TYPE "NotificationType" ADD VALUE 'LIKE_ON_YOUR_POST_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE 'REPLY_TO_YOUR_POST_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE 'LIKE_ON_YOUR_DISCUSSION_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE 'REPLY_TO_YOUR_DISCUSSION_COMMENT';
