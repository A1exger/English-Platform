-- Shared word bank: a platform-wide pool of words a tutor curates once, which
-- students copy into their own DictionaryEntry. Purely additive — a new table
-- only, so existing rows are untouched and the dev/test SQLite `db push` stays
-- in step.
CREATE TABLE "WordBankEntry" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "translation" TEXT,
    "example" TEXT,
    "topic" TEXT,
    "source" TEXT NOT NULL DEFAULT 'import',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordBankEntry_pkey" PRIMARY KEY ("id")
);

-- Unique on the word so re-importing a list updates instead of duplicating.
CREATE UNIQUE INDEX "WordBankEntry_word_key" ON "WordBankEntry"("word");
CREATE INDEX "WordBankEntry_topic_idx" ON "WordBankEntry"("topic");
