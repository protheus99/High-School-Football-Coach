# Backlog

Work that's decided but parked. Newest first.

## Notes sent 2026-10-14 (from 2026-10-13's sessions): all done

Captured as sent, then built in v1.17.1 through v1.18.3. Every item below is done; each says where it shipped.

- **New Students: needs, interest marks, where he's from, what he wants (done 2026-10-14, v1.17).** Needs rows
  are links to Students at that position; Students shows the needs of the group in view (top needs on All) in
  place of the explanation (now behind "How recruiting works"); the signing day is one short line. "in pipeline"
  became "prospects". The interest bar has marks at 50 (scouted) and 80 (commits), explained once in a legend.
  Each card has a where-he's-from tag (your district / zoned elsewhere: harder / elsewhere in the state / out of
  state: hardest) and his top two wants with how the program measures up. Wants vary more (new starting
  weights), and they drive moves for State and National prospects: a kid who wants to win moves more readily for
  a winner, a homebody rarely moves. Winning now counts last season's state title and final national rank
  (`Team.lastSeason`, set at the banquet). Measured over 18 state seasons (contacts only): newcomers per class 13.8
  → 14.2, outside-district joins 0.3 → 0.3; class rating 49.5 → 48.2 and champions 16 → 14 of 18 (small sample,
  to be re-measured with the programs).
- **Programs all year, with real weight (decided 2026-10-14; done, v1.17).** Off-season-only programs leave
  no time to use them. Programs become the main way to build the district pipeline (quantity and quality); State
  and National add specific players. Open all year except the post season, each with a cooldown; Coach Points
  are the limit. Pipeline cap 40 → 60. A standing Hub card every week: "Which programs should we run this week,
  Coach?" (not counted as a task). Programs (draft prices, to be measured):
  - Find new prospects (every 4 weeks): Youth Football Clinic (all positions, 2–3 new, every middle schooler +1
    rating, ₡60), 7-on-7 League Night (QB/RB/WR/TE, 1–2 new, ₡50), Lockdown League (LB/CB/S, 1–2 new, ₡50).
  - Interest for everyone: Community Tryout Day (+5 to all district prospects, 1–2 walk-ons, ₡40, every 4
    weeks), Family Night Cookout (+10 to all, ₡80, every 8 weeks).
  - Position programs (₡40, every 3 weeks; +6–10 interest, +1 rating up to +3 a season each, sometimes a new
    prospect): Quarterback Academy (QB), Ball Carrier Clinic (RB), Route Runners School (WR/TE), The Trenches
    (OT/OG/C), War Zone (DE/DT), Linebacker U (LB), The Nickel (CB/S), Specialist Showcase (K/P).
    They replace Big Man Camp and QB & Skills Academy.
  - Scouting: Speed & Strength Combine kept (₡25, every 3 weeks).
  Measure before shipping: class strength and title turnover over many seasons, all programs vs none (rival
  programs don't run programs). Mockup: https://claude.ai/artifact/W3KSTS8hqwX34qNxJUqkdB
  **Built** with Family Night at ₡120 and Tryout Day at ₡60 (approved), cooldowns per program, the pipeline cap at
  60 and a +3 cap on program rating boosts per prospect. **Measured** (60 state seasons each, six programs, a coach
  calling his warmest prospects weekly, with or without running every program he can afford): newcomers per class
  13.7 → 15.2; the coach's state titles 1 → 6 in 60 (all six in one run; none in the other); different champions
  33 → 31 in 60. More depth, no lock-in: Coach Points limit it (a full program calendar costs more than a year's income).
- **Title screen: the three features look like buttons (added 2026-10-14, quick).** "🏈 Call the plays",
  "🎓 Recruit and develop" and "🏆 Chase state titles" under the pitch look tappable but aren't. Redesign them so
  they read as a feature list, not buttons (`src/components/SplashScreen.tsx`, the list near line 171). Mockup
  first.
  **Done 2026-10-14 (option A, icon strip):** three columns, a big icon over a small uppercase label, thin
  dividers, no box or shadow (`.title-features` in `src/styles/index.css`).
- **Title screen (home page):** remove the tagline "Every dynasty starts on a Friday night."
  **Done (v1.17.2):** gone from the screen and from the page text search engines read.
- **Title screen (home page):** add a link to the Hall of Fame.
  **Done (v1.17.2):** a Hall of Fame button opens the board, view only, with or without a game loaded.
- **Hall of Fame board:** add each career's win-loss record to its entry. Mockup shown 2026-10-14 (three layouts;
  recommended: its own "W-L" column next to the points). The server already stores and returns wins and losses
  (wins include playoff wins), so this is a display change only.
  **Done (v1.17.2):** each row shows the coach, the school with its state, then the record and win %.
- **Prospects › Students: the "Last year's pipeline" summary needs a redesign.** New prospects joining the team is
  an extremely important moment, and today it's a plain green box of text: the counts (joined, chose not to play,
  moved away, enrolled elsewhere), the newcomers as a comma list ("Name (POS, rating)") and "Lost to rivals" as a
  long run-on list. Make it feel like a signing-day moment. Code: `src/components/FeedersScoutingView.tsx`, the
  `lastFeederResults` block near the top of the Students section. Mockup first.
  **Done 2026-10-14 (option A, v1.17):** `SigningDayBoard`: four count tiles, the newcomers as cards (rating,
  potential, tap for the player card, the best three then "+ N more"), and losses grouped by rival school with the
  potential the coach had seen (`FeederOutcome.potential`, kept from this signing day on).
- **Hub: the "Prospect signing day: N newcomers joined" card has no link to the signing review.** It only offers
  "Roster". Add a link to the review (the "Last year's pipeline" summary above, once redesigned). Code:
  `src/components/WeeklyAgenda.tsx`, the `signing-results` card.
  **Done (v1.17.2):** the card has a single "Review Signings ›" button (Prospects › Students, the signing day board).
- **Roster: mark the newcomers.** After signing day there's no way to tell who's new on the roster except by
  spotting the freshmen by name (raised 2026-10-14 with the "Review Signings" button). Mark the new players, for
  example a "NEW" chip for their first season, or a "New this year" filter.
  **Done 2026-10-14 (v1.17):** players carry the year they joined (`joinedYear`, set at signing day and when a
  transfer joins); this season's newcomers get a green NEW tag after the class tag on the depth chart ("A Fr NEW")
  and next to the name on the full roster, which also has a "New (n)" filter. Players on rosters before this update
  aren't tagged.
- **Hub: the senior college card should be about any college offer, not just D-I.** Today it reads "N seniors
  without a D-I offer". D-I is good, but the goal is every senior signed with any school: count and name seniors
  with no offer at all (and not yet committed). Code: `src/components/WeeklyAgenda.tsx`, `collegeCard()`
  (`seniorsWithoutD1`).
  **Done (v1.17.2):** "N seniors without a college offer" counts seniors with no offer at all, and says so once all
  have one.
- **Bug: Hub "Home visits for 3" didn't seem to work** (the "Prospect signing day: last chance to win prospects
  over" card). In the user's screenshot, the flash says "Visited 3 prospects before Prospect signing day", but the card
  still offers "Home visits for 3 (₡60)". Reproduce first. Leads from a first read of the code
  (`src/components/WeeklyAgenda.tsx` `visitsCard`, store `contactFeederProspect`):
  - the flash always claims all the visits, but `contactFeederProspect` skips a prospect silently (already visited
    this week, Coach Points short partway through, or restricted while on probation);
  - the card picks the top 3 prospects at 30–75 interest, so after a visit it can refill with the next ones, or keep
    ones already visited (the label still says "for 3" while only the unvisited ones are charged). It should say
    clearly what happened and drop or mark the ones already visited.
  **Done (v1.17.1):** the home-visits button is gone; the signing-week card links to Prospects instead.
- **Dilemma timing: the Hazing Allegation (about playing time) showed up before any games.** The user saw it in pre
  season week 3 (the summer, called the off season in their note). Its choices are about games: "WR Evans out 2
  wk", "The ringleader plays", "Promise their son more playing time". In weeks with no games, a suspension or a
  playing-time promise means nothing. Code: `src/sim/dilemmaTemplates.ts`, `HAZING_REPORT` (allowed in weeks 1–11).
  Fix the timing, or make the suspension count against the first real games. Then review every dilemma that
  sidelines a player, makes him eligible or promises playing time (`sidelinePlayer`, `playerAvailabilityOverride`)
  for the same problem.
  **Done (v1.17.1):** dilemmas about games, playing time or suspensions only appear from training camp through the
  playoffs, and a suspension counts games, not weeks ("out 2 games"); medical holds still heal with time.
- **Recruiting shortlist.** The prospect lists are long (Prospects › Students, by District, Region or State), so
  it's hard to find a player again to keep recruiting him. Add a way to put a prospect on your shortlist (a star or
  "Shortlist" button on his card) and a quick way back to them. A natural fit is a "Shortlist" choice in the List
  menu, next to All and Top 10 (`src/components/FeedersScoutingView.tsx`, the list filters around `TOP10`). Save
  the shortlist with the game. Consider the same for college recruiting (seniors and juniors). Mockup first.
  **Done 2026-10-14 (option A, v1.17):** a "+ Add to List" button on every prospect card ("✓ On List" once added) and
  "My List (n)" in the List menu, showing the listed prospects from every pool whatever the scope; saved with the
  game. The card's ✕ now says "Drop" (from your prospects) so it isn't confused with the list. College recruiting:
  **done (v1.18.1):** a "My List" chip and "+ Add to List" on each recruit in Team › College.
- **Banquet: mark the graduating seniors who signed with a college.** The "Graduating Senior Class" list
  (`src/components/OffSeasonBanquetView.tsx`) is every senior with an OVR, so the ones going on to college don't
  stand out. Add a symbol next to them, maybe with the school. They're all graduates, so **no graduation cap**.
  Prepare several symbol options in the mockup, for example: ✍️ signed, 📜 letter of intent, 🏛️ college,
  ⭐ signee, a small "SIGNED" chip, or a chip in the college's tier color (D-I, D-II, NAIA). The data is there:
  `recruiting.isNationalLetterOfIntentSigned`, `committedCollege` and `signedTier`.
  **Done (v1.17.2):** seniors who signed come first, with the college's level and school; the signing line says
  each signee is a Hall of Fame point and Division I signees also build alumni prestige.
- **Review how players are ranked for awards and All-State** (the season wrap-up's "Major awards", "All-State",
  and lines like "66th of LBs"). In the user's screenshot, the MVP (RB Tyrell Robinson, IMG Academy 11-2: 1,556
  rush yds, 16 TD) ranks above the Offensive Player of the Year (RB Grant Barnes, Mandarin 12-1: 1,599 rush yds,
  19 TD), who has the better line. How it works today (`src/sim/awardsEngine.ts`):
  - `seasonImpact()` gives each position its own formula. QB: pass yds/25 + pass TD×4 − INT×3 + rush yds/10 + rush
    TD×6. RB: rush and receiving yds/10 + TD×6 − fumbles×3. WR/TE: receiving yds/10 + TD×6 + catches×0.5. K: field
    goals. Defense: tackles + TFL×2 + sacks×4 + INT×6. Linemen and punters get OVR + team wins×0.5, not stats.
  - The big awards multiply that by 1 + team wins/40, so a winning team's player gets a boost.
  - The line shown on the card (`statHeadline`) leaves out parts of the score (an RB's receiving yards, for
    example), so the order can look wrong even when the math is consistent.
  Check whether the formulas are fair across positions, whether the win boost is the right size, and whether
  the card should show what the ranking used.
  **Done 2026-10-14 (option A, plus balance so a truly exceptional QB or WR can win):** the card shows everything
  the score counted ("1,556 rush · 312 rec · 18 TD"; QBs add rushing, receivers add catches, defenders add TFL).
  The big awards scale each position (`AWARD_WEIGHT` in `src/sim/awardsEngine.ts`). Measured over 120 simulated
  state seasons (retuned the same day: the user wanted RBs closer to 40%): Mr. Football went from 92% RB to about
  38% RB, 33% QB, 15% WR and 13% defenders; Defensive Player of the Year from 96% LB to about 48% LB, 20% DE, 20% CB
  and 12% S.
- **National rankings: an unbeaten state champion wasn't ranked.** St. Thomas Aquinas (Florida 6A) finished 13-0
  and never made the national poll. In the state final listing it showed as plain "St. Thomas Aquinas (9-0)" next
  to "#26 Apopka (8-2)". Find out why. The poll is a computer ranking solved from every result, with schedule
  strength and margins (`src/sim/nationalRankingEngine.ts` → `computeRatings` in `src/sim/computerRankings.ts`),
  top 25 plus 26–35 "receiving votes". Suspects: how much an unbeaten record weighs against schedule strength,
  how Florida's teams connect to the rest of the national pool (few games between states can strand a whole
  state), and whether results from simulated states count the same. Also check which rank the score list shows
  (national or state) and that it's labeled.
  **Measured 2026-10-14:** the ranking counts this season only (a preseason estimate from the roster fades out
  completely by the end of the regular season), so a team that was never strong isn't held back by past years.
  The problem is the state's network: a champion whose state rates low can't climb past it (in three simulated
  worlds, unbeaten champions from Florida ranked #17 and #30, New Jersey #41, Pennsylvania #57, Maryland #137).
  Rank labels: only the national rank (Top 25) is ever shown in front of a team name, which is what's wanted.
  Option B measured (the final poll mixes a résumé score with the computer rating; résumé = win percentage,
  unbeaten, state title, quality wins): with 30% résumé, champions' median rank goes from #20 to #7 and 32 of 39
  make the top 25 (21 today); with 40%, 36 of 39, the worst unbeaten champion #12. Two-loss teams in the top 25
  drop from 40 to 31 (30%) or 27 (40%). Waiting on the user's call (30% or 40%, final poll only or every week).
  **User 2026-10-14:** a 15-0 team from New Jersey that beat strong out-of-state teams should have a chance;
  teams outside Texas, Georgia and California do get ranked and win (Bishop Gorman 2023, Bixby 2025, John Curtis
  2012). **Found:** the real cause was a team's own state, not its record. A dominant team in a big, uneven state
  (Florida) plays many very weak teams; a blowout only counts up to the margin cap, so each of those wins pulled
  its rating down (Florida's top teams sat about 4.5 times lower than their strength; a #2-strength team at #28).
  **Done (v1.17):** two rules in `computeRatings`: a win never lowers a team's rating and a loss never raises it,
  and this season's roster counts as one game all season (three at the opener) so a team whose wins say only
  "better than expected" is placed by its roster. Measured over twelve simulated seasons: ranks match true
  strength better (0.96-0.97, was 0.94), no state is held down (worst state 1.4 times, was 4.5), unbeaten state
  champions median #5 (worst #35, was #166), an unbeaten New Jersey, Pennsylvania or North Carolina champion that
  dominated reaches the top 10 (#3-#7 in some seasons), and the national #1 was a top-3 team from four different
  states. The résumé blend (option B) wasn't needed.
- **Box score: the record under each team reads as wrong.** After Miami Northwestern beat Doral Academy 15-14, the
  Final Box Score showed "Miami Northwestern 2-3, 1-3 Home" while the Hub showed "2-3 (1-1)" (overall, then
  district). The second pair in the box score isn't the district record: it's the team's home record, or for the
  visitors their away record (`recordLine()` in `src/sim/lineScore.ts`, used by `PostGameBoxScoreModal` and the live
  game's header). So it may be correct but it's confusing next to the Hub. Verify the numbers against the schedule,
  then show what players expect: the district record, as on the Hub ("2-3 (1-1)"), with the home or away record
  dropped or clearly labeled.
  **Done (v1.17.1):** each team shows its overall and district record, as on the Hub ("2-3 (1-1)").
- **Halftime talk: review the four options, and make them do something.** The Halftime Locker Room offers 🔥
  Passionate rally speech (+1 momentum, more 3rd-quarter effort, slightly more penalties), 📐 Tactical adjustments
  (better execution, fewer blown assignments), ⚡ Demand focus and ball security (half the fumble and drop risk,
  fewer explosive plays) and 🧊 Hydrate and recover (+12 stamina for every starter). **Found while noting this:
  the choice is ignored.** `LiveMatchScreen` receives the speech as `_speechType` and only closes the sheet and
  resumes the game, so none of the promised effects happen (`src/components/HalftimeSpeechModal.tsx`,
  `src/components/LiveMatchScreen.tsx` around `onApplySpeech`). Decide the options (maybe tied to the score: up,
  down, tied), wire each one into the second half, and test that each effect shows up in simulated games.
  **Done (v1.17.1):** four new talks, each with a gain and a cost shown as chips: "This is OUR house!", "Put points
  on the board!", "Nobody crosses that goal line!" and "Swing for the fences!". Each is worth about a 3-5 point
  swing over a second half, measured over thousands of games (`src/sim/halftime.ts`).
- **Music: the progress bar doesn't restart when you skip a song.** In the Now Playing card, skipping to the next
  song keeps the old bar. Likely cause: the bar (`Progress` in `src/components/NowPlayingPopup.tsx`) reads the
  position once when it first appears, and the card stays open when the song changes. Give the bar the song as
  its key so it starts over for each song.
  **Done (v1.17.1):** the progress bar was removed from Now Playing.
- **Live game: rename the "Call the play" panel to "Call the next play".** It's the heading over the play buttons
  (Inside Power, Outside Sweep, Quick Slant, Deep Shot) in `src/components/PlayCallingPanel.tsx`. The title
  screen's "🏈 Call the plays" chip stays as it is.
  **Done (v1.17.2).**
- **Links still leave the player halfway down the next screen (raised before).** Example: from the Hub, partway
  down, tapping "🎓 College recruiting ›" opens College recruiting in the middle of the page instead of at the top.
  It's a single-page-app issue: the game never loads a new page, so the browser never scrolls up by itself. What
  exists: `useScrollTopOnScreenChange` (`src/utils/pageScroll.ts`, added in "Every new screen opens at the top")
  scrolls the app's container (#root) to the top when the tab or section changes (App.tsx, CollegeRecruitingView,
  RosterDepthChartView, PlayerLeaderboardView, SplashScreen). Options to review:
  1. Reproduce on an iPhone first, and list which links fail.
  2. iPhone Safari ignores a scroll-to-top made while the page is still gliding from a swipe. Stop the glide
     first (briefly freeze scrolling on #root), then scroll.
  3. Scroll before the new screen is drawn (useLayoutEffect instead of useEffect), so it never shows mid-page.
  4. Cover every way of changing screens, not only the ones listed in App.tsx (for example the college page's
     player focus, and sections opened from cards).
  5. Bigger: give each screen its own address (a router). The phone's Back button then works and the browser
     handles the scroll position. More work, and it touches sign-in and Stripe returns.
  **Done (v1.17.1), options 2 and 3:** stop any glide, jump before the new screen draws, and check again shortly
  after. Closed by the user 2026-10-15.
- **Practice: show what practice adds up to over the season.** The Practice screen (Team › Practice,
  `src/components/PracticePlan.tsx`) shows this week's choice and "Last week's practice: +8 skill points, 3
  overall" with a list of players. It's hard to tell whether the gains are only for this week or for the whole
  season. They're permanent: practice raises players' skills and overall for good (`src/sim/training.ts`). Only
  fatigue and injury risk are short-term. Review ways to show it, for example:
  - a "This season" total next to last week's: skill points and overall gained by the team since week 1;
  - each player's growth this season (overall at the start → now), with the biggest gainers first;
  - a small week-by-week chart of the team's gains, marking the 2× weeks (spring, summer, camp);
  - a line on the choice buttons saying the gains stay all season.
  Check whether the game keeps each player's start-of-season ratings, or start keeping them. Mockup first.
  **Done 2026-10-14 (option A, v1.17):** Team › Practice has "This season" (`PracticeSeasonCard`): the team's
  attribute points, overall and weeks this year, then one row per position group (QB, RB, WR/TE, OL, DL, LB, DB,
  K/P) that opens to its players, biggest gain first ("49 → 55 +6"), each with his potential, a Starter tag and a
  🧑‍🏫 Coach tag when a position coach or the JV staff adds to his training. Totals count from this update on and
  are saved with the game (`practiceSeason`). "Skill points" became "attribute points" on every practice screen.
- **Dilemmas: review the Coach Point rewards, and make the bad choices really tempting.** Today the CP from
  dilemmas is small next to what recruiting costs, so the shady options aren't tempting and the second (middle)
  option is usually the best pick. Example, "Beloved Booster Accused": report him (+0), ask him to stay away
  (−₡10), let him keep coming (+₡20), have his family settle it privately (+₡50 with investigation risk). Numbers
  today (`src/sim/dilemmaTemplates.ts`, `coachPointsDelta`):
  - **Rewards and costs across all dilemmas:** mostly −₡10 to +₡20. The biggest rewards are +₡55 (one choice),
    +₡60 (four) and +₡70 (two). There are 78 corrupt choices.
  - **Recruiting costs:** a text ₡5, email ₡15, call ₡20, visit ₡30, invite ₡40, wine & dine ₡50, all per
    prospect per week. Feeder events also cost CP.
  - **Income:** ₡100 a week, starting at ₡600. Talents cost ₡2,000 and ₡4,000.
  So the best corrupt payout buys about one wine & dine. Do an overall review: scale CP by tier (corrupt ≫ risky
  > compromise), so a corrupt choice is worth something like several weeks of recruiting, and balance it with
  real risk (investigations, sanctions, booster and board effects). Then measure it in simulated seasons, so that
  cheating is tempting but not the only way to win. The project's balance rule applies: check title turnover
  across many seasons.
  **Done 2026-10-14 (option A, v1.17):** every choice rescaled by tier: corrupt ₡150-300 (average ₡205), risky
  ₡60-120 (one story cost kept: restitution from the team account), good −₡10 to −₡30, compromise unchanged (its
  costs are paid for in the story). Measured over a season at five schools: always corrupt earns about +₡2,050 but
  ends in a playoff ban every time with the board at 0; corrupt only while compliance is 65 or more earns about
  +₡710 with one ban in five; always good costs about ₡150.
- **Coaching staff: candidates of different grades look identical.** On the JV Offensive Coordinator's list, the
  S+ (₾100), A (₾25), C (₡150) and D+ (₡100) candidates all show the same single effect: "Young Offense: Freshman
  and sophomore offense grows +1 a season". The grade does change the strength, but only behind the scenes
  (`src/sim/coachingStaff.ts`):
  - `effectStrength(rating)` = (rating − 50) / 49. So the "+1" is really about +1.0 for a 99 (S+), +0.7 for an
    A (≈85), +0.3 for a C (≈63) and +0.15 for a D+ (≈57).
  - `effectSlots(rating)`: 1 effect at 50–69, 2 at 70–94, 3 at 95+. Roles with a single possible effect (like the
    JV coordinators) can't show that difference at all.
  - The effect text is fixed per effect, so it always says "+1".
  Review so the grades differ clearly: show each candidate's real amount ("+0.3 a season"), or use words or bars
  for strength; check the prices against what each grade really gives; and give single-effect roles more effects
  or a bigger spread between grades. Mockup first.
  **Decided 2026-10-14: direction P2.** Whole-number levels, one per letter: D = 1, C = 2, B = 3, A = 4, S = 5;
  a plus grade (B+, A+, S+) adds one more effect instead of more strength. Cards show "Young Offense +3" and a
  meter equal to the level. Fractional growth text ("+0.3 a season") was rejected.
  **Pay-to-win concern (measured, 1,500 games per row, equal teams, full 17-role staffs vs no staff):** all D
  +0.2 edge 54% wins; all C+ (best Coach Point staff) +0.7, 56-57%; all B +1.25, 63%; all A +1.6, 68%; all S+
  +2.0 (cap), 69%. Best paid vs best free is about 63%, plus up to +0.5 overall per player a season through
  development. **Decided 2026-10-14 (both):** (1) cap the gap: best paid staff vs best free staff about 55-58%
  wins (lower the game-day cap, or let Coach Point coaches reach higher); (2) pay for breadth, not wins: S grades
  add more effects in development, recruiting, Coach Points and compliance, with the same game-day ceiling as a
  strong free coach. Next: draft level values per effect, prices, then measure win
  rates and title turnover over many seasons before building.
  **Done 2026-10-15 (v1.18), plan approved the same day:** levels D 1 … S 5; effects D/C 1, B/A 2, S 3, a plus
  grade one more; game-day effects count up to level 2 (0.08 of the effect's weight a level); development adds
  practice gains (level / 12 of the position coach boost) and +0.01 overall a level in the off season (JV practice
  boost doesn't stack past one strong coach); injuries, Coach Points, recruiting and program effects scale with
  level. New effects: a recruiter for each position coach, Blocking Tight Ends, Specialist Recruiter, Recovery
  Science, Fundraiser, Camp Director, Family Ties, Scout Team and JV recruiters. Prices unchanged; hired coaches keep
  their effects. Measured: best free (all C+) game day +0.55, best paid (all S+) +0.70; with two seasons of
  development the best paid staff beats the best free one 57.5% head to head (target 55–58%); five-season careers
  show no lock-in (0–1 titles in 30 seasons for no staff, free and paid alike).
- **Save-scumming: reloading to replay a big game until it's won.** Settings › Saves has "Save game" and "Load
  autosave", so a player can save before an important game and reload after a loss. That's less a cheat than the
  price of a single-player game, but consider options to stop it (raised before in the 2026-10-13 security
  review, option C). Today the match engine's dice are `Math.random()`, so every replay comes out differently
  (`src/sim/matchEngine.ts`, also `macroSim.ts`). Options:
  1. **Fixed dice per game:** seed each game's random numbers from the save and the game, so replaying with the
     same calls gives the same result. Different play calls still change it, which stays fair.
  2. **The game counts once it starts:** mark a game as started in the save. Reloading mid-game, or from before
     it, plays it out (simulated) instead of offering a fresh start.
  3. **Ironman careers:** one autosave only, no manual loads. Optional, or required for Hall of Fame careers,
     or worth a Hall of Fame bonus.
  4. **Only the Hall of Fame cares:** leave normal play alone, but count loads in the save and mark or exclude
     reloaded careers on the Hall of Fame.
  **Decided 2026-10-14: option 2 (a game counts once it starts). Done (v1.17), mockup approved the same day.**
  The coach's games are written down in this browser, apart from the saves (`src/sim/gameLock.ts`,
  `src/services/playedGames.ts`, keyed by a career key carried in every save): a live game from kickoff, with where
  it stands as it's played, then its final and the players' lines; a simmed game's final too. Loading an older
  save of the same career puts a played game's final back (same score, box score lines and records, with a
  one-time "This game was already played" sheet), and a game that kicked off but wasn't finished (a closed
  browser, or a reload mid-game) can only be resumed, where it left off. The Load Game list marks saves made
  before games that have since been played. A playoff game against a different opponent is a new game.
  **Follow-up done (v1.18.2):** signed in, played games are kept on the account too (the `played_games` table,
  `auth-worker/migrations/0004_played_games.sql`), so loading a cloud save on another device can't replay a game.
  Options 1, 3 and 4 weren't needed.

## Title screen backgrounds

- **Status:** shelved (added 2026-10-13, before 1.15). Tested on 2026-10-13 with a sunset scene (a coach from
  behind, stadium lights): the plain title screen worked better, so it stays off. Try again only with a
  different kind of picture.
- **What it is:** a random full-screen scene behind the title screen, a portrait image for phones and a landscape
  one for wider screens, never the same one twice in a row. The scenes are listed in `public/cover/covers.json`.
- **Where the code is:** the git stash "Title screen random cover backgrounds (shelved)", made on `v1.14`. It holds
  `TitleCoverBackground.tsx`, `utils/titleCovers.ts`, its test, the cover styles in `index.css`, the tagline
  shadow and `public/cover/covers.json`. Bring it back with `git stash list`, then `git stash pop stash@{N}`; expect
  small conflicts in `SplashScreen.tsx` and `index.css`.
- **Needs first:** the scene images (no text or logos; about 1080 x 1920 and 1920 x 1080, under 400 KB each, rights
  to publish).
