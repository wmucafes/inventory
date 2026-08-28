ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
