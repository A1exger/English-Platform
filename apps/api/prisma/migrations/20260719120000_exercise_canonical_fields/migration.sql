-- Additive: canonical interactive-task fields on the standalone Exercise
-- template (SPEC §7). Existing rows keep working (all new columns are optional
-- or defaulted), so legacy "order|match|fill|categorize" exercises are untouched.

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "prompt" TEXT;
ALTER TABLE "Exercise" ADD COLUMN     "answerKey" TEXT;
ALTER TABLE "Exercise" ADD COLUMN     "gradingMode" TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE "Exercise" ADD COLUMN     "aspect" TEXT NOT NULL DEFAULT 'Grammar';
ALTER TABLE "Exercise" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Exercise_ownerUserId_type_idx" ON "Exercise"("ownerUserId", "type");
