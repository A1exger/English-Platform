-- Why a notification was not delivered. Until now every row was marked "sent"
-- whether or not the mail server accepted it, so a message that never arrived
-- looked identical to one that did.
--
-- Additive and nullable: existing rows keep their status and simply have no
-- reason recorded.
ALTER TABLE "Notification" ADD COLUMN "error" TEXT;
