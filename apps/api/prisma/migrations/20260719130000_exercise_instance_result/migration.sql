-- Additive: store the graded ExerciseResult for a canonical task instance so a
-- late-joining/reloading peer can restore the per-element marking (ФТ-У203,
-- ФТ-У503). Legacy instances leave it null.

-- AlterTable
ALTER TABLE "ExerciseInstance" ADD COLUMN     "result" TEXT;
