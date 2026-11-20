# One page per school: unique content from the game's simulation

Status: plan only (2026-11-20, revised the same day after the user's review of the first mockups). Nothing here is built. The page designs need the user's approval (mockups first, per
CLAUDE.md) before any production page is written.

Goal: one page for every 11-man high school in the target states, listed by classification, each classification with
its own state champion. Each school gets two pages (2.0): a **landing page** that pitches taking over the school ("Can
you help Valdosta High School win state?") with one button, and an **outlook page** that carries content about that
school only this game can make: what its own simulation says about the school's season. The test: a reader who swaps two school pages should find different facts, different numbers, different
opponents and a different story on each, not the same paragraph with a new name.

Copy rules for everything below (public copy): fan language, not game terms or stats (no prestige, ratings or
percentages); one decision and one button per school page; "playoffs", never the b-word; never the number of states;
prospects "join your school"; never name an outside source of the play data.

**Football Coach is the voice.** The pages never talk about "the sim" as a character. Football Coach (the game's
short name) is who has an opinion: "Football Coach likes Lowndes, barely.", "Football Coach's top 10", "Agree with
Football Coach?". "We" is the people behind it: "We simulated the rest of the 2027 season. Here is what we found:".
Banter is welcome ("Upsets happen."). Labels stay short: no feature names such as "Friday Night Sim" on school pages.

Mockups (revised through 2026-11-20): https://claude.ai/artifact/A3ENPa5eC3jAfbiLA3HbVK

---

## 1. Where things stand

- 5 hand-written test pages (`/alabama/thompson/`, `/georgia/valdosta/`, `/california/folsom/`, `/florida/jupiter/`,
  `/texas/cypress-lakes/`), each with a `start/` step, written by `scripts/team-pages/build.mjs` (copy per team in its
  `TEAMS` list), styled by `public/team-pages/team.css` + `team.js`.
- The game plays the top class of 12 states (916 schools). The sitemap is split by state (`scripts/site-map/`,
  `docs/SITEMAP.md`); every school already has an address, `/<state>/<school>/`.
- **The big dependency:** a school page's button starts a career at that school (`/?state=&school=` through
  `src/sim/teamLink.ts`). A page for a school the game can't play would break its one promise. So school pages go live
  only as the game adds that school's classification. The page program and the "new classifications" work move
  together, state by state. (Maryland is in the game but not on the target list: keep its pages or not? See Decisions.)
- The deploy is Workers static assets with no server code (`wrangler.jsonc`). Separate Workers already exist for the
  music, sign-in and leaderboard.

### What the simulation costs (measured today)

A temporary benchmark on this branch (deleted after the run): `simulateMacroMatch` takes **0.063 ms per game**;
building Texas 6A's whole world (254 schools, light rosters) takes 28 ms (102 ms with full rosters).

- One simulated season of every target school (about 12,000 schools, 10 games each plus playoffs): about 70,000
  games, about 5 seconds plus world building, call it 10 seconds.
- **10,000 seasons of every school: about 28 core-hours, about 3.5 hours on an 8-core machine.** Overnight, at home,
  no cloud cost. Each run simulates a whole classification at once, so all its schools get their outlook from the same
  10,000 runs (and the outlooks agree with each other).
- One Friday's games, 10,000 times: seconds.
- The "average coach" number (how many seasons a typical coach needs to win state) needs whole careers, which are
  much slower: the title-odds harness in the main checkout runs a 10-year career in 13-30 seconds. See 2.1.

---

## 2. Unique-content methods

Each method: what makes it unique per school, what it costs at 10,000+ schools, how often it refreshes, and the
thin-content risk. Starred methods are the recommended launch set.

### 2.0 ★ Two pages per school: the landing page and the outlook page (user, 2026-11-20)

The school's marketing and its information live on separate pages, so the pitch stays a clean landing page with its
own button, and the simulated content has room to grow without crowding it.

| | Landing page (marketing) | Outlook page (information) |
| --- | --- | --- |
| Address (user, 3.3) | `/team_page/?state=ga&school=valdosta&v=direct` | `/forecast/?state=ga&school=valdosta&v=direct&year=2027&type=base` |
| Who arrives | Our own promotion: ads, posts, clips, QR codes, emails | Search, the classification hubs (2.3, 2.5), district rivals' outlook pages, shared top 10s and picks |
| On the page | Today's page: the headline dare, the program's story (2.11), "You can do it." with the average-coach line, the button | Header with the team name ("Valdosta Wildcats"), state, classification and district; the outlook (2.1); the season in a minute (2.2); "You can do it." with the average-coach line and the button; footer links |
| Changes | Never through the season | Every week in season (3.2), at least once before it |
| Links out | None: the button is the only choice | Footer links up to the hubs and across to district rivals |
| Search | Kept out (`noindex`): 12,000 copies of one template are the look-alike pages search engines push down | Indexed and in the sitemap: this is the page with the unique content |
| The button | 🏈 Coach Valdosta now, tagged with the link's source (which ad, clip or post), so starts are counted per campaign; its wording is A/B tested here | The same button, counted as search starts |

Both buttons go to the same "what to expect" step and then New Game at that school. Later content (the district race
2.6, the rivalry outlook 2.7, program facts 2.8, coaches who took over 2.9) goes on the outlook page; the landing page
stays as it is.

Both are shared pages filled from the address (3.3), so the number of schools never adds files. The 5 live test
pages (`/georgia/valdosta/` and the others) redirect to their landing page address.

### 2.1 ★ The season outlook: "We simulated Valdosta's 2027 season. Here is what we found:"

In season the headline counts from the real record: "Valdosta is 4-1. We simulated the rest of the 2027 season. Here
is what we found:".

What the page says (fan language, one idea per line):
- **Most years:** the typical record ("Most years: 8-2").
- **The playoff verdict (always shown):** does Football Coach have them in? A colored tag and one line: "Playoffs:
  Football Coach has Valdosta in." / "Long shot: the Spartans need to win out to get in." / "No playoffs: Football
  Coach has Cypress Lakes out." The tag comes from the share of runs that reach the playoffs (in: most runs; long
  shot: some; out: few). Thresholds to set when the first real outlooks exist.
- **How far:** the round where most seasons end ("Most years the season ends in the second round"; for a team that's
  out, "When they do get in, the run ends in the first round").
- **State titles:** as a count or "1 in N" ("In 10,000 seasons, Cypress Lakes won state 4 times." / "Valdosta wins
  state about once every 30 seasons."). Counts read like fan talk and are not percentages. (Decision: is "1 in N" OK
  here? The title-odds plan already approved "1 in N".)
- **The game that decides the season:** the closest game on the schedule, named ("The Winnersville Classic against
  Lowndes is a coin flip").
- **Best and worst seasons we saw:** "Best: 14-0, state champions. Worst: 3-7."
- **National lines, for powerhouses only:** "Duncanville finishes in Football Coach's national top 25 most years." and
  "Duncanville won the national title in 1 of every 26 seasons." In season: "Football Coach's national top 25 this
  week: #6." High school football has no national playoff; as in the game, the national title is #1 in the final
  national top 25 (the game's computer rankings, `src/sim/nationalRankingEngine.ts`, solved from every result). The
  lines appear only for teams that reach the national top 25 in enough runs (threshold to set, for example 1 run in
  10); the title line only if they won it at least once.
- **The average coach:** "The average coach takes 11 seasons to win state with Valdosta. Can you do better?" (the
  approved line; it goes in the "You can do it." card).

Unique per school: every number, the opponent names, the deciding game and the record are the school's own, from its
own schedule. Two schools in the same district differ because their strengths and schedules differ.

Cost: outlook, about 3.5 hours a year on one machine (above). The "average coach" line is the expensive part:

| Way to get "seasons the average coach needs" | Cost at 12,000 schools | Notes |
| --- | --- | --- |
| A. The bot career harness (scripts/title-odds), 12 careers per school | ~144,000 careers x ~20 s = ~800 core-hours | Truest, but weeks of machine time; only for quoted programs |
| B. AI-only multi-season worlds: run each classification 20 seasons with no user, 200 times, and record how long each program takes to win its first title | To measure (one world covers every school in the class) | Measures "a typical coach" as the game's own AI coaches; cheap, consistent |
| C. Derive it from the season outlook (title odds per season, with program drift) | Free | A formula, not a simulation; least honest |

Recommendation: **B for every school, A to calibrate it on the 48 scenario programs.** Blocked on the recruiting fix
(the BACKLOG's top entry): today a strong coach wins everywhere and the hands-off coach never wins, so the number
would be wrong in both directions until that lands.

Refresh: once a year (late July, after the game's preseason data update). Re-run after big balance changes.

Risk: low. The numbers are new information nobody else has, and they differ on every page. The risk is template
sameness in the sentences around them; see 2.11.

### 2.2 ★ "The 2027 season in a minute": the scoreboard montage

**Football Coach's forecast, game by game**, played as a 15-second scoreboard: week by week, the opponent, the score
ticking up, the record growing, then the playoff run and how it ends. It is not one simulated season: it is the
consensus of all of them. Template, not a match replay: an HTML/CSS animation fed by about 40 numbers.

How the outlook runner (3.1) builds it from the thousands of runs:
- **Each regular-season game:** the winner is the team that won it in more runs; the score is the typical score of the
  runs that team won (median points for each side).
- **The playoffs:** the round reached most often decides how far the forecast goes; each round's opponent is the one
  met most often in that round. The run ends with the most common result there ("most likely at Carrollton").
- **The record** is what the picks add up to. It can differ by a game from the outlook's "Most years" line (the single
  most common record); see Decisions.

On the page:
- **Scoreboard:** the away team on top, the home team at the bottom, as on a real scoreboard, with no "Home" label. A
  regular-season rivalry game shows its name ("⚔️ Winnersville Classic").
- **Game list** under it: every game with its forecast score, filling in as the scoreboard plays. "Regular season" and
  "Playoffs" dividers keep the two apart; a team that misses shows "Missed the playoffs". Rivalry games are marked
  (⚔️ and the rivalry's name, from `src/data/rivalries.ts` and the rivalry names collected for new schools), in the
  regular season only: no rivalry notice in the playoffs, even in a rematch.
- **Losing teams** (mockup: Wisdom, forecast 1-9): the outlook stays honest ("In 10,000 seasons, Wisdom never won
  state"; "The average coach doesn't win state with Wisdom in 20 seasons. Can you be the first?") and the story turns
  it into the dare ("Wisdom is due."). A school with no rivalry on file gets "The game to circle" instead: its
  closest game, the best shot at a win.
- **In season (from Week 6, for example):** the games already played show "Final", the real score, and what Football
  Coach said before the game ("Football Coach said W 31-17 ✓" or "✗"); a line above the list keeps count ("Football
  Coach's picks so far: 3 of 5 right"). A dashed "Forecast from Week 6" divider follows, then the forecast for the
  rest, recomputed from the real record. The scoreboard plays only the games still to come. Owning the misses in
  public is part of the fun and keeps the forecasts honest. (The picks shown for played games are the ones published
  before each game, so the outlook runner keeps every week's forecast, never overwriting it.)
- **Suspense:** before it plays, the scoreboard waits at the first game to come and the list shows only the regular
  season, scores empty. The playoff games appear one by one as they're reached; "Missed the playoffs" and the final
  line ("1-9 is the forecast...") only after the last game. It plays once when the scoreboard is fully in view;
  with reduced motion it shows the finished season.
- The control under it reads "🔄 Replay season".

Unique per school: its real opponents, its forecast scores, its ending, and in season its real results and how
Football Coach's picks did.

Cost, by format:
- **On the page (recommended for all):** CSS + a few lines of JS in the shared `team.js`; the data is in the
  school's page data. Zero production cost per school.
- **As MP4 for social:** a headless browser records the same animation: about 20 s per school, so 12,000 schools =
  about 65 machine-hours. Make the MP4 only for share moments (the top 10s, a requested school, the rivalry weeks).

Refresh: with the outlook (yearly before the season); weekly in season, after the results agent (3.2) brings in the
week's scores.

Risk: none for search (it is the same data as 2.1). Video on the page should not autoplay sound (it has none) and must
respect reduced motion.

### 2.3 ★ Preseason top 10 per classification (the hub pages)

`/texas/6a-division-1/`: "Texas 6A Division I: Football Coach's top 10" (2027 preseason). Ten cards, each with the
school, a one-line fan reason ("Wins state more often than anyone"), and its typical record. Every other team in the
class follows, by district, each linking to its school page. The one button: "Share the top 10" ("Agree with
Football Coach?").

Unique: each classification is a different set of teams and a different order. A ranking is a natural share
("Football Coach has us at #4?!"), so each hub gets a share card image (1200x630) of its top 10.

Cost: free once 2.1 exists (sorting). Share images: about 800 classifications x 1 image, generated at build.

Refresh: preseason (late July); then weekly in season if Friday Night Sim runs (see 2.4).

Risk: low, if each hub carries every school in the class (a list of links with real facts, not a doorway page). Hubs
are where search engines find the school pages; they are the internal links that make 12,000 pages crawlable.

### 2.4 Friday Night Sim: weekly sim picks for real games

("Friday Night Sim" is the internal name; it never appears on a school page.)

Each week of the real 2027 season, on the classification hub: "Week 6 picks: Football Coach's picks this week", every
real game in the classification, Football Coach's pick and how close ("Lowndes, in a close one", "Coin flip."). The
school page gets one line at the top of its outlook: "This Friday: Valdosta at Lowndes. Football Coach likes Lowndes,
barely."

Unique: by school and by week; and fresh, which search engines reward on game weeks.

Cost: the sims are seconds. The data is the real problem: **real 2027 schedules, weekly results and current records
and standings for every school.** That is the results agent's job (section 3.2). Real results also let the outlook
correct itself week to week (a 0-3 team's outlook should fall).

Copy: Football Coach's pick, never odds, spreads or anything that reads like betting (high school sports betting is
banned or restricted in many states; no sportsbook links or ads ever).

Refresh: weekly, Monday to Thursday. Risk: low for search; moderate work.

### 2.5 ★ State and classification hubs

- `/texas/` (state hub): every classification and association in the state, its champion last season (real fact,
  from the association's published results), Football Coach's preseason favorite, links down to each classification
  hub.
- `/texas/6a-division-1/` (classification hub): 2.3.
- Outlook pages (2.0) link up to their classification hub and across to their district rivals' outlook pages ("Also
  in District 11-6A: DeSoto, Lancaster, ..."). Landing pages have no links.

This is the page structure that keeps everything linked: state > classification > school, and school <-> district.
About 27 state hubs + about 800 classification hubs (to count) + 12,000 schools.

### 2.6 New: the district race

"District 11-6A: who Football Coach has winning it". The district's teams in Football Coach's order, the typical district record of
each, the game that decides the district. One block on every school page in the district (its own row highlighted)
and a section on the classification hub.

Unique: per district (about 1,500 districts), and the block on each school page is centered on that school. Cost: free
from 2.1. Refresh: yearly; weekly if real results come in.

### 2.7 New: the rivalry outlook

The game already knows named rivalries (`src/data/rivalries.ts`: the Winnersville Classic, the Battle of Belt Line...).
"The Winnersville Classic: in 10,000 runs, Lowndes wins it a little more often. Can you flip it?" Rivalry names are
real local lore and strong search terms ("Valdosta Lowndes rivalry"). Unique per pair. Cost: free from 2.1, plus
collecting rivalry names for 12,000 schools (start with the ones the game has; schools without one show their closest
district game instead). Risk: none.

### 2.8 New: real program facts (not from the sim)

A short fact block from public records: city, classification and district, state titles and the last one (from the
associations' published champion lists), and the school's rival. Facts are free to state; they make the page useful
and unique on their own, and they feed the story lines (2.11). Cost: data collection (the same work that adds the
classifications to the game). Risk: getting facts wrong; each state's data needs a source list (as
`scripts/state-sources/` does today).

### 2.9 New: coaches who took over this school (from the game's players)

The leaderboard Worker already knows careers by school. "17 coaches have taken over Valdosta. The best run so far: 4
state titles in 10 seasons." Unique, grows on its own, and is social proof that people play it. Only counts and the
best run; a coach name only if that player chose to show it on the leaderboard. Appears once a school has careers
(an empty state hides the block). Cost: one read of the leaderboard per build. Risk: none; it is the game's own data.

### 2.10 New: share images per school

A 1200x630 `og:image` per school (school color field, the headline, the typical record). Shared links then look like
the school, not the game's generic image. To stay clear of the file limit (3.3), the Worker draws them on request
(`/share/?state=ga&school=valdosta&year=2027`, an SVG template turned into PNG) and Cloudflare caches them; 12,000
static images would push the site past the free plan's file limit on their own.

### 2.11 The story lines, without hand-writing 12,000 stories

The story card is on the landing page (2.0). Today each story is hand-written. At scale the story card is chosen by
rules from the school's facts and sim results, with several wordings per situation:

| Situation (from facts + sim) | Example headline |
| --- | --- |
| Powerhouse (wins state often in the sim, many real titles) | "Thompson has been great. You can be better." |
| Fallen power (many real titles, none lately, middling outlook) | "Valdosta used to own Georgia." |
| Always close (playoffs most years, rarely past the semifinal) | "The Bulldogs get close every year." |
| Long shot (misses the playoffs most years) | "Nobody picks the Spartans." |
| Never won state (real fact) | "Cypress Lakes has never won state." |
| New school (opened recently) | "Nobody has won state here. Be the first." |

Hand-written stories stay for the programs worth it (the 48 scenario programs and any school that sends traffic).

**The sameness guard:** the build measures how alike the outlook pages are (the landing pages stay out of search). It strips the school's own names, splits each
page's text into 5-word shingles and compares every page with its district and classification neighbors. Any pair
over a set similarity (start at 60%) fails the build until more facts or another wording separate them. A page that
can't show the minimum set (real facts, the outlook, at least 3 named opponents) is built with `noindex` and left out
of the sitemap until it can.

### 2.12 Considered and not recommended

- **Full match replays per school:** too costly per school, and the replay's play library is not for public sharing.
  Keep replays for hand-picked clips.
- **AI-written paragraphs per school:** cheap, but the textbook case of Google's "scaled content abuse" (content made
  in bulk mainly to rank). The value has to come from the sim's numbers and real facts, not from prose volume.
- **Real players or recruits on the page:** never (see 4).

### Summary

| Method | Unique by | Cost at 12,000 schools | Refresh | Thin-content risk |
| --- | --- | --- | --- | --- |
| ★ Season outlook | numbers, schedule, rival | ~3.5 h/yr (8 cores); avg-coach line to measure | yearly | low |
| ★ Season in a minute | opponents, scores, ending | free on page; MP4 ~20 s each, on demand | yearly | none |
| ★ Preseason top 10 | class, order | free | yearly / weekly | low |
| Friday Night Sim (Week N picks) | week, game | sims free; needs the results agent | weekly | low |
| ★ State and class hubs | membership | free | yearly | low (with full lists) |
| District race | district | free | yearly | low |
| Rivalry outlook | pair | free + rivalry names | yearly | none |
| Real program facts | school | data collection | yearly | none |
| Coaches who took over | players' careers | one read per build | per build | none |
| Share images | school | on request (Worker), cached | yearly | none |

---

## 3. How the content is made and served

### 3.1 The outlook runner: a script outside the game

The simulations run in a standalone script, not in the game. It lives in `scripts/outlook/` (next to the title-odds
harness, which it borrows from), imports the game's simulation code headlessly (world building, rosters, schedule,
`simulateMacroMatch`, playoffs), and writes data files. It never ships in the site build and never runs in a player's
browser. The page builder (or the edge renderer) only reads its output.

You choose what to run:

```
node scripts/outlook/run.mjs --states texas,georgia --classes 6a-division-1,7a --seasons 10000
```

| Option | What it does | Default |
| --- | --- | --- |
| `--states` | States to run (slugs), or `all` | asks (see below) |
| `--classes` | Classifications within them, or `all`; private ones included (`private-division-1`) | `all` |
| `--schools` | Only these schools (their classification still runs whole, so opponents are simulated too) | all |
| `--seasons` | Simulated seasons per classification (every school in it gets that many) | 10000 |
| `--year` | The season to simulate | next season |
| `--from-week` | In season: start after this week, with the real results so far (from the results agent) | preseason |
| `--results` | The results file to start from (default: the latest the agent wrote) | latest |
| `--avg-coach` | Also measure "seasons the average coach needs to win state" (multi-season worlds) | off |
| `--avg-coach-worlds`, `--avg-coach-years` | How many worlds and how many seasons each, for that measure | 200, 20 |
| `--montage` | Also save each school's game-by-game forecast ("season in a minute") | on |
| `--national` | Also run the national rankings: every selected state in the same seasons, the game's computer rankings at the end of each, counting national top 25 finishes and national titles. Needs every state that can produce a top-25 team in the run (in practice the top classifications of every state) | off |
| `--picks` | Only this week's games (Week N picks), fast | off |
| `--strength` | The current-strength file to use (4.1): every team's rating and spread, rebuilt each week | latest |
| `--workers` | Parallel workers | cores - 1 |
| `--seed` | Repeatable runs | random |
| `--estimate` | Print how many games and about how long, then stop | off |
| `--out` | Output folder | `scripts/outlook/out/` (git-ignored) |
| `--list` | List the states and classifications it knows, with school counts | |

Run with no options, it asks: which states (a checklist), which classifications, how many seasons, then shows the
estimate and asks to go. It can stop and resume (finished classifications are skipped, like the title-odds harness).
Output: one JSON file per state and classification, with each school's outlook (record spread, playoff share, round
reached, titles, best and worst season, the rival game, the game-by-game forecast of 2.2) and the run's settings, so
any page can say which run it came from. Each week's forecast is kept beside the earlier ones (`week-00` preseason,
`week-05`, ...), never overwritten, so the pages can show what Football Coach said before each game.

### 3.2 The results agent: real records, standings and rankings every week

The in-season pages need every team's real record, results and standings each week, and the agent collects them.
It's an AI agent run on a schedule (Saturday and Sunday after the Friday games, Claude Code scheduled task or cloud
routine), one state at a time:

1. Reads each state's list of sources (`scripts/state-sources/`: association score and standings pages, district
   pages, school schedules) and gathers that week's final scores and next week's schedule.
2. Matches every game to the game's school names (the trickiest part: "Lowndes" vs "Lowndes County"), and lists what
   it can't match for a person to fix.
3. Works out records and district standings itself from the scores, and records published rankings (state polls)
   only where that source's terms allow.
4. Writes `data/results/2027/week-06/<state>.json` (games, records, standings, rankings, the source of each line) and
   a short report: games found per state, unmatched names, conflicts between sources, missing schools.
5. A person reviews the report (10 minutes a week), then runs the outlook runner with `--from-week`.

Rules: facts only (scores, dates, records). No player names, ever. Only sources whose terms allow it: the
associations and schools first; the big aggregators forbid scraping, so they're out unless licensed. Football
Coach's own ranking (from real results plus the outlook) is the ranking the pages show; outside polls are an input,
not something to republish.

Before the season, the same agent gathers each school's 2027 schedule (summer), which the preseason outlook needs.
Coverage will be uneven at first: a school whose results the agent can't find shows its preseason outlook with no
"This Friday" line.

### 3.3 Serving the pages: two shared pages filled from the address (user, 2026-11-20)

The user's decision: no page file per school. Each kind of page is one shared page, and the address says which school
it shows:

- Landing page: `https://footballcoachgame.com/team_page/?state=ga&school=valdosta&v=direct`
- Outlook page: `https://footballcoachgame.com/forecast/?state=ga&school=valdosta&v=direct&year=2027&type=base`

| Part | Meaning | Values |
| --- | --- | --- |
| `state` | The state | Two-letter postal code, lowercase: `ga`, `tx`, `al` |
| `school` | The school | Its slug within the state: `valdosta`, `cypress-lakes`; a repeated name takes its city (`central-macon`) |
| `v` | Where the visit came from | `direct` by default; ads, clips, posts, QR codes and emails each carry their own tag (`v=ig_clip_0907`) |
| `year` | The season forecast (outlook page only) | `2027` |
| `type` | The page style (outlook page only) | `base` today; more styles later, without new addresses |

Why it fits Cloudflare: Cloudflare's file limit is **20,000 files per deploy on the free plan, 100,000 on paid
plans** (checked 2026-11-20; 25 MiB per file). A file per school would have meant about 50,000 files (both pages,
their `start/` steps, share images). With shared pages the site stays at the game's own files + the hubs (about 830)
+ one data file per state, whatever the number of schools, and a new state or classification adds data, not files.

**The catch, and the recommendation: a small Worker fills the pages, not the browser.** Cloudflare's static files
ignore everything after the `?`, so on their own every `/forecast/?...` address gets the same file. That leaves two
ways to fill it:

| Way | How | For | Against |
| --- | --- | --- | --- |
| Filled in the browser | One static HTML file per page type; its JavaScript reads the address and fetches the state's data file | No server code | Search engines see an empty page first and index it late, or as one page for every school; link previews (iMessage, Facebook, X, Discord) run no JavaScript, so every shared link shows the same generic title and image; a wrong address can't answer "not found" |
| **Filled by a Worker (recommended)** | `wrangler.jsonc` gets a small `main` script with `run_worker_first` set to `/team_page/*`, `/forecast/*` and `/share/*`; it reads the address, looks the school up in the state's data file (shipped as an asset), and returns the finished page; Cloudflare caches each address and the cache is cleared on each data update | Search engines and link previews see the full page with the school's own title, description and share image; a wrong state, school, year or type answers a real "not found" (404); the game and everything else stay plain static files | Code that runs per visit (Workers free plan: 100,000 requests a day; paid: $5 a month for 10 million); a bug breaks every school's page at once, so it needs its own tests |

Rules that make query addresses work in search:
- **One address per page for search engines.** Each outlook page names its canonical address: the user's form, with
  `v=direct` and the parts always in the same order (`state`, `school`, `v`, `year`, `type`). Visits tagged by an ad
  or a clip (`v=ig_clip_0907`) count toward that one page instead of looking like hundreds of copies. Other `type`s
  name the `type=base` address as canonical until a style carries different content.
- The hubs, the district links and the sitemap always link the canonical form, current year.
- **Each year is its own page.** `year=2027` stays up after the season with Football Coach's forecast next to the real
  results; `year=2028` starts the next summer, and the hubs move to it.
- The landing page stays out of search (`noindex`, 2.0), so its tags never matter to search engines.
- The sitemap lists the canonical outlook addresses by state (about 12,000; the limit is 50,000 per sitemap file).

The button chain keeps the parts: landing page -> `/start/?state=ga&school=valdosta&v=direct` (the shared "what to
expect" step) -> the game, `/?state=ga&school=valdosta&src=team_page&v=direct`. Two changes in the game's link reader
(`src/sim/teamLink.ts`): it learns the two-letter state codes (full names like `georgia` keep working for old links),
and `v` changes meaning. Today `v` is the page test version (`v=page`) and `src` the page that sent the visitor; in the
new scheme `src` stays the page (`team_page` or `forecast`), `v` is where the visit came from and `type` the style.
Start counts in the leaderboard Worker follow the same split.

The 5 live pages: `/georgia/valdosta/` and the others redirect (301, through a `_redirects` file) to their landing
page address, and their `start/` steps to the shared `/start/` step. Links already shared keep working.

Hubs (`/texas/`, `/texas/6a-division-1/`) are few enough to stay static files at their path addresses; see Decisions.

### 3.4 The preseason inputs: what each team needs, where it comes from, when it's out (2026-11-20)

Every team needs the same base record before Football Coach can forecast it. Most of it is public; a few parts are
not, and those decide the cost.

| Layer | What | Where it comes from | How it's gathered | Refresh |
| --- | --- | --- | --- | --- |
| 1. Identity | Official name, city, county, address and map point, public or private, grades, enrollment, a stable ID | **NCES Common Core of Data** (public schools; free, public domain; preliminary directory in the spring, full files around December) and the **NCES Private School Survey** (every 2 years) | A script downloads the files and builds the master list; it keeps the NCES ID as the school's lasting ID | Yearly |
| 2. Football and look | Plays 11-man football; mascot; colors; stadium | The association's classification lists (only schools that play the sport are on them); the association's member directory; the school's website | The **base-data agent** (below) fills mascot, colors and stadium; a person spot-checks a sample per state | Yearly; colors rarely change |
| 3. Competition | Classification, division, region or district, playoff format | The association's realignment release and playoff rules | The agent reads the release (usually PDF or web tables) into the state's data file; the game's `stateRules.ts` gets the playoff format | Each cycle (2 or 4 years), plus yearly changes (opt-ups, new schools, Ohio and Michigan reset yearly) |
| 4. Schedule | Every game: date, opponent, home or away | Depends on who makes it (see the calendar): the association itself (Iowa, Nebraska), district or region committees (Texas, Georgia, Florida, Alabama district games), conferences and leagues (Ohio, Michigan, Illinois, Pennsylvania, New Jersey, California) | The results agent (3.2) in its summer mode: association pages first, then district, conference and school sites | Spring and summer, final changes until Week 0 |
| 5. Results history | Every game's score for the last 3 seasons (2024-2026), for the strength rating (4.1) | Associations whose playoffs use points publish every game (for example Ohio's computer ratings, Michigan's playoff points, Nebraska's wild card points); many publish only the playoffs (Texas). The rest: a licensed scores feed, or school and newspaper sites | One backfill job now; then the weekly results agent | Once now, then weekly in season |
| 6. Program history | State titles, finals, playoff rounds by year | The associations' record books and playoff archives | The agent, once per state; then one line per year | Yearly (December) |
| 7. Change flags | New head coach; moved up or down a class; school opened, merged or closed; stopped or restarted 11-man | Association releases, school and district announcements, local news | The agent, in its preseason pass; stored as yes/no flags, never the coach's name | Yearly (January to July) |
| 8. Star ratings | Talent and consensus (4.2-4.7) | **The user supplies them** (4.3 has the format) | A check script validates the file | When the user sends a new file |
| 9. Returning starters (optional) | Who is back from last year | Rarely published; preseason magazines own theirs | Skip in the first version; the user's star file can carry it later (4.3, optional column); the backtest decides if it's worth it | Yearly |

**The base-data agent:** the same kind of scheduled AI agent as the results agent (3.2), run per state. Its first job
is to write each state's source list, `scripts/state-sources/<state>.json`: the association, its realignment cycle and
next release, who makes the schedules and where they're posted, where scores are posted (if anywhere), the champions
list. After that it fills layers 2, 3, 4, 6 and 7 from those sources, writes `data/base/<year>/<state>.json`, and
reports what it couldn't find or match. Rules as in 3.2: facts only, no player names, only sources whose terms allow
it.

**The one real gap is layer 5, the scores.** Where the association doesn't publish every game, the free routes are
slow (school sites, newspapers). Two licensed feeds exist: ScoreStream (a crowd-sourced scores API; it supplies the
Associated Press) and PlayOn, which now owns MaxPreps (aggregated scores and schedules sold to media). Neither
publishes prices. Recommendation: ask both for a quote for 3 seasons of backfill plus 2027 weekly, for the target
states, used inside the simulation and shown only as each school's own results. Until then, the backtest starts with
the states whose association publishes every score.

#### When the information is out (as of 2026-11-20)

Most of the target states realigned for **2026-27 and 2027-28**, so the 2027 classifications are already known in
most of them. The next big wave comes late 2027 to early 2028 for the 2028-30 cycle.

| State | Cycle and timing (examples checked) | Schedules made by |
| --- | --- | --- |
| Texas (UIL) | Every 2 years; 2026-28 districts released Feb 2, 2026 | District committees (district games) and schools, in the spring after realignment |
| Georgia (GHSA) | Every 2 years; 2026-28 regions set Nov 2025 (appeals Nov 17) | Regions and schools |
| Florida (FHSAA) | Every 2 years; 2026-28 classes final Dec 17, 2025 (1A and Rural merged Feb 13, 2026) | District coordinators and schools |
| Alabama (AHSAA) | Every 2 years; 2026-28 alignments released Jan 23, 2026; public and private now separate | Regions and schools |
| Pennsylvania (PIAA) | Every 2 years; 2026-28 parameters Nov 2025, school numbers soon after, play-ups Dec 2025 to Apr 2026 | Leagues and schools |
| North Carolina (NCHSAA) | Every 4 years; 2025-29 approved Mar 3, 2025 | Conferences and schools |
| Ohio (OHSAA) | Divisions every year; 2026 announced Apr 23, 2026, revised Jun 22 after opt-ups; new-school enrollment counted Sep 10 | Leagues and schools |
| Michigan (MHSAA) | Divisions every year; 2026-27 announced Apr 7, 2026; playoff field by playoff points after the season | Leagues and schools |
| Iowa (IHSAA) | Every 2 years; 2025-26 districts Mar 2025; next cycle (2027-28) early 2027 | **The association** builds every varsity schedule (posted with the districts) |
| Nebraska (NSAA) | Every 2 years; 2026-27 schedules released Feb 11, 2026 | **The association** builds every schedule |
| Illinois (IHSA) | **Classes are set after the regular season** (from the playoff qualifiers' enrollment, with the private-school multiplier) | Conferences and schools |
| California (CIF sections) | Leagues realign every 2-4 years by section; **playoff divisions are set after the regular season** from computer ratings (Southern Section) | Leagues and schools |
| The other target states | To fill in: the base-data agent's first pass writes each state's source list | |

Two states need a different preseason page: in **Illinois and California**, the playoff class or division isn't known
until the season ends. Their outlook says what Football Coach projects ("Football Coach has them in 7A") until the
association decides, and their hubs group schools by conference before then.

**The 2027 preseason calendar:**

| When | What |
| --- | --- |
| Now to January 2027 | Base-data agent writes every state's source list; backfill of 2024-2026 scores (association sources; licensed feed if quoted); program history |
| January to March 2027 | NCES files for identity and enrollment; classifications for the 2-year states already known; Iowa's 2027-28 districts and schedules |
| March to April 2027 | Ohio and Michigan divisions (yearly); change flags; first star file from the user |
| April to July 2027 | Schedules collected as they're posted; backtest on 2025 and 2026 sets the strength weights |
| Mid-July 2027 | Last star file and schedule pass; the runner builds current strength and the preseason outlooks |
| Late July 2027 | Preseason outlooks and top 10s published |
| Late August 2027 on | Weekly results; strength and outlooks refresh every weekend |

---

## 4. Team strength: this year's team, from current information

### 4.0 How the game measures a team today (reviewed 2026-11-20)

1. **Prestige (PPI, 40-99)**, one number per school, typed once from the design spec's school tables
   (`scripts/build-state-leagues.py`, September 2026), for the top class of 12 states (916 schools). A school without
   one rolls 68-92 at random.
2. **Prestige becomes roster talent** (`programTalent`, `src/generators/rosterGenerator.ts`): (prestige - 75) x 0.3,
   plus 0.4 per point over 90, plus the state's national strength (`STATE_TALENT`, -1.5 to +3). Players are rolled
   around that.
3. **A game** (`simulateMacroMatch`, `src/sim/macroSim.ts`): each side's strength is the average overall of its
   game-day lineup (`teamStarterRating`; another state's light team stores one number, `lightRating`), plus coach
   edges; the home side gets +1. The gap sets each drive's odds. One rating point is about 4.5 points of margin.
4. **Prestige moves** only through college signings (`alumniPrestigeChanges`), rivalry wins (+1) and the upset surge.
   The PPI formula in `src/sim/rankingEngine.ts` (history 35%, 3-year win rate 30%, facilities, alumni, coach) exists
   but nothing calls it.

What that means for the outlook:
- **It forecasts the program's reputation, not this year's team.** Each simulated season rolls a fresh roster around
  the prestige, so 10,000 runs average over imagined rosters. A down year at Valdosta or a loaded senior class at
  Wisdom can't show.
- **Real results never change a team's strength in season.** A team that starts 5-0 against expectations is still
  forecast at its preseason level; only the record carries over.
- **The numbers are one snapshot from one source**, a year old by kickoff, and exist for 916 of about 12,000 schools.
- **Home field** (+1 rating, about 4.5 points) is about double the usual high school home edge: check it in the
  backtest below.

### 4.1 The fix: a current strength rating, kept apart from prestige

- **Prestige stays** what it is in the game: the program's pull (recruiting, history, the career game).
- **New: current strength**, one number per team, updated every week in season: how many points better or worse the
  team is than an average team in its state ("Duncanville +31, Wisdom -12"). The outlook runner sets each team's
  game rating straight from it (rating = points / 4.5, the sim's own scale) instead of rolling a roster from prestige.
- **Uncertainty is part of it.** Each run draws the team's rating from a spread around the number: wide in the
  preseason, narrower each week as real games come in. That spread is what makes upsets and "1 of every 30 seasons"
  honest.

| Input | What it adds | Source | When |
| --- | --- | --- | --- |
| Last season's results rating | How good the team was, adjusted for who it played, margins capped (about 28) so running up the score doesn't count | Scores from the results agent (3.2); we compute it ourselves and never copy anyone's published rating | Preseason |
| This season's results | The same rating, from this year's games; it takes over as weeks pass (the preseason number counts as about 3 games) | Results agent, every week | In season |
| Program history (prestige) | Pulls a team back toward its usual level: one good or bad year is partly luck | Game data, champion lists | Preseason |
| Returning starters, seniors lost | Who is back from last year | School rosters and the association's preseason data, where published | Preseason |
| Star counts | Talent and consensus (4.2-4.5 below) | The user's star file (4.3) | Preseason |
| New head coach | A coaching change adds doubt (a wider spread) | Results agent collects it | Preseason |
| Enrollment, classification move | A move up or down a class changes the competition | The association | Preseason |

**The weekly update:** after each Friday the results agent's scores go into the rating (a least-squares or Elo-style
fit with the preseason number as the starting point), the runner re-simulates the rest of the season from the new
ratings, and the outlook and season in a minute change with them. Wisdom's upset of Cypress Park then lifts Wisdom's
rating, not just its record.

**The backtest that sets the weights:** build 2025's preseason ratings from what was known before 2025 (2024 scores,
history, rosters), forecast 2025 week by week, and compare with the real games: winners picked, margin error, playoff
teams, champions. Then 2026. Keep the weights that predict best, and require the result to beat the prestige-only
forecast clearly before launch. This also checks the home edge and the 4.5 points per rating point.

**In the game itself (optional):** once a year, current strength could also refresh each school's prestige in the
game's data, so a new career starts from the real program's current level. See Decisions.

### 4.2 Star-rated players: the idea

If a school has, say, a 5-star prospect at quarterback, the sim gives that team a strong fictional quarterback. The
real player is never named, shown, highlighted or hinted at anywhere.

### 4.3 The star file the user sends (format)

Decision (user, 2026-11-20): **the user gets the star ratings and supplies them** as a file. The plan doesn't need to
license or rate them itself.

One CSV file per delivery, one row per school, position and star tier: counts only, never a player's name, ID or
link. A spreadsheet can save it directly.

File name: `stars-<season>-<date>.csv`, for example `stars-2027-2027-06-15.csv`. A newer file for the same season
replaces the older one completely (players transfer and ratings change), so each file is the full picture on that
date.

| Column | Required | Meaning | Example |
| --- | --- | --- | --- |
| `season` | yes | The football season the players are on the roster for | `2027` |
| `state` | yes | Two-letter code, lowercase | `ga` |
| `school_id` | one of these two | The school's ID from the team list we hand over (`data/base/<year>/teams-<state>.csv`) | `1300720` |
| `school` | one of these two | The school's name as the source writes it, if there's no ID; add `city` to tell apart repeats | `Valdosta` |
| `city` | no | The school's city, to match repeated names | `Valdosta` |
| `position` | yes | One of the positions below | `QB` |
| `stars` | yes | 2 to 5 | `4` |
| `count` | yes | How many players at that school, position and tier | `1` |
| `grad_year` | no | Their graduating class, to know who leaves after the season (if given, one row per class) | `2029` |
| `returning` | no | How many of `count` started last season (layer 9 in 3.4) | `1` |

Positions: the game's own (`QB RB WR TE OT OG C DE DT LB CB S K P`) or the usual groups, which the game spreads over
its positions: `OL` (OT, OG, C), `IOL` (OG, C), `DL` (DE, DT), `EDGE` (DE), `DB` (CB, S), `ATH` (the team's thinnest
skill position).

```csv
season,state,school_id,school,city,position,stars,count,grad_year,returning
2027,ga,1300720,Valdosta,Valdosta,QB,4,1,2028,1
2027,ga,1300720,Valdosta,Valdosta,DL,3,2,,
2027,tx,4817190,Duncanville,Duncanville,WR,5,1,2028,1
2027,tx,4817190,Duncanville,Duncanville,EDGE,4,2,2029,0
```

(The IDs above are made up for the example.) Schools with no rated players need no rows.

**The check:** `node scripts/outlook/check-stars.mjs <file>` reads it before anything uses it and reports, without
changing it: schools it can't match (with the closest names from the team list), unknown positions, stars outside 2-5,
counts over the per-team cap, rows repeated, and the totals per state. The runner refuses a file with errors.

**Where it's kept:** outside git, like the music files (`data/stars/` is git-ignored) and never in shared notes: the
counts come from a third party's product and describe minors' teams. Only the derived team strength reaches the
outlook files.

### 4.4 How the game would use it

`generateDistrictTeams` (`src/generators/rosterGenerator.ts`) already rolls every roster from the school's prestige
(`programTalent`). With star counts, for each count it makes one generated player at that position with an overall
from a star map (for example 5 stars 88-94, 4 stars 80-86, 3 stars 72-78, against starters at about 66), a random class
year and a generated name. Everything else stays as it is. Effect: the macro sim uses the lineup's average
(`teamStarterRating`), so one 5-star starter lifts a team about 1-1.5 rating points (about 5-7 points of margin a game,
at 4.5 points per rating point). A cap per team keeps a single star from deciding a classification.

### 4.5 Decision (user, 2026-11-20): star ratings go into the strength formula, never onto the page

Player ratings measure two things at once: how strong a team's players are, and what the people who follow high
school football currently think of the team (the consensus). Both belong in a team's starting strength. So they are
an input to the formula below. They are never shown, named or hinted at: not as a count, not as a position, not as
"has a star quarterback".

### 4.6 The team strength formula (hidden; the preseason starting point of 4.1)

| Input | What it measures | Source |
| --- | --- | --- |
| Results power rating | How good the team has been lately: an Elo-style rating fitted to the last 3-5 seasons of scores, margin capped | Association-published scores, via the results agent (3.2) |
| Program history | Titles, deep playoff runs, recent records: the program's pull | Association champion lists and results |
| Talent and consensus | How rated the current players are, and so how highly the team is thought of | Star counts per position (the user's star file, 4.3) |
| Returning starters (optional) | Turnover from last season | Later, if a source exists |
| Enrollment and classification | Size of the school and its competition | The association's own data |

The weights are set by backtesting: build last season's preseason strength from the inputs available before it,
simulate it, and compare with what really happened (records, playoff rounds, champions). Keep the mix that predicts
best. The star input gets a cap per team, so one great player can't decide a classification on paper.

Inside the game, the strength becomes the school's prestige (as today), and the star counts make the generated
rosters match (a strong generated quarterback where the counts say so). Every generated player keeps a generated name,
so "All players, games and results are fictional" stays true.

### 4.7 Getting the ratings: license, or rate them ourselves

Settled (user, 2026-11-20): the user supplies the ratings in the format of 4.3. The background below stays for
reference. Scraping the recruiting sites is out: their ratings are their editorial product, their terms limit use to personal,
non-commercial use (247Sports' subscription terms: "non-commercial entertainment"), and their sites forbid scraping.
Two ways that work:

| Way | How | For | Against |
| --- | --- | --- | --- |
| A. License | Ask the recruiting services (and the companies that resell sports data) for a data license: school-level counts by position and star tier for each class year, for use inside a simulation, never displayed | Ratings fans already trust (that's the consensus); covers every school at once; least work each year | Price unknown (could be beyond the $0 budget for now); the deal must allow use inside a game with nothing displayed; coverage of small schools is thin |
| B. Our own ratings | A person on the team (or a few contract scouts) rates players from public information: offer lists the players announce, all-district and all-state teams the associations and newspapers publish, public film. They record only counts per school and position, not names | No license; we control the method; can cover schools the services ignore | Slow at scale: thousands of rated players a year; it's our opinion, not the consensus; the working notes name minors |

Recommendation: **ask for license quotes now (A) and, in parallel, test B on the pilot state.** B on one state
shows the cost per state and how much the star input actually improves the backtest. If it barely improves it, the
results rating plus history is enough and neither route is worth paying for. Until one route is ready, the formula
runs without the star input.

For B, the working sheet that names players stays private, outside the repo and any shared notes, readable only by the
person rating; it is deleted once the counts are made. Only the counts reach the data files.

### 4.8 The risks, and the rules that contain them

- **They are minors.** Even unnamed, "a 5-star quarterback at a small school" points at one teenager. So nothing on
  any page, video, post or share card reflects an individual: no position-level lines ("strong at quarterback this
  year"), no "led by", no "inspired by". Pages talk only about the team's outcome.
- **The fine print stays true** ("All players, games and results are fictional"): generated names, generated numbers,
  no real player's position or jersey number called out.
- **Publicity rights and NIL:** using real athletes' achievements in a commercial product is the core of the
  right-of-publicity cases (the college football video game cases). Counts inside a formula, with nothing displayed,
  is far from that, but a lawyer should look at it with the playoff-rights review (section 5).
- **Leaks through the numbers:** if one 5-star transfer moves a small school from "No playoffs" to "Playoffs", fans may
  connect the dots. The per-team cap limits that; the build can also flag any school whose outlook moves mostly
  because of the star input, for a person to look at.

---

## 5. Risk: playoff rights

### What the associations own

- **Their playoffs as events:** associations sell exclusive rights to broadcast and stream their tournament games. In
  *WIAA v. Gannett* (7th Cir. 2011) the court upheld Wisconsin's exclusive streaming deal; it stressed that broadcasting
  an event is not the same as reporting on or describing it. A simulation that uses no footage, no live account and
  no real players is neither a broadcast nor a stream of their event.
- **Their names and logos are trademarks:** for example the WIAA says its name, emblem and logos are registered
  marks; the IHSA requires written approval for any use of its marks; the UIL has a logo-use request and requires
  written permission for photos and video from its state events. Championship event names and trophies are branded.
- **Venues are other brands:** "AT&T Stadium", "Mercedes-Benz Stadium" and "Hancock Whitney Stadium" are sponsors'
  names.

### What is safe, what to avoid

| Safe (facts, plainly stated) | Avoid |
| --- | --- |
| "Texas 6A Division I", "Georgia Class 7A" (classification labels describe a group of schools) | The associations' logos, trophies, medal designs or event branding |
| Naming the association as a fact in small text ("Valdosta plays in the GHSA's Class 7A") | Association names in video titles, thumbnails or the headline |
| Real champions and scores (facts) | Footage, photos or broadcast graphics from real games |
| "State champion", "state final", "win state" (ordinary words) | "Official", "UIL State Championship", "presented by", anything that implies a partnership |
| "Football Coach's state final", "Simulated in Football Coach" | Venue names and images in videos (text mention on the page is lower risk; see Decisions) |

### Recommended wording and limits for the December state-final videos

- Title: "Football Coach's Texas 6A Division I final: Duncanville vs. North Shore" (no association name, no venue).
- First and last frame, and the caption: "Simulated in Football Coach High School Edition. Not a real game."
- Fictional players only; the game's own field, uniforms in school colors, no school logos.
- Post before the real final as a preview ("what Football Coach says"), never styled as a broadcast or a highlight of the
  real game, and never posted as if it were the result.
- No betting language, no sportsbook ads or links.
- One school's fans get the clip from the game's accounts; don't tag the association or ask for its promotion.
- Remove a clip quickly if an association or school asks; keep a contact address in the channel bio.
- Before the first December run, a one-hour review by a sports or IP lawyer of these limits. (Not legal advice: this
  plan is a reading of public cases and policies.)

The live pages already name venues ("lift the state trophy at Mercedes-Benz Stadium"). As text this is a nominative
mention of a fact; it is low risk but not zero. See Decisions.

---

## 6. Private school leagues

Some target states run private schools in their own associations, each with its own classifications and champions;
in most states the private schools play in the main association. To verify state by state when the data is collected:

| Pattern | States (to verify) | How it fits |
| --- | --- | --- |
| Separate private associations with their own champions | Texas (TAPPS; SPC), Georgia (GIAA), Alabama (AISA), Mississippi (MAIS), North Carolina (NCISAA), South Carolina (SCISA), Virginia (VISAA), New York (Catholic league, independent schools) | Each association is its own set of classifications in the state's data, with its own playoff rules |
| Private schools in the main association but in their own divisions | Tennessee (Division II), Louisiana (select divisions), New Jersey (non-public groups) | Just more classifications in the main association |
| Private schools mixed in (sometimes with an enrollment multiplier) | California, Ohio, Pennsylvania, Michigan, Illinois, Florida, Missouri, Wisconsin, Minnesota, Indiana, Iowa, Kansas, Nebraska, Oklahoma, Washington, Massachusetts | No change |

Structure:
- **Data:** each state's data gets an `association` level above classifications (`association > classification >
  region > district > school`). `src/sim/stateRules.ts` gets rules per association (playoff size, divisions, title game).
- **Addresses:** the school's pages keep `state` and `school` (3.3) whatever its association (a fan searches the
  school, not the league). Classification hubs are `/<state>/<classification>/`; a private classification takes a plain name
  (`/texas/private-division-1/`), with the association named in small text on the page.
- **Pages:** the state hub lists the public classifications first, then the private ones, each with its own
  champion. The school page reads the same either way ("Can you help Dallas Jesuit win state?" works for TAPPS too).
- **The game:** a career at a private school plays its association's season and playoffs. Private schools recruit
  differently in real life; the game can keep its one recruiting model at first.
- **6-man and 8-man:** out of scope (11-man only). Texas 1A, and many small private leagues, play 6-man: they're left
  out of the data, not shown as empty.

---

## 7. Rollout: one state at a time

1. **Build the machine on the 12 states the game has** (the top classes it already plays): the outlook runner (3.1),
   the template, the edge renderer (if B), the hubs, the sameness guard. Move the 5 live pages onto it. Publish only
   the classes the game plays. In parallel: ask for star-rating license quotes, and build the results agent (3.2) and
   the strength formula's backtest on last season.
2. **Pilot state (recommended: Alabama).** Mid-sized, one association's public classes plus a private league (AISA),
   clean published results, and already a live page. Add its other classifications to the game, publish every school
   page and hub, submit `/sitemaps/alabama.xml` in Search Console.
3. **Watch for 4-6 weeks** (Search Console, Pages report): indexed vs. "Crawled - currently not indexed" and
   "Discovered - currently not indexed", impressions per page, and careers started per page (the GA events). Gate to
   go on: most pages indexed and impressions rising. If many pages sit in "Crawled - not indexed", the content is
   seen as thin: add facts or fix sameness before the next state.
4. **Then states in waves**, a few at a time, largest audiences first, each with its sitemap submitted on release.
5. **Season calendar:** the results agent gathers 2027 schedules over the summer; outlooks and top 10s published in
   late July 2027 (before the season, when fans search); from late August the agent runs every weekend and the
   outlooks and Week N picks refresh, pilot states first; the December state-final videos (with the limits in 5).

Timeline sketch: data and template now to February 2027; pilot March to April; waves May to July; preseason content
late July; in-season content August to December.

---

## 8. Decisions

Settled by the user on 2026-11-20:
- The simulations run in a standalone script with options for states, classifications and seasons per school (3.1).
- In-season records, results and rankings for every team come from a results agent (3.2).
- Football Coach is the voice; no "sim" character. Headline: "We simulated the rest of the 2027 season. Here is what
  we found:". No "Friday Night Sim" label on school pages.
- The outlook always says whether Football Coach has the team in the playoffs.
- The season in a minute lists every game with its score, regular season and playoffs apart; its control reads
  "Replay season".
- The season in a minute is Football Coach's forecast built from all the simulated seasons, not one season. The
  playoffs part and the verdict stay hidden until the regular season has played (suspense); "🔄 Replay season".
  Powerhouses also get national top 25 and national title lines.
- In season the season in a minute shows the games already played (real score and Football Coach's pick) and
  forecasts from the current week. On the scoreboard the home team is at the bottom, with no "Home" label. Rivalry
  games are marked in the regular season only, never in the playoffs.
- Star ratings are an input to the hidden strength formula, never shown (section 4); license them or rate them
  ourselves.
- Each school gets two pages (2.0): a landing page for marketing, with its own button, and an outlook page with the
  information: the outlook, the season in a minute and "You can do it."
- Strength must come from current information, not the program's prestige alone (4.0-4.1).
- The user supplies the star ratings, as the CSV file in 4.3.
- No file per school (3.3): the landing page is `/team_page/?state=ga&school=valdosta&v=direct` and the outlook page
  `/forecast/?state=ga&school=valdosta&v=direct&year=2027&type=base`; `type=base` is today's style, more to come.

Still open:
1. **Approve the page designs** (the mockups, latest version).
2. **Addresses (3.3):** your example spells the outlook path `/forcast/`; the plan and mockup use `/forecast/` so
   it reads right to fans. Confirm? Who fills the pages: a small Worker (recommended) or the browser? The 5 old
   addresses: redirect with `v=direct`, or their own tag (`v=old_page`) to count them apart? Hubs: keep
   `/texas/6a-division-1/` as path addresses (recommended, about 830 static files), or the same pattern
   (`/classification/?state=tx&class=6a-division-1&v=direct&year=2027`)?
3. **The landing page in search:** kept out (`noindex`, recommended), or let in?
4. **A link from the landing page to the outlook page:** none, so the button is its only choice (recommended, shown),
   or a small "Football Coach's 2027 outlook" text link?
5. **Preseason headline:** "We simulated Valdosta's 2027 season. Here is what we found:" (the in-season wording, used
   before the season too).
6. **The playoff verdict words:** "Playoffs" / "Long shot" / "No playoffs", or add "On the bubble"?
7. **The forecast's record:** the picks' total can differ by a game from the outlook's "Most years" record. Use the
   picks' total in both places so the page never disagrees with itself? Show the most likely playoff opponents ("most
   likely at Carrollton"), or only the round where it ends?
8. **National lines:** how often must a team reach the national top 25 in the runs before its page shows the national
   lines (suggested: 1 run in 10)? And `--national` runs every state's top classifications together, which costs more
   per run (to measure).
9. **Title counts on school pages** ("In 10,000 seasons, Cypress Lakes won state 4 times"): allowed, or only the
   "average coach" line?
10. **Scores feed (3.4):** ask ScoreStream and PlayOn (MaxPreps) for quotes on 3 seasons of backfill plus 2027 weekly?
   Until then, the backtest uses the states whose association publishes every score.
11. **Cloudflare plan:** which plan is the account on? (With shared pages, either works.)
   **Current strength (4.1):** agree to the rating kept apart from prestige, updated weekly from real scores, with
   the backtest on 2025 and 2026 before launch? Should it also refresh each school's prestige in the game once a
   year?
12. **The "average coach" number:** AI-only multi-season worlds for every school, calibrated with the bot harness? It
   waits for the recruiting fix.
13. **The results agent:** run it as a Claude Code scheduled task on this computer, or as a cloud routine? Who reviews
   its weekly report?
14. **Venue names on the pages** ("lift the state trophy at AT&T Stadium"): keep in page text, or switch to "lift the
    state trophy"? (Recommended: keep text mentions, never in videos.)
15. **December videos:** agree to the wording and limits in 5, and to a short lawyer's review (with the star-input
    question) before the first one?
16. **Pilot state:** Alabama, or another?
17. **Maryland:** it is in the game but not on the target list. Keep building its pages?
18. **The hub page's one button:** "Share the top 10" (shown), or "Coach a team in [class]"?
19. **The montage:** play by itself when scrolled into view (silent, respects reduced motion), or wait for a tap?
20. **Footer links on the outlook page** (state, classification, district rivals in small text under the button), or
   none? The landing page has none either way.
21. **Coaches who took over (2.9):** show the best run with the player's coach name when they chose to show it on the
    leaderboard, or counts only?

## Sources (checked 2026-11-20)

- Preseason inputs and calendars (3.4), checked 2026-11-20:
  NCES Common Core of Data files: https://nces.ed.gov/ccd/files.asp and
  https://ies.ed.gov/use-work/resource-library/data/data-file/2024-25-common-core-data-ccd-preliminary-directory-files;
  UIL 2026-28 realignment: https://www.uiltexas.org/press-releases/detail/2026-2028-uil-reclassification-and-realignment-information
  and https://www.uiltexas.org/alignments;
  GHSA 2026-28 regions: https://www.ghsa.net/reclassification and
  https://www.ajc.com/sports/2025/11/tentative-ghsa-region-alignments-for-2026-28-announced-after-classes-settled;
  FHSAA 2026-28: https://fhsaa.com/news/2025/12/17/football-classifications-available-for-2026-27-2027-28.aspx and
  https://fhsaa.com/news/2026/2/13/football-classifications-available-for-2026-27and2027-28.aspx;
  AHSAA 2026-28: https://www.villagelivingonline.com/sports/ahsaa-releases-new-alignments-for-upcoming-school-years/;
  PIAA 2026-28: https://tribhssn.triblive.com/new-piaa-classification-parameters-move-11-time-wpial-champion-thomas-jefferson-to-5a-football;
  NCHSAA 2025-29: https://www.nchsaa.org/wp-content/uploads/2025/03/V2-NCHSAA-Board-of-Directors-Approved-2025-2029-Realignment.pdf;
  OHSAA 2026 divisions: https://www.ohsaa.org/news-media/ohsaa-announces-2026-football-divisions-and-regions and
  https://www.ohsaa.org/news-media/eight-schools-opt-up-to-ohsaa-division-i-football;
  MHSAA 2026-27: https://www.mhsaa.com/topics/mhsaa-news/mhsaa-2026-27-school-year-classifications-announced;
  Iowa IHSAA schedules: https://www.iahsaa.org/football-2025-2026-schedules/;
  NSAA schedules: https://www.anewspaper.net/article/1776,nsaa-releases-2026-2027-football-schedules;
  IHSA classes after the regular season: https://ihsa.org/data/fb/playoffs.htm;
  CIF Southern Section divisions from computer rankings: https://cifss.org/wp-content/uploads/2016/09/2025Football11Man-Bulletin-1.pdf;
  ScoreStream API: https://blog.scorestream.com/category/scorestream-2; PlayOn and MaxPreps:
  https://blog.playonsports.com/playon-acquires-maxpreps-to-elevate-the-high-school-sports-fan-experience

- Cloudflare static asset limits: https://developers.cloudflare.com/changelog/2025-09-02-increased-static-asset-limits/
  and https://developers.cloudflare.com/workers/platform/limits
- Google spam policies (scaled content abuse, since March 2024):
  https://developers.google.com/search/blog/2024/03/core-update-spam-policies
- *WIAA v. Gannett*, 7th Cir. 2011: https://law.justia.com/cases/federal/appellate-courts/ca7/10-2627/10-2627-2011-08-24-opinion-2011-08-24.html
- UIL media policies and logo request: https://www.uiltexas.org/media
- IHSA royalty and trademark policy: https://ihsa.org/documents/forms/2011-12/royalty_policy.pdf
- WIAA licensing and royalty policy: https://www.wiaawi.org/Portals/0/PDF/Marketing/Licensing%20and%20Royalties/WIAALicensingRoyaltyPolicy2025-26.pdf
- 247Sports subscription terms: https://legal.paramount.com/us/en/cbsi/247sports-terms-of-use
