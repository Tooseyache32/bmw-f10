BEGIN;
CREATE TABLE IF NOT EXISTS users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  name varchar(80) NOT NULL,
  password_hash text NOT NULL,
  role varchar(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash char(64) PRIMARY KEY,
  user_id bigint REFERENCES users(id) ON DELETE CASCADE,
  csrf_token varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS vehicle_models (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug varchar(20) NOT NULL UNIQUE,
  name varchar(80) NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  scope text NOT NULL,
  consumption_scope text NOT NULL,
  release_url text NOT NULL,
  source_url text NOT NULL
);
CREATE TABLE IF NOT EXISTS model_specs (
  model_id bigint PRIMARY KEY REFERENCES vehicle_models(id) ON DELETE CASCADE,
  fuel varchar(30) NOT NULL,
  cylinders smallint NOT NULL CHECK (cylinders > 0),
  displacement integer NOT NULL CHECK (displacement > 0),
  power integer NOT NULL CHECK (power > 0),
  kw integer NOT NULL CHECK (kw > 0),
  torque integer NOT NULL CHECK (torque > 0),
  acceleration numeric(4,1) NOT NULL CHECK (acceleration > 0),
  consumption numeric(4,1) NOT NULL CHECK (consumption > 0),
  speed integer NOT NULL CHECK (speed > 0),
  power_rpm varchar(40) NOT NULL,
  torque_rpm varchar(40) NOT NULL,
  engine_code varchar(40)
);
CREATE TABLE IF NOT EXISTS inquiry_topics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug varchar(40) NOT NULL UNIQUE,
  label varchar(80) NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS inquiries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  topic_id bigint NOT NULL REFERENCES inquiry_topics(id),
  model_id bigint REFERENCES vehicle_models(id),
  name varchar(80) NOT NULL CHECK (length(trim(name)) > 0),
  contact varchar(160) NOT NULL CHECK (length(trim(contact)) > 0),
  message varchar(2000) NOT NULL CHECK (length(trim(message)) > 0),
  consent_at timestamptz NOT NULL DEFAULT now(),
  status varchar(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'rejected')),
  public_token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiries_user_idx ON inquiries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_status_idx ON inquiries(status, created_at DESC);
CREATE TABLE IF NOT EXISTS inquiry_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inquiry_id bigint NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  admin_id bigint NOT NULL REFERENCES users(id),
  from_status varchar(20) NOT NULL CHECK (from_status IN ('new', 'in_progress', 'completed', 'rejected')),
  to_status varchar(20) NOT NULL CHECK (to_status IN ('new', 'in_progress', 'completed', 'rejected')),
  note varchar(500) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiry_events_inquiry_idx ON inquiry_events(inquiry_id, id);
CREATE TABLE IF NOT EXISTS favorites (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id bigint NOT NULL REFERENCES vehicle_models(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, model_id)
);
COMMIT;
