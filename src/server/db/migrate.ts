import { getPool } from "../db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_spent BIGINT NOT NULL DEFAULT 0 CHECK (tokens_spent >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_tracking_started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_day DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_messages INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_accounts_one_primary_user
  ON oauth_accounts(user_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS oauth_profiles (
  oauth_account_id UUID PRIMARY KEY REFERENCES oauth_accounts(id) ON DELETE CASCADE,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  activity JSONB,
  citations JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

CREATE TABLE IF NOT EXISTS degree_plans (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pulse_rounds (
  id SERIAL PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pulse_questions (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES pulse_rounds(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (round_id, position)
);

CREATE TABLE IF NOT EXISTS pulse_votes (
  question_id INTEGER NOT NULL REFERENCES pulse_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  agree BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_votes_user ON pulse_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_pulse_questions_round ON pulse_questions(round_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pulse_rounds_one_active ON pulse_rounds(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS schedules (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS building_favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  building_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, building_code)
);

CREATE INDEX IF NOT EXISTS idx_building_favorites_recent
  ON building_favorites(user_id, created_at DESC);

-- Schedule sharer: one opaque person blob per user; groups keyed by the
-- 6-char base62 code that appears in share links.
CREATE TABLE IF NOT EXISTS sharer_schedules (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  person JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sharer_groups (
  code CHAR(6) PRIMARY KEY CHECK (code ~ '^[0-9A-Za-z]{6}$'),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sharer_group_members (
  group_code CHAR(6) NOT NULL REFERENCES sharer_groups(code) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_code, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sharer_group_members_user ON sharer_group_members(user_id);
`;

// Reshapes pre-existing installs onto the current message columns: the legacy
// `interstitial` column becomes `activity`, and the redundant `tool_calls`
// column is dropped. Runs after SCHEMA so a fresh install already has `activity`.
const MIGRATE_LEGACY = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'interstitial'
  ) THEN
    ALTER TABLE messages RENAME COLUMN interstitial TO activity;
  END IF;
  ALTER TABLE messages DROP COLUMN IF EXISTS tool_calls;
END $$;
`;

const MIGRATE_OAUTH_IDENTITIES = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'google_sub'
  ) THEN
    INSERT INTO oauth_accounts (user_id, provider, provider_subject, is_primary)
    SELECT id, 'google', google_sub, true FROM users WHERE google_sub IS NOT NULL
    ON CONFLICT (provider, provider_subject) DO NOTHING;

    INSERT INTO oauth_profiles (oauth_account_id, email, email_verified, display_name)
    SELECT oa.id, u.email, u.email IS NOT NULL, u.display_name
    FROM oauth_accounts oa
    JOIN users u ON u.google_sub = oa.provider_subject
    WHERE oa.provider = 'google'
    ON CONFLICT (oauth_account_id) DO NOTHING;

    ALTER TABLE users DROP COLUMN google_sub, DROP COLUMN email, DROP COLUMN display_name;
  END IF;
END $$;
`;

/** Applies schema and legacy migrations if needed. Idempotent. */
export async function migrate(): Promise<void> {
  await getPool().query(SCHEMA);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(MIGRATE_OAUTH_IDENTITIES);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await getPool().query(MIGRATE_LEGACY);
}
