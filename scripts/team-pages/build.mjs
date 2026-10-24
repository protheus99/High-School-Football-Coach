// Writes the team pages: public/<state>/<school>/index.html ("Can you help ... win state?") and its start/ page
// ("what to expect", then New Game). Run it after changing the teams below: `node scripts/team-pages/build.mjs`.
// The pages share public/team-pages/team.css and team.js. Copy rules: written for the team's fans, no game terms or
// stats, never the word "bracket", never the number of states.
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://footballcoachgame.com';

// The state's data file in src/data (the same list the game plays)
const DATA = { Alabama: 'alabama-6a', California: 'california-open', Florida: 'florida-6a', Georgia: 'georgia-7a', Texas: 'texas-6a' };

const CLOSE = (venue) => `Find the best prospects and convince them to join your school. Call the plays on Friday night. Win the playoffs and lift the state trophy at ${venue}.`;
const CLOSE_DYNASTY = 'Find the best prospects and convince them to join your school. Call the plays on Friday night. Win state, win it again, and chase a national title.';

// The marketing test pages (2026-10-24): a powerhouse, a rebuilder and three schools picked at random.
// school: the name in the game's data; full: the headline name; short: the button name (16 letters at most);
// venue: the state's title game stadium (the game's state rules).
const TEAMS = [
  {
    state: 'Alabama', school: 'Thompson', full: 'Thompson High School', short: 'Thompson', scenario: 'POWERHOUSE', goal: 'build a dynasty',
    head: 'Thompson has been great. You can be better.',
    legacy: 'The Warriors established a modern Alabama dynasty, winning six state titles in seven seasons through 2025.',
    push: 'Six titles in seven seasons is the bar. Now raise it.',
    venue: 'Hancock Whitney Stadium', close: CLOSE_DYNASTY
  },
  {
    state: 'Georgia', school: 'Valdosta', full: 'Valdosta High School', short: 'Valdosta', scenario: 'RECLAIM',
    head: 'Valdosta used to own Georgia.',
    legacy: 'The Wildcats built a record-setting legacy, winning 22 Georgia state titles across several decades.',
    push: 'Those glory days feel a long way off. Bring the Wildcats back to the top.',
    venue: 'Mercedes-Benz Stadium'
  },
  {
    state: 'California', school: 'Folsom', full: 'Folsom High School', short: 'Folsom', scenario: 'OPEN',
    head: 'The Bulldogs get close every year.',
    legacy: 'They’re in the conversation every fall. Close doesn’t win a trophy.',
    push: 'Take them all the way.',
    venue: 'Saddleback College'
  },
  {
    state: 'Florida', school: 'Jupiter', full: 'Jupiter High School', short: 'Jupiter', scenario: 'OPEN',
    head: 'Jupiter is good enough to make the playoffs.',
    legacy: 'Good enough isn’t the goal. Every December, someone else lifts the trophy.',
    push: 'The Warriors don’t win it all. Yet.',
    venue: 'Pitbull Stadium'
  },
  {
    state: 'Texas', school: 'Cypress Lakes', full: 'Cypress Lakes High School', short: 'Cypress Lakes', scenario: 'OPEN',
    head: 'Nobody picks the Spartans.',
    legacy: 'Every Friday night, the other team is the favorite. Nobody in Texas expects Cypress Lakes to win a title.',
    push: 'Prove them wrong.',
    venue: 'AT&T Stadium'
  }
];

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function schoolData(state, name) {
  const data = JSON.parse(readFileSync(join(root, 'src', 'data', `${DATA[state]}.json`), 'utf8'));
  for (const region of data.regions) for (const district of region.districts) for (const s of district.schools) if (s.name === name) return s;
  throw new Error(`${name} is not in the ${state} data`);
}

// The school's second color names it in the headline when it reads on the darkened field; gold otherwise
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function head(t, title, description, path, color) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)} · Football Coach High School Edition</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${SITE}${path}" />
<link rel="icon" href="/favicon.ico" />
<meta name="theme-color" content="${color}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Football Coach High School Edition" />
<meta property="og:url" content="${SITE}${path}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${SITE}/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="stylesheet" href="/team-pages/team.css" />
</head>`;
}

const FINE = 'Football Coach High School Edition is an independent game, not affiliated with or endorsed by any school or athletic association. All players, games and results are fictional.';
const LOGO = '<a class="logo" href="/"><img src="/logo/football-coach-logo.webp" alt="Football Coach High School Edition" width="840" height="459" /></a>';

for (const t of TEAMS) {
  const s = schoolData(t.state, t.school);
  if (t.short.length > 16) throw new Error(`${t.short}: the button name is over 16 letters`);
  const stateSlug = slugify(t.state);
  const schoolSlug = slugify(t.school);
  const path = `/${stateSlug}/${schoolSlug}/`;
  const game = `/?state=${stateSlug}&school=${schoolSlug}&src=team_page`;
  const goal = t.goal ?? 'win state';
  const accent = luminance(s.secondaryColor) > 0.45 && s.secondaryColor.toUpperCase() !== '#FFFFFF' ? s.secondaryColor : '#FBBF24';
  const field = s.primaryColor;
  const edge = luminance(field) < 0.08 ? '#FBBF24' : field; // a black school color would vanish as a thin edge
  const data = `data-state="${esc(t.state)}" data-school="${esc(schoolSlug)}" data-scenario="${t.scenario}" data-game="${esc(game)}"`;
  const style = `--sc:${field};--accent:${accent};--edge:${edge}`;
  const title = `Can you help ${t.full} ${goal}?`;
  const description = `Can you help the ${t.short} ${s.mascot} ${goal}? Take over the program in Football Coach High School Edition.`;

  const teamPage = `${head(t, title, description, path, field)}
<body ${data} data-page="team" style="${style}">
<main>
  <section class="hero">
    ${LOGO}
    <h1>Can you help <em>${esc(t.full)}</em> ${esc(goal)}?</h1>
  </section>
  <section class="story">
    <h2>${esc(t.head)}</h2>
    <p class="legacy">${esc(t.legacy)}</p>
    <p class="push">${esc(t.push)}</p>
  </section>
  <section class="go">
    <h2>You can do it.</h2>
    <p>${esc(t.close ?? CLOSE(t.venue))}</p>
    <a class="play" id="go" href="start/">🏈 Coach ${esc(t.short)} now</a>
  </section>
  <p class="fine">${FINE}</p>
</main>
<script src="/team-pages/team.js"></script>
</body>
</html>
`;

  const steps = [
    ['Build your team', 'Find prospects, set the depth chart, pick your strategy.'],
    ['Coach them up', 'Run practice and set the tone for the season.'],
    ['Take the field', 'Call the plays on Friday night.'],
    ['Lead them to glory', t.goal ? `Win state at ${t.venue}, then win it again.` : `Win the playoffs and lift the trophy at ${t.venue}.`]
  ];
  const startPage = `${head(t, `Welcome to ${t.full}, Coach`, description, `${path}start/`, field)}
<body ${data} data-page="start" class="start" style="${style}">
<main>
  <section class="hero">
    ${LOGO}
    <h1>Welcome to <em>${esc(t.full)}</em>, Coach.</h1>
  </section>
  <section class="steps">
    <ol class="season">
${steps.map(([b, line], i) => `      <li><span class="n">${i + 1}</span><div><b>${esc(b)}</b><span class="t">${esc(line)}</span></div></li>`).join('\n')}
    </ol>
    <a class="play" id="go" href="${esc(game)}&amp;v=page">🏈 Let’s go</a>
    <p class="next">Next: name your coach and you’re on the sideline.</p>
  </section>
</main>
<script src="/team-pages/team.js"></script>
</body>
</html>
`;

  const dir = join(root, 'public', stateSlug, schoolSlug);
  mkdirSync(join(dir, 'start'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), teamPage);
  writeFileSync(join(dir, 'start', 'index.html'), startPage);
  console.log(`${path}  (${t.scenario})`);
}
