-- Additive: AI generation provenance + review (SPEC §7). Enum-like columns are
-- TEXT for SQLite/Postgres portability.

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "courseId" TEXT,
    "courseLessonId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "level" TEXT,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRevision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationJob_requestedByUserId_idx" ON "GenerationJob"("requestedByUserId");

-- CreateIndex
CREATE INDEX "GenerationRevision_jobId_idx" ON "GenerationRevision"("jobId");

-- AddForeignKey
ALTER TABLE "GenerationRevision" ADD CONSTRAINT "GenerationRevision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
