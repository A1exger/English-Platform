-- A picture for a lesson's Preparation screen. Additive and nullable: every
-- lesson that exists simply has none.
ALTER TABLE "CourseLesson" ADD COLUMN "coverUrl" TEXT;
