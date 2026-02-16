CREATE TABLE IF NOT EXISTS commands (
  command_id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json JSONB,
  status TEXT NOT NULL,
  result_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS command_logs (
  id SERIAL PRIMARY KEY,
  command_id UUID REFERENCES commands(command_id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
