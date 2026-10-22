CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  discord_username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS minecraft_accounts (
  edition TEXT NOT NULL CHECK (edition IN ('JAVA', 'BEDROCK')),
  minecraft_uuid TEXT NOT NULL,
  username TEXT NOT NULL,
  normalized_username TEXT NOT NULL,
  current_rank TEXT NOT NULL DEFAULT 'Member',
  kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  deaths INTEGER NOT NULL DEFAULT 0 CHECK (deaths >= 0),
  playtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (playtime_minutes >= 0),
  balance REAL CHECK (balance IS NULL OR balance >= 0),
  coins REAL CHECK (coins IS NULL OR coins >= 0),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (edition, minecraft_uuid)
);
CREATE INDEX IF NOT EXISTS minecraft_accounts_username_idx ON minecraft_accounts(normalized_username);

CREATE TABLE IF NOT EXISTS account_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL REFERENCES users(discord_id),
  edition TEXT NOT NULL,
  minecraft_uuid TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  unlinked_at INTEGER,
  source TEXT NOT NULL DEFAULT 'minecraft-command',
  FOREIGN KEY (edition, minecraft_uuid) REFERENCES minecraft_accounts(edition, minecraft_uuid)
);
CREATE UNIQUE INDEX IF NOT EXISTS account_links_active_discord_idx ON account_links(discord_id) WHERE unlinked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_links_active_minecraft_idx ON account_links(edition, minecraft_uuid) WHERE unlinked_at IS NULL;
CREATE INDEX IF NOT EXISTS account_links_history_idx ON account_links(discord_id, linked_at DESC);

CREATE TABLE IF NOT EXISTS link_verifications (
  code_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS link_verifications_expiry_idx ON link_verifications(expires_at);

CREATE TABLE IF NOT EXISTS player_sessions (
  token_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS player_sessions_expiry_idx ON player_sessions(expires_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
