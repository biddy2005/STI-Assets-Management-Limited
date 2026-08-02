/*
  Warnings:

  - You are about to drop the column `resumeUrl` on the `JobApplication` table. All the data in the column will be lost.
  - Added the required column `resumeFileSize` to the `JobApplication` table without a default value. This is not possible if the table is not empty.
  - Added the required column `resumeMimeType` to the `JobApplication` table without a default value. This is not possible if the table is not empty.
  - Added the required column `resumeOriginalName` to the `JobApplication` table without a default value. This is not possible if the table is not empty.
  - Added the required column `resumeStorageKey` to the `JobApplication` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "JobApplication" DROP COLUMN "resumeUrl",
ADD COLUMN     "resumeFileSize" INTEGER NOT NULL,
ADD COLUMN     "resumeMimeType" TEXT NOT NULL,
ADD COLUMN     "resumeOriginalName" TEXT NOT NULL,
ADD COLUMN     "resumeStorageKey" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "JobApplication_jobId_idx" ON "JobApplication"("jobId");

-- CreateIndex
CREATE INDEX "JobApplication_submittedAt_idx" ON "JobApplication"("submittedAt");
