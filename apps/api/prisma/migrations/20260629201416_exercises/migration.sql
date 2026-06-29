-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseInstance" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "lessonId" TEXT,
    "homeworkId" TEXT,
    "studentProfileId" TEXT,
    "state" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exercise_ownerUserId_idx" ON "Exercise"("ownerUserId");

-- CreateIndex
CREATE INDEX "ExerciseInstance_lessonId_idx" ON "ExerciseInstance"("lessonId");

-- CreateIndex
CREATE INDEX "ExerciseInstance_homeworkId_idx" ON "ExerciseInstance"("homeworkId");

-- CreateIndex
CREATE INDEX "ExerciseInstance_studentProfileId_idx" ON "ExerciseInstance"("studentProfileId");

-- AddForeignKey
ALTER TABLE "ExerciseInstance" ADD CONSTRAINT "ExerciseInstance_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
