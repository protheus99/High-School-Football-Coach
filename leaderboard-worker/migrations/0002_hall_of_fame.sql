-- Hall of Fame (1.8): national titles, and the program's prestige when the contract began (its score bonus).
-- Careers stored before this get no national titles and prestige 99 (no bonus), which matches their points.
ALTER TABLE careers ADD COLUMN national_titles INTEGER NOT NULL DEFAULT 0;
ALTER TABLE careers ADD COLUMN starting_prestige INTEGER NOT NULL DEFAULT 99;
