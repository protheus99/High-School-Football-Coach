# Game events (Google Analytics)

The game sends named events to Google Analytics (property `G-FE5ZDP3K2T`) so we can see how it's played and where
players stop. They're sent only for players who chose "Allow analytics" on the cookie banner, and only from the live
site (the dev server logs them to the browser console as `[analytics]` instead). No names, emails or typed text: only
the game's own ids, counts and results. Code: `src/services/analytics.ts` (`track`), called from the store's actions.

Most events carry `season` (1 = the career's first) and `week`.

| Event | When | Parameters |
| --- | --- | --- |
| `new_game` | A career (or quick game) starts | `mode` (career / quick), `scenario`, `state`, `length` or `difficulty`; `source` (team_page) and `variant` (page / direct) when it came through a team page |
| `load_game` | A save is loaded | `season`, `week` |
| `save_game` | A manual save | `season`, `week` |
| `open_screen` | A tab or section opens | `screen`, `section` |
| `week_advance` | Advance Week | `season`, `week` (the new one), `phase` |
| `game_played` | The coach's game ends | `mode` (live / sim), `result` (win / loss / tie), `margin`, `playoff` |
| `halftime_talk` | A halftime talk is picked | `talk`, `score_diff` (the coach's side) |
| `playoffs_start` | The bracket is drawn | `made` |
| `season_end` | The banquet opens | `wins`, `losses`, `state_champion`, `national_rank`, `national_title` |
| `career_complete` | The contract's last season ends | `seasons` |
| `contract_extended` / `job_accepted` | A new contract | `years` |
| `practice_set` | Practice intensity changes | `intensity` |
| `dilemma_choice` | A dilemma is answered | `dilemma`, `tier` |
| `press_answer` | A post-game press answer | `question`, `answer` |
| `game_ball` | Player of the Game | `position` |
| `program_run` | A recruiting program runs | `program`, `cost`, `found` |
| `prospect_contact` | Text, email, call... | `method`, `cost`, `pool` |
| `prospect_scout` / `prospect_visit` / `prospect_pitch` | Those prospect actions | — |
| `my_list` | A prospect added to or dropped from My List | `list`, `added` |
| `booster_offer` | A booster offer | `offer` |
| `compliance_action` | Training, records cleanup, self-report | `action`, `stage` |
| `signing_day` | Prospect signing day | `signees` |
| `college_recruit` | Film, call or camp for a senior | `action`, `cost` |
| `coach_hired` / `coach_released` | Staff changes | `role`, `grade`, `currency`, `price`, `years` |
| `talent_unlocked` | A coach talent | `talent`, `cost` |
| `begin_checkout` | Off to Stripe for a ducat pack | `currency`, `value`, `pack` |
| `purchase` | A ducat pack paid | `transaction_id`, `currency`, `value`, `pack`, `ducats` |
| `title_team_link` | A school in the title screen's team page line is tapped | `state`, `school` (the page's slug) |
| `team_page_view` / `team_page_click` | A team page opens / its "Coach [team] now" button is tapped | `state`, `school` (the page's slug), `scenario`, `flow` |
| `start_page_view` / `start_page_click` | The team's "what to expect" page opens / "Let's go" is tapped | the same |

**Team pages** (footballcoachgame.com/texas/duncanville/ and its start/ page, written by `scripts/team-pages/build.mjs`)
send their events from `public/team-pages/team.js`, with the same cookie question and consent as the game. `flow` is
the test version: `page` (the button opens the start page) or `direct` (straight to New Game), picked at random on the
first visit and kept in the browser (`?flow=page` or `?flow=direct` shows one on purpose). The game's `new_game`
carries `source` and `variant`, so a funnel can run from `team_page_view` to a career started, per version.

**In Google Analytics:** event counts show up on their own (Reports, Engagement, Events; Realtime within a minute).
To break reports down by a parameter (for example `result` or `program`), register it once under Admin, Custom
definitions, Create custom dimension (scope: Event, the parameter name as above). `purchase` is a key event
automatically.
