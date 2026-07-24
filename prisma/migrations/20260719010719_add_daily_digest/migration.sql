-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');

-- CreateTable
CREATE TABLE "DailyDigest" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'STIAM Daily Market Digest',
    "filePath" TEXT NOT NULL,
    "publishDate" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyDigest_publishDate_idx" ON "DailyDigest"("publishDate");

-- CreateIndex
CREATE INDEX "DailyDigest_dayOfWeek_publishDate_idx" ON "DailyDigest"("dayOfWeek", "publishDate");
