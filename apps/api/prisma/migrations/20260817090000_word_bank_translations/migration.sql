-- Per-locale glosses for the shared word bank, mirroring
-- WordlistEntry.translations: a JSON map { "ru": "…", "de": "…" } served by the
-- reader's locale with `translation` as the fallback. Additive and nullable, so
-- existing rows keep working and the dev/test SQLite `db push` stays in step.
ALTER TABLE "WordBankEntry" ADD COLUMN "translations" TEXT;
