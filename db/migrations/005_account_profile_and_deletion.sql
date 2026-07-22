-- ---------------------------------------------------------------------------
-- 005 account profile + admin-approved deletion
--
-- Additive, non-destructive. Two parts:
--
--  1. app_users.profile — a jsonb bag for the extra self-service account fields
--     shown on the /account page (year of birth, education, spoken language,
--     social links, site preferences). Keeping them in one jsonb column avoids a
--     column-per-field spread and lets the account page evolve without further
--     migrations. Country/gender stay as their own columns (migration 004).
--
--  2. app_users.deactivated_at + account_deletion_requests — a learner can
--     REQUEST account deletion; the request is queued for an administrator, who
--     approves or rejects it. On approval the account is deactivated
--     (deactivated_at set) rather than hard-deleted, so certificates and audit
--     history referenced by other tables stay intact.
--
-- Existing rows are unaffected (profile defaults to '{}').
-- ---------------------------------------------------------------------------

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  reason       text,
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note   text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES app_users(id)
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status
  ON account_deletion_requests(status);

-- At most one open (pending) deletion request per user; resolved requests stay
-- as history and don't block a future request.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_deletion_per_user
  ON account_deletion_requests(user_id) WHERE status = 'pending';
