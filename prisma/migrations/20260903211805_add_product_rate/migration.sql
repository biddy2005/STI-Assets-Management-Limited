-- CreateTable
CREATE TABLE "ProductRate" (
    "id" SERIAL NOT NULL,
    "product" "SubscriptionProduct" NOT NULL,
    "tenorMinDays" INTEGER NOT NULL,
    "tenorMaxDays" INTEGER NOT NULL,
    "minAmount" DECIMAL(18,2) NOT NULL,
    "maxAmount" DECIMAL(18,2),
    "ratePercent" DECIMAL(6,3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductRate_product_isActive_idx" ON "ProductRate"("product", "isActive");

-- CreateIndex
CREATE INDEX "ProductRate_product_tenorMinDays_minAmount_idx" ON "ProductRate"("product", "tenorMinDays", "minAmount");
