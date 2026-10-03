-- Data minimisation: a tutoring platform needs neither a student's postal
-- address nor their date of birth. Neither is used to schedule, teach or bill a
-- lesson, and holding them adds an access-request obligation and a retention
-- rule for nothing.
--
-- This DELETES the two columns and whatever is in them. That is the point of
-- the change, not a side effect — take a backup first if the address was ever
-- used for something outside this codebase.
ALTER TABLE "StudentProfile" DROP COLUMN "address";
ALTER TABLE "StudentProfile" DROP COLUMN "birthDate";
