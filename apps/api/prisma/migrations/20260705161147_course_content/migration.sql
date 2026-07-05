-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "selfStudy" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseLesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "objectives" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPage" (
    "id" TEXT NOT NULL,
    "courseLessonId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "includedInHomework" BOOLEAN NOT NULL DEFAULT false,
    "mediaUrl" TEXT,
    "text" TEXT,

    CONSTRAINT "LessonPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonTask" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gradingMode" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 5,
    "order" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL,
    "answerKey" TEXT,

    CONSTRAINT "LessonTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wordlist" (
    "id" TEXT NOT NULL,
    "courseLessonId" TEXT NOT NULL,

    CONSTRAINT "Wordlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordlistEntry" (
    "id" TEXT NOT NULL,
    "wordlistId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "translation" TEXT,
    "example" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WordlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarReference" (
    "id" TEXT NOT NULL,
    "courseLessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "form" TEXT NOT NULL,

    CONSTRAINT "GrammarReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryEntry" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "translation" TEXT,
    "sourceLessonId" TEXT,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DictionaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAssignment" (
    "id" TEXT NOT NULL,
    "courseLessonId" TEXT,
    "studentProfileId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "topicTag" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkCard" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "taskSnapshot" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "HomeworkCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonResult" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "overall" DOUBLE PRECISION,
    "perAspect" TEXT NOT NULL,
    "completion" DOUBLE PRECISION NOT NULL,
    "motivationTier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Course_categoryId_idx" ON "Course"("categoryId");

-- CreateIndex
CREATE INDEX "Section_courseId_level_idx" ON "Section"("courseId", "level");

-- CreateIndex
CREATE INDEX "Unit_sectionId_idx" ON "Unit"("sectionId");

-- CreateIndex
CREATE INDEX "CourseLesson_unitId_idx" ON "CourseLesson"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseLesson_courseId_level_order_key" ON "CourseLesson"("courseId", "level", "order");

-- CreateIndex
CREATE INDEX "LessonPage_courseLessonId_idx" ON "LessonPage"("courseLessonId");

-- CreateIndex
CREATE INDEX "LessonTask_pageId_idx" ON "LessonTask"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "Wordlist_courseLessonId_key" ON "Wordlist"("courseLessonId");

-- CreateIndex
CREATE INDEX "WordlistEntry_wordlistId_idx" ON "WordlistEntry"("wordlistId");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarReference_courseLessonId_key" ON "GrammarReference"("courseLessonId");

-- CreateIndex
CREATE INDEX "DictionaryEntry_studentProfileId_idx" ON "DictionaryEntry"("studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryEntry_studentProfileId_word_key" ON "DictionaryEntry"("studentProfileId", "word");

-- CreateIndex
CREATE INDEX "ContentAssignment_studentProfileId_idx" ON "ContentAssignment"("studentProfileId");

-- CreateIndex
CREATE INDEX "HomeworkCard_assignmentId_idx" ON "HomeworkCard"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonResult_assignmentId_key" ON "LessonResult"("assignmentId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPage" ADD CONSTRAINT "LessonPage_courseLessonId_fkey" FOREIGN KEY ("courseLessonId") REFERENCES "CourseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTask" ADD CONSTRAINT "LessonTask_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "LessonPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wordlist" ADD CONSTRAINT "Wordlist_courseLessonId_fkey" FOREIGN KEY ("courseLessonId") REFERENCES "CourseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordlistEntry" ADD CONSTRAINT "WordlistEntry_wordlistId_fkey" FOREIGN KEY ("wordlistId") REFERENCES "Wordlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarReference" ADD CONSTRAINT "GrammarReference_courseLessonId_fkey" FOREIGN KEY ("courseLessonId") REFERENCES "CourseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkCard" ADD CONSTRAINT "HomeworkCard_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ContentAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResult" ADD CONSTRAINT "LessonResult_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ContentAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
