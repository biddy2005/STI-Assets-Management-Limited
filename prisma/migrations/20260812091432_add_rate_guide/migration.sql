-- CreateTable
CREATE TABLE "RateGuide" (
    "id" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateGuide_pkey" PRIMARY KEY ("id")
);
