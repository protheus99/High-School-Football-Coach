# One page per school: unique content from the game's simulation

Status: plan only (2026-11-20). Nothing here is built. The page designs need the user's approval (mockups first, per
CLAUDE.md) before any production page is written.

Goal: one page for every 11-man high school in the target states, listed by classification, each classification with
its own state champion. Every page pitches taking over that school ("Can you help Valdosta High School win state?")
and carries content about that school that only this game can make: what its own simulation says about the school's
season. The test: a reader who swaps two school pages should find different facts, different numbers, different
opponents and a different story on each, not the same paragraph with a new name.

Copy rules for everything below (public copy): fan language, not game terms or stats (no prestige, ratings or
percentages); one decision and one button per school page; "playoffs", never the b-word; never the number of states;
prospects "join your school"; never name an outside source of the play data.

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

### 2.1 ★ The season outlook: "We simulated [school]'s 2027 season 10,000 times"

What the page says (fan language, one idea per line):
- **Most years:** the typical record ("Most years: 8-2").
- **How far:** the round where most seasons end ("Most years the season ends in the second round of the playoffs" /
  "Most years they miss the playoffs").
- **State titles:** as a count or "1 in N" ("In 10,000 seasons, Cypress Lakes won state 4 times." / "Valdosta wins
  state about once every 30 seasons."). Counts read like fan talk and are not percentages. (Decision: is "1 in N" OK
  here? The title-odds plan already approved "1 in N".)
- **The game that decides the season:** the closest game on the schedule, named ("The Winnersville Classic against
  Lowndes is a coin flip").
- **Best and worst seasons we saw:** "Best: 14-0, state champions. Worst: 3-7."
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

One simulated season (the run closest to the school's typical season) played as a 15-second scoreboard: week by week,
the opponent, the score ticking up, the record growing, then the playoff run and how it ends. Template, not a match
replay: an HTML/CSS animation fed by about 20 numbers.

Unique per school: its real district opponents, its scores, its ending.

Cost, by format:
- **On the page (recommended for all):** CSS + a few lines of JS in the shared `team.js`; the data is in the
  school's page data. Zero production cost per school.
- **As MP4 for social:** a headless browser records the same animation: about 20 s per school, so 12,000 schools =
  about 65 machine-hours. Make the MP4 only for share moments (the top 10s, a requested school, the rivalry weeks).

Refresh: with the outlook (yearly); in season the montage can switch to "the rest of the season", from the real record
so far (needs real results; see 2.4).

Risk: none for search (it is the same data as 2.1). Video on the page should not autoplay sound (it has none) and must
respect reduced motion.

### 2.3 ★ Preseason top 10 per classification (the hub pages)

`/texas/6a-division-1/`: "Texas 6A Division I: the sim's 2027 preseason top 10". Ten cards, each with the school, a
one-line fan reason ("Wins it all more often than anyone"), and its typical record. Every other team in the class
follows, by district, each linking to its school page.

Unique: each classification is a different set of teams and a different order. A ranking is a natural share ("the sim
has us at #4?!"), so each hub gets a share card image (1200x630) of its top 10.

Cost: free once 2.1 exists (sorting). Share images: about 800 classifications x 1 image, generated at build.

Refresh: preseason (late July); then weekly in season if Friday Night Sim runs (see 2.4).

Risk: low, if each hub carries every school in the class (a list of links with real facts, not a doorway page). Hubs
are where search engines find the school pages; they are the internal links that make 12,000 pages crawlable.

### 2.4 Friday Night Sim: weekly sim picks for real games

Each week of the real 2027 season: "The sim's picks for Week 6", every real game in the classification, the sim's pick
and how close ("Lowndes, in a close one"). The school page gets one line: "This Friday: Valdosta at Lowndes. The sim
likes Lowndes, barely."

Unique: by school and by week; and fresh, which search engines reward on game weeks.

Cost: the sims are seconds. The data is the real problem: **real 2027 schedules and weekly results for 12,000
schools.** Associations publish schedules and scores unevenly; the big aggregators forbid scraping. Real results also
let the sim correct itself week to week (a 0-3 team's outlook should fall).

Recommendation: start small. In 2027 run Friday Night Sim for **the top 10 games of the week per state** (hand-picked
from public schedules, about 270 games a week across the target states, or fewer: the pilot states only). Grow it only if
the pages earn traffic. Keep the copy "the sim's pick", never odds, spreads or anything that reads like betting (high
school sports betting is banned or restricted in many states; no sportsbook links or ads ever).

Refresh: weekly, Monday to Thursday. Risk: low for search; moderate work.

### 2.5 ★ State and classification hubs

- `/texas/` (state hub): every classification and association in the state, its champion last season (real fact,
  from the association's published results), the sim's preseason favorite, links down to each classification hub.
- `/texas/6a-division-1/` (classification hub): 2.3.
- School pages link up to their classification hub and across to their district rivals' pages ("Also in District
  11-6A: DeSoto, Lancaster, ...").

This is the page structure that keeps everything linked: state > classification > school, and school <-> district.
About 27 state hubs + about 800 classification hubs (to count) + 12,000 schools.

### 2.6 New: the district race

"District 11-6A: who the sim has winning it". The district's teams in the sim's order, the typical district record of
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
the school, not the game's generic image. Cost: generated at build (an SVG template rendered to PNG/WebP: about 12,000
images, minutes) or by an image Worker on request. Counts against the file limit if static (see 3).

### 2.11 The story lines, without hand-writing 12,000 stories

Today each story is hand-written. At scale the story card is chosen by rules from the school's facts and sim results,
with several wordings per situation:

| Situation (from facts + sim) | Example headline |
| --- | --- |
| Powerhouse (wins state often in the sim, many real titles) | "Thompson has been great. You can be better." |
| Fallen power (many real titles, none lately, middling outlook) | "Valdosta used to own Georgia." |
| Always close (playoffs most years, rarely past the semifinal) | "The Bulldogs get close every year." |
| Long shot (misses the playoffs most years) | "Nobody picks the Spartans." |
| Never won state (real fact) | "Cypress Lakes has never won state." |
| New school (opened recently) | "Nobody has won state here. Be the first." |

Hand-written stories stay for the programs worth it (the 48 scenario programs and any school that sends traffic).

**The sameness guard:** the build measures how alike the pages are. It strips the school's own names, splits each
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
| Friday Night Sim | week, game | sims free; schedules costly | weekly | low |
| ★ State and class hubs | membership | free | yearly | low (with full lists) |
| District race | district | free | yearly | low |
| Rivalry outlook | pair | free + rivalry names | yearly | none |
| Real program facts | school | data collection | yearly | none |
| Coaches who took over | players' careers | one read per build | per build | none |
| Share images | school | minutes at build | yearly | none |

---

## 3. How the pages are served

Cloudflare's current limit (checked 2026-11-20): **20,000 static files per Worker version on the free plan, 100,000 on
paid plans** (raised from 20,000 on 2025-09-02; needs Wrangler 4.34.0 or newer); 25 MiB per file. Pages sites follow
the same split. Which plan the game's account is on decides option A.

At full size, static files would be: about 12,000 school pages + 12,000 `start/` steps + about 830 hubs + about 12,800
share images + the game's own files: about 38,000. Over the free limit, inside the paid one.

| Option | How | For | Against |
| --- | --- | --- | --- |
| A. Static files (today's way, scaled) | `build.mjs` writes every page into `public/` | Simplest; fastest pages; nothing new to run | ~38,000 files (paid plan needed); every refresh re-uploads thousands of files; the build and repo get heavy |
| B. Edge-rendered | A Worker in front of the assets renders `/<state>/<school>/` from one data file per state (about 27 JSON files) and one template; Cloudflare's cache keeps each page | Few files; a refresh (weekly picks) replaces a few JSON files; one template for all; share images rendered the same way | New code that runs per request (Workers free plan: 100,000 requests a day; paid: $5 a month for 10 million); a bug breaks every page at once |
| C. One page for all, filled by JavaScript | `/<state>/<school>/` serves one HTML file that fetches the school's data | Fewest files | Search engines index JavaScript-filled pages slower and less reliably; risky for a program whose whole point is search |

**Recommendation: B, edge-rendered**, with the HTML identical to today's static pages (search engines see full HTML,
no JavaScript needed). Concretely: `wrangler.jsonc` gets a small `main` script with `run_worker_first` limited to the
state paths, so the game and other files stay plain static assets; the per-state data files ship as assets; pages are
cached at the edge and purged on each data update. The `start/` step becomes one shared page (`/start/?state=&school=`,
already noindex) instead of 12,000 copies. The 5 live pages keep their addresses and are moved over to the template.

If the user prefers no server code: A on the paid plan, with the `start/` copies merged into one page (about 26,000
files), works too.

Address rules at scale: school slugs are unique within a state. Many names repeat ("Central", "Lincoln"); a repeated
name takes its city (`/georgia/central-macon/`). The 5 live addresses never change. A school slug can't equal a hub
slug (the build checks).

---

## 4. Team strength from star-rated players (inside the sim only)

### The idea

If a school has, say, a 5-star prospect at quarterback, the sim gives that team a strong fictional quarterback. The
real player is never named, shown, highlighted or hinted at anywhere.

### Data shape (no names, no IDs)

```json
{ "season": 2027, "state": "Texas", "school": "Duncanville",
  "stars": { "QB": { "5": 0, "4": 1, "3": 1 }, "WR": { "4": 2 }, "DL": { "5": 1, "3": 2 } } }
```

Counts per school, position group and star tier, for one season. No name, class year, player ID, height or link: once
the counts are made the source list is thrown away.

### How the game would use it

`generateDistrictTeams` (`src/generators/rosterGenerator.ts`) already rolls every roster from the school's prestige
(`programTalent`). With star counts, for each count it makes one generated player at that position with an overall
from a star map (for example 5 stars 88-94, 4 stars 80-86, 3 stars 72-78, against starters at about 66), a random class
year and a generated name. Everything else stays as it is. Effect: the macro sim uses the lineup's average
(`teamStarterRating`), so one 5-star starter lifts a team about 1-1.5 rating points (about 5-7 points of margin a game,
at 4.5 points per rating point). A cap per team keeps a single star from deciding a classification.

### Can the ratings be sourced?

Not from the recruiting sites, as things stand. Their star ratings are their own editorial product; their terms limit
use to personal, non-commercial use, and their sites forbid scraping. Using them to power a commercial game, even as
counts, needs a data license. (Checked: 247Sports' subscription terms say the site and content are for "non-commercial
entertainment".) A license may exist through their data businesses, but the price and terms are unknown.

### The risks

- **They are minors.** Even unnamed, "a 5-star quarterback at a small school" identifies one teenager. Any line on the
  page that reflects him ("strong at quarterback this year") points at a real kid. So the inputs may never shape
  position-level copy: pages talk only about the team's outcome.
- **The fine print says "All players, games and results are fictional."** It stays true only if the real players
  never surface: generated names, no matching positions or numbers called out, no "inspired by".
- **Publicity rights and NIL:** using a real athlete's achievements in a commercial product is the core of right-of-
  publicity cases (the college football video game cases). Counts with no names reduce it but don't remove it.

### Recommendation: don't use star ratings at launch

Use these instead, all public and about teams, not players:
1. **A team power rating from public results.** The associations publish scores and champions. A rating fitted to the
   last 3-5 seasons of scores (Elo-style, margin capped) says how strong a program is now. Scores are facts; collect
   them from the associations' published results, not from sites whose terms forbid it.
2. **Program history:** state titles, playoff runs, recent records (the same facts as 2.8).
3. **Enrollment and classification** (the association's own data).

These become the school's starting prestige in the game, the same way prestige is estimated today. Revisit star counts
only with a license and a lawyer's review, and even then only as counts inside the sim.

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
| "The sim's state final", "Simulated in Football Coach" | Venue names and images in videos (text mention on the page is lower risk; see Decisions) |

### Recommended wording and limits for the December state-final videos

- Title: "The sim's Texas 6A Division I final: Duncanville vs. North Shore" (no association name, no venue).
- First and last frame, and the caption: "Simulated in Football Coach High School Edition. Not a real game."
- Fictional players only; the game's own field, uniforms in school colors, no school logos.
- Post before the real final as a preview ("what the sim says"), never styled as a broadcast or a highlight of the
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
- **Addresses:** the school page stays `/<state>/<school>/` whatever its association (a fan searches the school, not
  the league). Classification hubs are `/<state>/<classification>/`; a private classification takes a plain name
  (`/texas/private-division-1/`), with the association named in small text on the page.
- **Pages:** the state hub lists the public classifications first, then the private ones, each with its own
  champion. The school page reads the same either way ("Can you help Dallas Jesuit win state?" works for TAPPS too).
- **The game:** a career at a private school plays its association's season and playoffs. Private schools recruit
  differently in real life; the game can keep its one recruiting model at first.
- **6-man and 8-man:** out of scope (11-man only). Texas 1A, and many small private leagues, play 6-man: they're left
  out of the data, not shown as empty.

---

## 7. Rollout: one state at a time

1. **Build the machine on the 12 states the game has** (the top classes it already plays): the template, the edge
   renderer (if B), the outlook run, the hubs, the sameness guard. Move the 5 live pages onto it. Publish only the
   classes the game plays.
2. **Pilot state (recommended: Alabama).** Mid-sized, one association's public classes plus a private league (AISA),
   clean published results, and already a live page. Add its other classifications to the game, publish every school
   page and hub, submit `/sitemaps/alabama.xml` in Search Console.
3. **Watch for 4-6 weeks** (Search Console, Pages report): indexed vs. "Crawled - currently not indexed" and
   "Discovered - currently not indexed", impressions per page, and careers started per page (the GA events). Gate to
   go on: most pages indexed and impressions rising. If many pages sit in "Crawled - not indexed", the content is
   seen as thin: add facts or fix sameness before the next state.
4. **Then states in waves**, a few at a time, largest audiences first, each with its sitemap submitted on release.
5. **Season calendar:** outlook and top 10s published in late July 2027 (before the season, when fans search);
   Friday Night Sim from late August for the pilot states; the December state-final videos (with the limits in 5).

Timeline sketch: data and template now to February 2027; pilot March to April; waves May to July; preseason content
late July; in-season content August to December.

---

## 8. Decisions for the user

1. **Approve the two page designs** (the mockups: school page with the outlook, classification page with the top 10).
2. **"1 in N" and counts on school pages** ("In 10,000 seasons, Cypress Lakes won state 4 times"): allowed, or only the
   "average coach" line?
3. **Serving:** B (edge-rendered, recommended) or A (static files)? Which Cloudflare plan is the account on?
4. **The "average coach" number:** way B (AI-only worlds) for every school, calibrated with the bot harness? It waits
   for the recruiting fix.
5. **Star ratings:** agree to leave them out at launch and use public team results plus program history?
6. **Venue names on the pages** ("lift the state trophy at AT&T Stadium"): keep in page text, or switch to "lift the
   state trophy"? (Recommended: keep text mentions, never in videos.)
7. **December videos:** agree to the wording and limits in 5, and to a short lawyer's review before the first one?
8. **Friday Night Sim scope:** top 10 games a week in the pilot states, or wait for 2028?
9. **Pilot state:** Alabama, or another?
10. **Maryland:** it is in the game but not on the target list. Keep building its pages?
11. **The hub page's one button:** "Share the top 10" (recommended: the hub's job is sharing and linking to schools),
    or "Coach a team in [class]"?
12. **The montage:** play by itself when scrolled into view (silent, respects reduced motion), or wait for a tap?
13. **Coaches who took over (2.9):** show the best run with the player's coach name when they chose to show it on the
    leaderboard, or counts only?

## Sources (checked 2026-11-20)

- Cloudflare static asset limits: https://developers.cloudflare.com/changelog/2025-09-02-increased-static-asset-limits/
  and https://developers.cloudflare.com/workers/platform/limits
- Google spam policies (scaled content abuse, since March 2024):
  https://developers.google.com/search/blog/2024/03/core-update-spam-policies
- *WIAA v. Gannett*, 7th Cir. 2011: https://law.justia.com/cases/federal/appellate-courts/ca7/10-2627/10-2627-2011-08-24-opinion-2011-08-24.html
- UIL media policies and logo request: https://www.uiltexas.org/media
- IHSA royalty and trademark policy: https://ihsa.org/documents/forms/2011-12/royalty_policy.pdf
- WIAA licensing and royalty policy: https://www.wiaawi.org/Portals/0/PDF/Marketing/Licensing%20and%20Royalties/WIAALicensingRoyaltyPolicy2025-26.pdf
- 247Sports subscription terms: https://legal.paramount.com/us/en/cbsi/247sports-terms-of-use
