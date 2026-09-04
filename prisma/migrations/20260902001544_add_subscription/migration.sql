-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'KYC_INCOMPLETE', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubscriptionProduct" AS ENUM ('MONEY_MARKET_NOTE', 'FIXED_INCOME_NOTE', 'FIXED_INCOME_DOLLAR_NOTE');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('UNEMPLOYED', 'SELF_EMPLOYED', 'EMPLOYED', 'RETIRED');

-- CreateEnum
CREATE TYPE "MaturityMandate" AS ENUM ('ROLLOVER_PRINCIPAL_AND_INTEREST', 'ROLLOVER_PRINCIPAL_PAY_INTEREST', 'PAY_PRINCIPAL_AND_INTEREST');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "product" "SubscriptionProduct" NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "surname" TEXT NOT NULL,
    "maidenName" TEXT,
    "gender" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "maritalStatus" TEXT NOT NULL,
    "stateOfOrigin" TEXT NOT NULL,
    "lga" TEXT NOT NULL,
    "residentialAddress" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "employmentStatus" "EmploymentStatus" NOT NULL,
    "meansOfIdentification" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "nextOfKinName" TEXT NOT NULL,
    "nextOfKinRelationship" TEXT NOT NULL,
    "nextOfKinPhone" TEXT NOT NULL,
    "nextOfKinAddress" TEXT NOT NULL,
    "natureOfBusiness" TEXT,
    "estimatedAnnualIncome" DECIMAL(18,2),
    "principalAmount" DECIMAL(18,2) NOT NULL,
    "fixedDepositTenor" TEXT NOT NULL,
    "riskAcceptance" INTEGER NOT NULL,
    "maturityMandate" "MaturityMandate" NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bvnEncrypted" TEXT NOT NULL,
    "bvnLast4" VARCHAR(4) NOT NULL,
    "ninEncrypted" TEXT,
    "ninLast4" VARCHAR(4),
    "passportStorageKey" TEXT NOT NULL,
    "passportOriginalName" TEXT NOT NULL,
    "passportMimeType" TEXT NOT NULL,
    "passportFileSize" INTEGER NOT NULL,
    "idDocStorageKey" TEXT NOT NULL,
    "idDocOriginalName" TEXT NOT NULL,
    "idDocMimeType" TEXT NOT NULL,
    "idDocFileSize" INTEGER NOT NULL,
    "utilityBillStorageKey" TEXT NOT NULL,
    "utilityBillOriginalName" TEXT NOT NULL,
    "utilityBillMimeType" TEXT NOT NULL,
    "utilityBillFileSize" INTEGER NOT NULL,
    "attestationAccepted" BOOLEAN NOT NULL DEFAULT false,
    "attestationAcceptedAt" TIMESTAMP(3),
    "privacyAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "privacyAcknowledgedAt" TIMESTAMP(3),
    "privacyNoticeVersion" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'NEW',
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "forwardedToPowerAutomate" BOOLEAN NOT NULL DEFAULT false,
    "forwardedAt" TIMESTAMP(3),
    "forwardingError" TEXT,
    "submittedIpHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_reference_key" ON "Subscription"("reference");

-- CreateIndex
CREATE INDEX "Subscription_status_createdAt_idx" ON "Subscription"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Subscription_email_idx" ON "Subscription"("email");

-- CreateIndex
CREATE INDEX "Subscription_reference_idx" ON "Subscription"("reference");
