-- ---------------------------------------------------------------------------
-- 004 app_users profile fields
--
-- Additive, non-destructive: capture the learner's self-declared country of
-- residence and gender collected at registration. These originate from the
-- Clerk user's unsafeMetadata and are synced into app_users by syncAppUser
-- (on the first authenticated request and on the Clerk user.created webhook).
-- Both are nullable; existing rows are unaffected.
-- ---------------------------------------------------------------------------
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS gender text;
