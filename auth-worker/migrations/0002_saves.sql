-- Cloud saves: the save files live in R2 (saves/<user id>/<slot id>, gzip, ~2 MB each); this table lists them.
CREATE TABLE saves (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,     -- the game's save slot ('current_save' is the autosave)
  summary TEXT NOT NULL,     -- the load screen's line for it (team, record, week), as JSON
  size INTEGER NOT NULL,     -- bytes stored in R2
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, slot_id)
);
