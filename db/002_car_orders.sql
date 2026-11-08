BEGIN;

CREATE TABLE IF NOT EXISTS car_orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  model_id bigint NOT NULL REFERENCES vehicle_models(id),
  name varchar(80) NOT NULL CHECK (length(trim(name)) > 0),
  phone varchar(32) NOT NULL CHECK (phone ~ '^\+?[0-9[:space:]().-]+$' AND length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 10 AND 15),
  city varchar(80) NOT NULL CHECK (length(trim(city)) > 0),
  budget integer CHECK (budget BETWEEN 100000 AND 100000000),
  message varchar(2000) NOT NULL DEFAULT '',
  consent_at timestamptz NOT NULL DEFAULT now(),
  status varchar(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS car_orders_user_idx ON car_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS car_orders_status_idx ON car_orders(status, created_at DESC);

COMMIT;
