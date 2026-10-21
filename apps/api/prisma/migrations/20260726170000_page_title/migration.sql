-- Optional stage name for lesson pages, shown in the «План урока» (Э2.1).
-- Additive + nullable, so existing rows and the dev/test SQLite `db push` are
-- unaffected.
ALTER TABLE "LessonPage" ADD COLUMN "title" TEXT;
