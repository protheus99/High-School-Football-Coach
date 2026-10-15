-- A game counts once it kicks off: the player's played games (in progress or final), so loading a save on another
-- device can't replay one. A final is permanent; a game in progress is replaced only by a newer state or its final.
CREATE TABLE played_games (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_key TEXT NOT NULL,    -- career key | season | week | opponent (sim/gameLock.ts in the game)
  career_key TEXT NOT NULL,
  status TEXT NOT NULL,      -- 'LIVE' or 'FINAL'
  record TEXT NOT NULL,      -- the game as the game stores it (scores, clock, players' lines), as JSON
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_key)
);
CREATE INDEX played_games_career ON played_games (user_id, career_key);
