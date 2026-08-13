-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM (
  'superadmin',
  'editor'
);


-- Add sessionVersion without touching existing administrator data
ALTER TABLE "Admin"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;


-- Remove the old text-column default before converting its type
ALTER TABLE "Admin"
ALTER COLUMN "role" DROP DEFAULT;


-- Convert the existing role column from text to AdminRole
-- while preserving existing values such as:
-- superadmin
-- editor
ALTER TABLE "Admin"
ALTER COLUMN "role"
TYPE "AdminRole"
USING ("role"::text::"AdminRole");


-- Restore the Editor default using the new enum type
ALTER TABLE "Admin"
ALTER COLUMN "role"
SET DEFAULT 'editor'::"AdminRole";


-- CreateIndex
CREATE INDEX "Admin_role_isActive_idx"
ON "Admin"("role", "isActive");