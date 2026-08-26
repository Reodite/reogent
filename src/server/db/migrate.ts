import { getPool } from "../db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
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

CREATE INDEX IF NOT EXISTS idx_pulse_questions_round ON pulse_questions(round_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pulse_rounds_one_active ON pulse_rounds(status) WHERE status = 'active';
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

/** Applies schema and legacy migrations if needed. Idempotent. */
export async function migrate(): Promise<void> {
  await getPool().query(SCHEMA);
  await getPool().query(MIGRATE_LEGACY);
}
