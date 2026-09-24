-- Attach a course lesson (content) to a scheduled calendar Lesson, so the room
-- opens onto the right material for everyone and it survives a device change.
-- Additive + nullable (a loose id, like boardId), so existing rows and the
-- dev/test SQLite `db push` are unaffected.
ALTER TABLE "Lesson" ADD COLUMN "materialLessonId" TEXT;
