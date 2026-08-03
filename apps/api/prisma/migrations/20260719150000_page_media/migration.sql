-- Additive: several media attachments per lesson page (SPEC §7). The legacy
-- LessonPage.mediaUrl column is left untouched for compatibility.

-- CreateTable
CREATE TABLE "PageMedia" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "transcript" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageMedia_pageId_idx" ON "PageMedia"("pageId");

-- AddForeignKey
ALTER TABLE "PageMedia" ADD CONSTRAINT "PageMedia_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "LessonPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
