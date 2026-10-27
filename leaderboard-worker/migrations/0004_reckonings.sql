-- Invalid playthroughs (1.19): how many of the career's shady dilemma calls came to light (a "reckoning"). A career
-- with any is listed apart from the ranked board. Careers stored before this have no record: 0, ranked as clean.
ALTER TABLE careers ADD COLUMN reckonings INTEGER NOT NULL DEFAULT 0;
