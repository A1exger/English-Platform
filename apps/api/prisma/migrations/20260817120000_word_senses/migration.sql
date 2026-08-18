-- Multiple meanings per bank word. A common word is polysemous ("bank" = money
-- place / river side), which one translation column cannot express — and it is
-- also why bulk machine translation of bare words is unreliable: a sense gives
-- the translator the context it needs.
--
-- Additive: a new table plus one nullable column, so existing rows keep working
-- and the dev/test SQLite `db push` stays in step.
CREATE TABLE "WordSense" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "partOfSpeech" TEXT,
    "definition" TEXT NOT NULL,
    "example" TEXT,
    "translations" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordSense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WordSense_entryId_idx" ON "WordSense"("entryId");
ALTER TABLE "WordSense" ADD CONSTRAINT "WordSense_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "WordBankEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which sense a student actually learned. No FK on purpose: a tutor may delete a
-- bank word, and that must not cascade into a student's personal vocabulary.
ALTER TABLE "DictionaryEntry" ADD COLUMN "senseId" TEXT;
