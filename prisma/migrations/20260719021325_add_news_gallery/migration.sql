-- CreateTable
CREATE TABLE "NewsImage" (
    "id" SERIAL NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "newsArticleId" INTEGER NOT NULL,

    CONSTRAINT "NewsImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsImage_newsArticleId_idx" ON "NewsImage"("newsArticleId");

-- AddForeignKey
ALTER TABLE "NewsImage" ADD CONSTRAINT "NewsImage_newsArticleId_fkey" FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
