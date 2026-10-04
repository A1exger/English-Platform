-- A Material is either a library item or a file embedded in course content.
-- Everything that exists today was created before the distinction, so it keeps
-- the library default; the reclassify-materials script moves course media over.
ALTER TABLE "Material" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'library';
