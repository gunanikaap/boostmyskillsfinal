-- 001_extensions.sql
-- UUID generation. pgcrypto provides gen_random_uuid() and is available on
-- AWS RDS PostgreSQL. All primary keys are UUID; all timestamps are timestamptz (UTC).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared trigger function to maintain updated_at on row updates.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
