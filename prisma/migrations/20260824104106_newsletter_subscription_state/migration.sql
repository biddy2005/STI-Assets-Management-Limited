-- AlterTable
ALTER TABLE "NewsletterSubscriber" ADD COLUMN     "isSubscribed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);
