-- 003_identity_storage_portability.sql
-- Forward-only. Adds username support and case-insensitive, normalized identity
-- uniqueness to app_users. Migrations 001 and 002 are unchanged.
--
-- Email: trimmed + lowercased at write time (application) AND enforced here by a
-- CHECK so a non-normalized or empty email can never be stored. A case-insensitive
-- unique index guarantees no two users share an email regardless of case.
-- Username: nullable; NULL (never empty string) when absent; case-insensitive
-- unique among non-null values.

-- 1. Add the username column (nullable) FIRST so normalization can reference it.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username text;

-- 2. Normalize any existing local rows before adding the strict constraints.
UPDATE app_users
   SET email = lower(btrim(email))
 WHERE email IS NOT NULL
   AND email <> lower(btrim(email));

UPDATE app_users
   SET username = NULL
 WHERE username IS NOT NULL
   AND btrim(username) = '';

UPDATE app_users
   SET username = lower(btrim(username))
 WHERE username IS NOT NULL
   AND username <> lower(btrim(username));

-- 3. Enforce normalized, non-empty email (idempotent add).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'app_users'::regclass AND conname = 'chk_email_normalized'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT chk_email_normalized
      CHECK (email = lower(btrim(email)) AND email <> '');
  END IF;
END $$;

-- 4. Enforce normalized, non-empty username when present (idempotent add).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'app_users'::regclass AND conname = 'chk_username_normalized'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT chk_username_normalized
      CHECK (username IS NULL OR (username = lower(btrim(username)) AND char_length(username) >= 1));
  END IF;
END $$;

-- 5. Case-insensitive uniqueness for email (in addition to the existing
--    case-sensitive app_users_email_key from migration 002).
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_email_ci ON app_users (lower(email));

-- 6. Case-insensitive uniqueness for username among non-null values.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_username_ci
  ON app_users (lower(username)) WHERE username IS NOT NULL;
