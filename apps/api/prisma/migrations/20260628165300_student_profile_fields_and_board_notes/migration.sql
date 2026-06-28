-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "country" TEXT;
