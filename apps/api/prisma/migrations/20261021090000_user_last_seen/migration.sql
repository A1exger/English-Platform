-- When an account last held a live session, for the admin's Users table.
-- Additive and nullable: existing accounts read "never" until they next sign
-- in or refresh a token, which is the honest answer — nothing recorded it.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
