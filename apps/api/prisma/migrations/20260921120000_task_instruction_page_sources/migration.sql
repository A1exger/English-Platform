-- Two additive, nullable columns for the reading-page layout.
--
-- LessonTask.instruction — the line telling the student what to do ("Read and
-- match the title and the paragraph"). The payload holds the material only, so
-- until now a drag task appeared on the page with no wording at all.
--
-- LessonPage.sources — credits for the page's text and pictures, shown small
-- under the content.
--
-- Both nullable, so pages and tasks authored earlier keep working and the
-- dev/test SQLite `db push` stays in step.
ALTER TABLE "LessonTask" ADD COLUMN "instruction" TEXT;
ALTER TABLE "LessonPage" ADD COLUMN "sources" TEXT;
