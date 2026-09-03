-- Additive: catalog fields on Course (SPEC §7) — cover image, description and a
-- manual sort order for drag-reorder. Existing rows default order to 0 (they
-- keep their createdAt fallback ordering until first reordered).

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "description" TEXT;
ALTER TABLE "Course" ADD COLUMN     "coverUrl" TEXT;
ALTER TABLE "Course" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;
