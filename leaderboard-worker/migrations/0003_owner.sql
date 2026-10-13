-- Hall of Fame (1.14): every career belongs to a signed-in player (the sign-in server's user id). Careers posted
-- before sign-in was required have none until their owner posts them again with their token.
ALTER TABLE careers ADD COLUMN user_id TEXT;
CREATE INDEX careers_user ON careers(user_id, created_at);
