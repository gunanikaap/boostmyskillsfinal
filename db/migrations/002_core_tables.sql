-- 002_core_tables.sql
-- The eleven frozen application tables. CHECK constraints are preferred over
-- native enums to keep later migration safe. All ids are UUID; timestamps UTC.

-- ---------------------------------------------------------------------------
-- 3.1 app_users — maps Clerk identity to application identity + authorization
-- ---------------------------------------------------------------------------
CREATE TABLE app_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE,
  email         text NOT NULL UNIQUE,
  first_name    text,
  last_name     text,
  role          text NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'admin')),
  external_ref  text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_app_users_updated_at BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.2 projects — organisation lives here; no separate organisations table
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 text NOT NULL UNIQUE,
  organisation_name    text NOT NULL,
  certificate_template jsonb NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.3 micro_credentials — stable catalogue identity
-- ---------------------------------------------------------------------------
CREATE TABLE micro_credentials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id),
  code         text NOT NULL UNIQUE,
  slug         text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  external_ref text UNIQUE,
  created_by   uuid REFERENCES app_users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  hidden_at    timestamptz,
  hidden_by    uuid REFERENCES app_users(id)
);
CREATE INDEX idx_micro_credentials_project ON micro_credentials(project_id);
CREATE INDEX idx_micro_credentials_status ON micro_credentials(status);
CREATE TRIGGER trg_micro_credentials_updated_at BEFORE UPDATE ON micro_credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.4 credential_versions — internal content-version integrity mechanism
-- ---------------------------------------------------------------------------
CREATE TABLE credential_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id      uuid NOT NULL REFERENCES micro_credentials(id),
  revision_number    integer NOT NULL CHECK (revision_number > 0),
  status             text NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  schema_version     integer NOT NULL,
  title              text NOT NULL,
  author_name        text NOT NULL,
  short_description  text,
  about_content      jsonb NOT NULL,
  banner_object_key  text,
  content_document   jsonb NOT NULL,
  grading_document   jsonb NOT NULL,
  certification_rule jsonb NOT NULL,
  source_metadata    jsonb NOT NULL,
  created_by         uuid REFERENCES app_users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  published_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_credential_revision UNIQUE (credential_id, revision_number),
  -- published/retired revisions must carry a published_at timestamp
  CONSTRAINT chk_published_at_present
    CHECK (status = 'draft' OR published_at IS NOT NULL)
);
-- At most one draft revision per credential
CREATE UNIQUE INDEX uq_one_draft_per_credential
  ON credential_versions (credential_id) WHERE status = 'draft';
-- At most one currently published revision per credential
CREATE UNIQUE INDEX uq_one_published_per_credential
  ON credential_versions (credential_id) WHERE status = 'published';
CREATE INDEX idx_credential_versions_credential ON credential_versions(credential_id);
CREATE TRIGGER trg_credential_versions_updated_at BEFORE UPDATE ON credential_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.6 micro_programmes
-- ---------------------------------------------------------------------------
CREATE TABLE micro_programmes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id),
  slug              text NOT NULL UNIQUE,
  title             text NOT NULL,
  short_description text,
  about_content     jsonb NOT NULL,
  banner_object_key text,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  external_ref      text UNIQUE,
  created_by        uuid REFERENCES app_users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  published_at      timestamptz,
  hidden_at         timestamptz
);
CREATE INDEX idx_micro_programmes_project ON micro_programmes(project_id);
CREATE TRIGGER trg_micro_programmes_updated_at BEFORE UPDATE ON micro_programmes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.7 programme_credentials — ordered credential membership of a programme
-- ---------------------------------------------------------------------------
CREATE TABLE programme_credentials (
  programme_id  uuid NOT NULL REFERENCES micro_programmes(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES micro_credentials(id),
  position      integer NOT NULL CHECK (position >= 0),
  is_required   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (programme_id, credential_id),
  CONSTRAINT uq_programme_position UNIQUE (programme_id, position)
    DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX idx_programme_credentials_credential ON programme_credentials(credential_id);

-- ---------------------------------------------------------------------------
-- 3.8 enrollments — programme OR credential enrolment in one table
-- ---------------------------------------------------------------------------
CREATE TABLE enrollments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES app_users(id),
  programme_id          uuid REFERENCES micro_programmes(id),
  credential_id         uuid REFERENCES micro_credentials(id),
  credential_version_id uuid REFERENCES credential_versions(id),
  status                text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'in_progress', 'completed', 'suspended', 'withdrawn')),
  enrolled_at           timestamptz NOT NULL DEFAULT now(),
  started_at            timestamptz,
  completed_at          timestamptz,
  last_accessed_at      timestamptz,
  final_percentage      numeric,
  passed                boolean,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ref          text UNIQUE,
  -- Exactly one of: programme enrolment OR credential enrolment.
  CONSTRAINT chk_enrolment_kind CHECK (
    (programme_id IS NOT NULL AND credential_id IS NULL AND credential_version_id IS NULL)
    OR
    (programme_id IS NULL AND credential_id IS NOT NULL AND credential_version_id IS NOT NULL)
  )
);
-- One programme enrolment per (user, programme)
CREATE UNIQUE INDEX uq_one_programme_enrolment
  ON enrollments (user_id, programme_id) WHERE programme_id IS NOT NULL;
-- One credential enrolment per (user, credential)
CREATE UNIQUE INDEX uq_one_credential_enrolment
  ON enrollments (user_id, credential_id) WHERE credential_id IS NOT NULL;
CREATE INDEX idx_enrollments_user ON enrollments(user_id);

-- Enforce credential_version_id belongs to credential_id (cross-row integrity).
CREATE OR REPLACE FUNCTION enforce_enrolment_version_match()
RETURNS trigger AS $$
BEGIN
  IF NEW.credential_id IS NOT NULL AND NEW.credential_version_id IS NOT NULL THEN
    PERFORM 1 FROM credential_versions cv
      WHERE cv.id = NEW.credential_version_id AND cv.credential_id = NEW.credential_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'credential_version_id % does not belong to credential_id %',
        NEW.credential_version_id, NEW.credential_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_enrolment_version_match
  BEFORE INSERT OR UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION enforce_enrolment_version_match();

-- ---------------------------------------------------------------------------
-- 3.9 unit_progress
-- ---------------------------------------------------------------------------
CREATE TABLE unit_progress (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  unit_id          text NOT NULL,
  status           text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  state            jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at       timestamptz,
  completed_at     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_unit_progress UNIQUE (enrollment_id, unit_id)
);
CREATE TRIGGER trg_unit_progress_updated_at BEFORE UPDATE ON unit_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.10 assessment_attempts
-- ---------------------------------------------------------------------------
CREATE TABLE assessment_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  unit_id          text NOT NULL,
  attempt_number   integer NOT NULL CHECK (attempt_number > 0),
  submitted_answers jsonb NOT NULL,
  score            numeric CHECK (score IS NULL OR score >= 0),
  maximum_score    numeric CHECK (maximum_score IS NULL OR maximum_score >= 0),
  percentage       numeric CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  passed           boolean,
  grading_snapshot jsonb NOT NULL,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_attempt UNIQUE (enrollment_id, unit_id, attempt_number),
  CONSTRAINT chk_score_within_max
    CHECK (score IS NULL OR maximum_score IS NULL OR score <= maximum_score)
);
CREATE INDEX idx_attempts_enrollment ON assessment_attempts(enrollment_id);

-- ---------------------------------------------------------------------------
-- 3.11 certificates
-- ---------------------------------------------------------------------------
CREATE TABLE certificates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_code    text NOT NULL UNIQUE,
  enrollment_id        uuid NOT NULL UNIQUE REFERENCES enrollments(id),
  status               text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked')),
  certificate_snapshot jsonb NOT NULL,
  pdf_object_key       text,
  issued_at            timestamptz NOT NULL DEFAULT now(),
  revoked_at           timestamptz,
  revocation_reason    text,
  external_ref         text UNIQUE
);

-- ---------------------------------------------------------------------------
-- 3.12 platform_settings — singleton (id must equal 1)
-- ---------------------------------------------------------------------------
CREATE TABLE platform_settings (
  id                  smallint PRIMARY KEY CHECK (id = 1),
  maintenance_mode    boolean NOT NULL DEFAULT false,
  maintenance_message text NOT NULL DEFAULT
    'BoostMySkills is temporarily unavailable while maintenance is in progress.',
  updated_by          uuid REFERENCES app_users(id),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Prevent deletion of the singleton row.
CREATE OR REPLACE FUNCTION prevent_platform_settings_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'platform_settings is a singleton and cannot be deleted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_prevent_platform_settings_delete
  BEFORE DELETE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION prevent_platform_settings_delete();

-- Seed the singleton row (idempotent).
INSERT INTO platform_settings (id, maintenance_mode)
  VALUES (1, false)
  ON CONFLICT (id) DO NOTHING;
