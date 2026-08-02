-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "privacyAcknowledged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privacyAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "privacyNoticeVersion" TEXT;
