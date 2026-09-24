-- Course audience (V1): a course is either shared with every student once it is
-- published ("public", the existing behaviour and the default so no row changes
-- meaning) or built for named students only ("private"), who are listed in
-- CourseAccess. Additive with a default + a new table, so existing rows and the
-- dev/test SQLite `db push` are unaffected.
ALTER TABLE "Course" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public';

CREATE TABLE "CourseAccess" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseAccess_courseId_studentProfileId_key"
    ON "CourseAccess"("courseId", "studentProfileId");
CREATE INDEX "CourseAccess_studentProfileId_idx"
    ON "CourseAccess"("studentProfileId");

ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_studentProfileId_fkey"
    FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
