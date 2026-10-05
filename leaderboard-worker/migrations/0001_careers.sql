-- One row per career: its latest totals. The owner's token is stored only as a SHA-256 hash.
CREATE TABLE careers (
  career_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  coach_name TEXT NOT NULL,
  scenario TEXT NOT NULL,
  state TEXT NOT NULL,
  starting_school TEXT NOT NULL,
  starting_program TEXT NOT NULL,
  length INTEGER NOT NULL,
  seasons INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  playoff_wins INTEGER NOT NULL,
  titles INTEGER NOT NULL,
  college_signees INTEGER NOT NULL,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- A program's board for one career length, and the board across every program
CREATE INDEX careers_by_program ON careers (state, starting_school, length, points DESC);
CREATE INDEX careers_by_length ON careers (length, points DESC);
