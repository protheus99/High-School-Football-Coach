# Game events (Google Analytics)

The game sends named events to Google Analytics (property `G-FE5ZDP3K2T`) so we can see how it's played and where
players stop. They're sent only for players who chose "Allow analytics" on the cookie banner, and only from the live
site (the dev server logs them to the browser console as `[analytics]` instead). No names, emails, player or prospect
ids, or typed text: only the game's own ids, bands, counts and results. Code: `src/services/analytics.ts` (`track`)
and `src/services/analyticsParams.ts` (the shared bands and bundles below), called from the store's actions and the
screens' buttons. Tests: `src/sim/tests/analyticsEvents.test.ts` and `src/services/analyticsParams.test.ts`.

## Shared parameters

- **Where the career is** (most in-game events): `season` (1 = the career's first), `week`, `phase`
  (SPRING_EVALUATION, SUMMER_CAMP, NON_DISTRICT, DISTRICT_PLAY, STATE_PLAYOFFS, POST_SEASON, OFF_SEASON).
- **Bands** instead of raw values, so reports keep a few values each: `rating_band` (`<50`, `50s`, `60s`, `70s`,
  `80+`), `interest_band` (`cold`, `lukewarm`, `warm`, `hot`), `gpa_band` (`<1.5`, `1.5-1.9`, `2.0-2.4`, `2.5+`),
  Coach Points (`<50`, `50-149`, `150-299`, `300+`), score (`down_9+`, `down_1-8`, `tied`, `up_1-8`, `up_9+`).
- **A prospect** (contacts, scout, visit, pitch, booster offers, drops): `position`, `source`, `pool` (DISTRICT,
  STATE, NATIONAL), `rating_band` and `potential` (his true ones), `scouted` (whether the coach has seen them),
  `rank_band` (`top10`, `11-25`, `26+` in the public ranking of his own list), `contacts` (before this one),
  `interest_band` and `interest_before` (before the action), `interest_after`, `commit_before` / `commit_after`
  (`us`, `rival`, `none`).
- **A roster player** (grade fixes, college recruiting, the game ball): `position`, `rating_band`, `starter`.
- **This week's game**: `rivalry`, `home`, `playoff`, `playoff_round`.
- **A speech**: `talk`, `family` (MOMENTUM, OFFENSE, BIG_PLAY, DEFENSE, CONTROL, DISCIPLINE, SPECIAL), `risky`,
  `pick` (1st, 2nd or 3rd of those offered), `offered`, `fit` (`built_for` the situation, or `general`).
- **The second string**: the lead that sends it in (`28`, `35`, `42`) or `never`.

## Events

| Event | When | Parameters |
| --- | --- | --- |
| `new_game` | A career (or quick game) starts | `mode` (career / quick), `scenario`, `state`, `length` or `difficulty`; `source` (team_page) and `variant` (page / direct) when it came through a team page |
| `menu_choice` | Continue / New Game / Load Game / Hall of Fame on the title menu | `choice`, `from_save` (Continue loaded the newest save) |
| `load_game` / `save_game` | A save is loaded / a manual save | where the career is |
| `save_deleted` | A save deleted on the Load screen | `saves` (how many there were) |
| `main_menu` | Settings › Main menu | where the career is: where players leave |
| `open_screen` | A tab or section opens | `screen`, `section` |
| `hub_card` | A button on a Hub card, or a headline | `card` (the card's id, or `headline`), `action` (the button, e.g. `review_grades`; a headline's category) |
| `week_advance` | The week advances | where the career is (the new week) |
| `advance_blocked` | The top bar's Advance with something in the way | `blocker` (DECISION, GRADES, GAME, LIVE) |
| `game_choice` | This week's game: Play, Sim, Resume, or Cancel on the "not played yet" sheet | `choice` (play / sim / resume / cancel), `from` (hub / warning) |
| `kickoff` | A live game kicks off | `offense` (scheme), `focus`, `second_string`, `talk_family` (or `none`), the game |
| `pregame_talk` / `halftime_talk` | A speech is given | the speech, the game; halftime adds `score_diff` |
| `game_plan_change` | The game plan changes mid-game | `offense`, `focus`, `second_string`, `when` (halftime / in_game), `quarter`, `score_diff` (band) |
| `leverage_call` | A big-moment call in a live game | `situation` (pat, fourth_down, red_zone_goal_to_go, two_minute_drill), `call` (pat_kick, two_point_try, inside_run, short_pass, deep_pass, field_goal, punt), `quarter`, `score_diff` (band); not on PATs: `down`, `to_go` (1-2, 3-5, 6+, goal), `field_zone` (own_half, opponent_half, red_zone) |
| `game_played` | The coach's game ends | `mode` (live / sim), `result` (win / loss / tie), `margin`, the game, `second_string`, `coach_out` (his coordinator coached it: a suspension); live games: `pregame_family` / `halftime_family` (or `none`), `coach_plays` and `coach_def_calls` (plays he called himself), `sim_ahead` (the furthest he simmed: none / quarter / half / end) |
| `rivalry_result` | The rivalry game is final | `won`, `trophy` (a named trophy game), `series` (leading / even / trailing before it), `meetings` |
| `playoffs_start` | The playoffs are drawn | `made` |
| `season_end` | The banquet opens | `wins`, `losses`, `state_champion`, `national_rank`, `national_title`, `made_playoffs`, `rivalry_won`, `reckonings` (the career's so far), `prestige_band` |
| `career_end_choice` | The career's end, or the YOU'RE FIRED screen | `choice` (extend / new_job / leave; fired: main_menu / hall_of_fame), `fired`, `misconduct`, `seasons` |
| `career_complete` | The contract's last season ends | `seasons` |
| `contract_extended` / `job_accepted` | A new contract | `years` |
| `practice_set` | Practice intensity changes | `intensity` |
| `depth_change` | A depth-chart move, or a player's string set on his card | `how` (move / string), `position`; moves: `direction`; strings: `tier_from`, `tier_to` |
| `dilemma_choice` | A dilemma (or a Billy Martin warning) is answered | `dilemma`, `tier`, `choice`, `severity`, `warning_started` (the call will come back), `thread_step` (1-3 on a warning) and `thread_action` (resolve / ignore / accept), `coach_points_delta`, `games_out` |
| `misconduct_reckoning` | A Billy Martin reckoning | `reckoning` (SEASON, NEXT_SEASON, BAN, FIRED), `severity`, `dilemma`, `reckonings` (this one included) |
| `grade_fix` | A grade fix booked or cancelled | `fix`, `action` (book / cancel), `cost`, the player, `gpa_band`, `eligible`, `weeks_to_report_card` |
| `report_card` | A report card comes out | `ineligible`, `starters_ineligible`, `fixes_used`, `saved` (players with a fix who came out eligible) |
| `press_answer` | A post-game press answer | `question`, `answer` |
| `game_ball` | Player of the Game | the player |
| `program_run` | A recruiting program runs | `program`, `cost`, `found`, `warmed`, `scouted`, `sport`, `interest_gain` (total), `committed` (prospects it made commit to the coach), `best_found` (band), `pool_size`, `points_left` (band) |
| `prospect_contact` | Text, email, call, visit, invite, wine & dine | `method`, `cost`, the prospect |
| `prospect_scout` / `prospect_visit` / `prospect_pitch` | Those prospect actions | `cost`, the prospect |
| `prospect_dropped` | A prospect dropped from the coach's prospects | the prospect |
| `my_list` | Added to or dropped from My List | `list` (prospects / college), `added`, `position`, `rating_band`; prospects: `rank_band` |
| `booster_offer` | A booster offer | `offer`, `stage` (the compliance stage), the prospect |
| `compliance_action` | Compliance | `action` (training, records_cleanup, self_report, say_nothing, defer), `stage` |
| `signing_day` | Prospect signing day | `signees`; from the coach's pipeline: `joined`, `jv`, `lost_to_rivals`, `not_playing`, `left_area`; `best_signee` (band) |
| `college_recruit` | Film, call or camp for a senior | `action`, `cost`, the player, `exposure` |
| `coach_hired` / `coach_released` | Staff changes | `role`, `grade`, `currency`, `price`, `years` |
| `staff_settled` | The off-season staff window is confirmed | `kept`, `let_go`, `cp`, `ducats` |
| `talent_unlocked` | A coach talent | `talent`, `cost` |
| `view_item_list` | The ducat store opens | `item_list_name` (ducat_packs), `signed_in`, `items` |
| `begin_checkout` | Off to Stripe for a ducat pack | `currency`, `value`, `pack`, `items` |
| `purchase` | A ducat pack paid | `transaction_id`, `currency`, `value`, `pack`, `ducats`, `items` |
| `spend_virtual_currency` | Ducats paid for coaches | `virtual_currency_name` (ducats), `value`, `item_name` (coach_hire / staff_renewal), `coaches` |
| `sign_in_start` | Google, Facebook, or an email link sent | `method`, `marketing` (the game-news box) |
| `login` / `login_failed` | Back from a sign-in | `method` (the account's sign-in, or `multiple`) / `result` (failed, expired, unavailable) |
| `logout` / `account_deleted` | Account | — |
| `title_team_link` | A school in the title screen's team page line is tapped | `state`, `school` (the page's slug) |
| `team_page_view` / `team_page_click` | A team page opens / its "Coach [team] now" button is tapped | `state`, `school` (the page's slug), `scenario`, `flow` |
| `start_page_view` / `start_page_click` | The team's "what to expect" page opens / "Let's go" is tapped | the same |

`items` is GA4's standard list (`item_id` = the pack, `item_name`, `price`, `quantity`), so the Monetization reports
fill in. Every event stays well under GA4's 25 parameters.

**Not tracked on purpose:** viewing-only buttons (filters, sort and scope chips, Show more, Back to top, the play log,
the box score, Close / Cancel / Back; opening the screen is counted), anything typed (the coach's name, searches,
emails), the cookie banner's own answer (there's no consent yet), the volume slider, music settings, and opening a
player card or a team profile.

**Team pages** (footballcoachgame.com/texas/duncanville/ and its start/ page, written by `scripts/team-pages/build.mjs`)
send their events from `public/team-pages/team.js`, with the same cookie question and consent as the game. `flow` is
the test version: `page` (the button opens the start page) or `direct` (straight to New Game), picked at random on the
first visit and kept in the browser (`?flow=page` or `?flow=direct` shows one on purpose). The game's `new_game`
carries `source` and `variant`, so a funnel can run from `team_page_view` to a career started, per version.

## In Google Analytics

Event counts show up on their own (Reports, Engagement, Events; Realtime within a minute). A parameter shows up in
reports only once it's registered under Admin › Custom definitions (scope: Event, the parameter name as above), and
only from that day on. Until then it's still collected (DebugView, BigQuery). `purchase` is a key event
automatically; `login`, `view_item_list`, `begin_checkout`, `purchase` and `spend_virtual_currency` are GA4's own
events, and their standard parameters need no registering.

**Custom dimensions** (50 allowed), in order:

1. `phase`, `method`, `program`, `position`, `rating_band`, `interest_band`, `commit_after`
2. `dilemma`, `severity`, `tier`, `thread_step`, `thread_action`, `reckoning`
3. `talk`, `family`, `fit`, `rivalry`, `result`
4. `blocker`, `fix`, `gpa_band`, `pool`, `source`, `rank_band`, `pack`
5. `offense`, `focus`, `call`, `situation`, `choice`, `sim_ahead`, `card`, `from`

**Custom metrics** (50 allowed), for averages and sums:

1. `interest_before`, `interest_after`, `cost`
2. `interest_gain`, `committed`, `lost_to_rivals`, `margin`
3. `ineligible`, `starters_ineligible`, `saved`

**Explorations** these make possible:

1. **Contact value:** Free form on `prospect_contact`, rows `method`, columns `interest_band`, values the average of
   `interest_after` and `interest_before`: which contacts pay off, and where they're wasted.
2. **Commitment funnel:** `prospect_contact` with `commit_before` = none, by `commit_after` and `rating_band`.
3. **The cheating path:** Path exploration from `dilemma_choice` (tier RISKY or CORRUPT) to `dilemma_choice`
   (thread_step 1) to `misconduct_reckoning`, split by `severity` and `thread_action`.
4. **Speeches that win:** `game_played` (mode live), rows `pregame_family`, values the share of `result` = win; the
   same by `halftime_family` with `margin`.
5. **Where careers stall:** `advance_blocked` by `blocker` and `phase`, next to `week_advance` and `main_menu` by week.
   Program value: `program_run` by `program`, the sum of `committed` over the sum of `cost`.
