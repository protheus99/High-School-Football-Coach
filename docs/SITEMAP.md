# Site map

Written by `node scripts/site-map/build.mjs` from `scripts/site-map/pages.mjs`. Don't edit this file by hand.

The game is one address (`/`). Its screens (Hub, Team, Rankings, Leaders, Prospects, News) have no addresses of
their own, so the sitemap lists the game once. Everything else is a static page in `public/`.

## The rules, by kind of page

Index: listed in the sitemap and open to search engines. Vendors: outside vendors may link to it, send traffic or ads
to it, or feature it. A page that isn't built yet allows neither.

| Kind | Index | Vendors | What it is |
| --- | --- | --- | --- |
| game | yes | yes | The game itself (one address; its screens have no addresses of their own) |
| info | yes | yes | About the game |
| legal | yes | no | Privacy and terms: open to read, not for promotion |
| school | yes | yes | One page per school: "Can you help ... win state?" |
| start | no | no | A school page's "what to expect" step: reached only from its school page (and part of a test); the page carries noindex |
| private | no | no | Test tools and match data: blocked in robots.txt |

Exceptions (`OVERRIDES` in `pages.mjs`): none.


## What vendors get

- `https://footballcoachgame.com/vendor-pages.json`: every page they may use, with the rules (7 pages today).
- `https://footballcoachgame.com/sitemap.xml`: what search engines may list, split into one file per state.
- `docs/site-pages.csv` (not on the site): every page, live or planned, for a spreadsheet.

## Live pages (16)

| Address | Title | Kind | Index | Vendors |
| --- | --- | --- | --- | --- |
| `/` | Football Coach High School Football Sim | game | yes | yes |
| `/about` | About the Game | info | yes | yes |
| `/privacy` | Privacy Policy | legal | yes | no |
| `/terms` | Terms of Service | legal | yes | no |
| `/replay-data/` | Match field play data | private | no | no |
| `/playtest/` | Playtest pages | private | no | no |
| `/alabama/thompson/` | Can you help Thompson High School build a dynasty? | school | yes | yes |
| `/alabama/thompson/start/` | Welcome to Thompson High School, Coach | start | no | no |
| `/california/folsom/` | Can you help Folsom High School win state? | school | yes | yes |
| `/california/folsom/start/` | Welcome to Folsom High School, Coach | start | no | no |
| `/florida/jupiter/` | Can you help Jupiter High School win state? | school | yes | yes |
| `/florida/jupiter/start/` | Welcome to Jupiter High School, Coach | start | no | no |
| `/georgia/valdosta/` | Can you help Valdosta High School win state? | school | yes | yes |
| `/georgia/valdosta/start/` | Welcome to Valdosta High School, Coach | start | no | no |
| `/texas/cypress-lakes/` | Can you help Cypress Lakes High School win state? | school | yes | yes |
| `/texas/cypress-lakes/start/` | Welcome to Cypress Lakes High School, Coach | start | no | no |

## School pages by state (5 of 916 built)

Every school in the game already has its address: `/<state>/<school>/`, in lowercase with hyphens
("St. Peter's Prep" → `st-peter-s-prep`). A page goes live, and into its state's sitemap, once
`scripts/team-pages/build.mjs` builds it.

| State | Built | Schools | Sitemap |
| --- | --- | --- | --- |
| Alabama | 1 | 34 | `/sitemaps/alabama.xml` |
| California | 1 | 86 | `/sitemaps/california.xml` |
| Florida | 1 | 93 | `/sitemaps/florida.xml` |
| Georgia | 1 | 52 | `/sitemaps/georgia.xml` |
| Louisiana | 0 | 68 | none yet |
| Maryland | 0 | 32 | none yet |
| New Jersey | 0 | 59 | none yet |
| North Carolina | 0 | 36 | none yet |
| Ohio | 0 | 70 | none yet |
| Pennsylvania | 0 | 74 | none yet |
| Tennessee | 0 | 58 | none yet |
| Texas | 1 | 254 | `/sitemaps/texas.xml` |
