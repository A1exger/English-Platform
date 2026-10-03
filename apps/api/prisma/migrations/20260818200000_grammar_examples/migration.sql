-- Example sentences for a lesson's grammar reference: a JSON string array, the
-- same shape CourseLesson.objectives uses.
--
-- Additive and nullable, so grammar notes written before this keep working and
-- the dev/test SQLite `db push` stays in step.
ALTER TABLE "GrammarReference" ADD COLUMN "examples" TEXT;
