-- Ducats (₾), the paid currency: every change to a player's balance is one row, and the balance is their sum.
-- Rows are only ever added, so every purchase, spend and refund stays on record.
CREATE TABLE ducat_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,     -- ducats added (positive) or taken (negative)
  kind TEXT NOT NULL,          -- 'purchase' | 'spend' | 'refund' | 'dispute' | 'dispute_won' | 'blocked' (a non-US card, refunded)
  ref TEXT NOT NULL UNIQUE,    -- what it's for, counted once: the Stripe checkout, the Stripe event, or the game's payment id
  payment_intent TEXT,         -- the Stripe payment (a purchase, and whatever reverses it)
  cents INTEGER,               -- what the player paid, before tax (purchases)
  detail TEXT,                 -- JSON: the pack bought, or the coaches paid for
  created_at INTEGER NOT NULL
);
CREATE INDEX ducat_ledger_user ON ducat_ledger(user_id);
CREATE INDEX ducat_ledger_payment ON ducat_ledger(payment_intent);
