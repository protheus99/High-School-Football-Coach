-- Player accounts for Football Coach High School Edition. Sign-in is optional: the game plays without one.
-- Secrets (session tokens, email links) are stored only as SHA-256 hashes.

-- One row per player. Email can be missing (a Facebook account without one).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0, -- 1 only when the player ticked "Send me game news"
  marketing_opt_in_at INTEGER,                 -- when they opted in (proof of consent)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- How a player signs in: Google, Facebook or an email link (several can point to one player).
CREATE TABLE identities (
  provider TEXT NOT NULL,      -- 'google' | 'facebook' | 'email'
  provider_id TEXT NOT NULL,   -- the provider's id for the player (the email address for 'email')
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_id)
);
CREATE INDEX identities_user ON identities(user_id);

-- Signed-in browsers (the cookie holds the token; only its hash is here).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Emailed sign-in links: single use, 15 minutes.
CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  marketing INTEGER NOT NULL DEFAULT 0,
  return_to TEXT NOT NULL DEFAULT '/',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX email_tokens_email ON email_tokens(email, created_at);

-- Google and Facebook sign-ins in progress: 10 minutes, tied to the browser that started them.
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT,
  marketing INTEGER NOT NULL DEFAULT 0,
  return_to TEXT NOT NULL DEFAULT '/',
  expires_at INTEGER NOT NULL
);

-- Facebook data deletion requests (Meta asks for a status link with a confirmation code).
CREATE TABLE deletions (
  confirmation_code TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);
