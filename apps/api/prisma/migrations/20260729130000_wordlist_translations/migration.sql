-- Per-locale wordlist translations (V1): a JSON map { "fr": "…", … } filled by
-- the AI translate step. The lesson serves translations[reqLocale] and falls
-- back to the authored `translation`. Additive + nullable, so existing rows and
-- the dev/test SQLite `db push` are unaffected.
ALTER TABLE "WordlistEntry" ADD COLUMN "translations" TEXT;
