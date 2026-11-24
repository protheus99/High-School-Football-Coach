#!/usr/bin/env node
// Review the star ratings in a prospects export (one row per player per list) and turn them into
// the counts-only star file the team-strength plan uses (plan 4.3).
//
// Star ratings only feed a team's relative strength. Names, positions and links are used here to match the same
// player across lists, and are never written out: every output is counts per school, star tier and class.
//
// The export is large (100k+ rows), so the file is streamed once and never loaded whole.
//
//   node scripts/stars/review-stars.mjs <prospects.csv> [options]
//
// Options:
//   --out <dir>        Where to write the results (default: a "stars-review" folder next to the input file,
//                      outside the repo).
//   --season <year>    Football season for the counts file (default: the current one; a season starts in August).
//                      Players on that season's high school rosters are the classes season+1 .. season+4.
//   --states ga,tx     Only these states (default: all US states and DC).
//   --top <n>          How many rows in the report's top lists (default 25).
//   --teams <dir>      The game's team list used to fill school_id (default: src/data; see match-schools.mjs).
//
// Writes:
//   review.md                     The review, all totals: sources, matching, star mix, how often the lists agree,
//                                 star points by state and school.
//   stars-<season>-<date>.csv     Counts only (season,state,school_id,school,city,stars,count,grad_year,returning).
//
// Consensus stars: the median of the lists that rated the player (247Sports, On3, ESPN, Rivals; 0 or blank means not
// rated). A half (e.g. a 3 and a 4) rounds down, so one generous list can't lift a player a tier on its own.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { DEFAULT_TEAMS, matchFile, matchReport } from './match-schools.mjs';

// ---------- options ----------

const args = process.argv.slice(2);
const input = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!input) {
  console.error('Usage: node scripts/stars/review-stars.mjs <prospects.csv> [--out dir] [--season 2026] [--states ga,tx] [--top 25]');
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const now = new Date();
const season = Number(opt('season', now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1));
const topN = Number(opt('top', 25));
const outDir = path.resolve(opt('out', path.join(path.dirname(path.resolve(input)), 'stars-review')));
const onlyStates = opt('states', '') ? new Set(opt('states', '').toLowerCase().split(',').map((s) => s.trim())) : null;
const today = now.toISOString().slice(0, 10);
const rosterClasses = [season + 1, season + 2, season + 3, season + 4];

// ---------- constants ----------

const US_STATES = new Set(
  ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR ' +
    'PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' '),
);

// A few rows are coaches (their job sits in the position column); they aren't players, so they're left out.
const COACH_CODES = new Set(['HC', 'AC', 'OLC', 'DC', 'SC', 'WRC']);

const RATERS = ['247', 'on3', 'espn', 'rivals'];
const RATER_LABEL = { 247: '247Sports', on3: 'On3', espn: 'ESPN', rivals: 'Rivals' };

// ---------- CSV ----------

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
const quotesOpen = (s) => (s.match(/"/g) || []).length % 2 === 1;
const csvCell = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells) => cells.map(csvCell).join(',');

async function* readRows(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header = null;
  let pending = '';
  for await (const raw of rl) {
    const line = pending ? `${pending}\n${raw}` : raw;
    if (quotesOpen(line)) { pending = line; continue; } // a quoted field runs over a line break
    pending = '';
    if (!header) { header = parseCsvLine(line.replace(/^﻿/, '')); continue; }
    if (!line) continue;
    const cells = parseCsvLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    row.__cells = cells.length === header.length;
    yield row;
  }
}

// ---------- helpers ----------

const starOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 && v !== '' ? Math.round(n) : null;
};
const normName = (s) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.'’`-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const nameKey = (r) => `${normName(r.full_name || `${r.first_name} ${r.last_name}`)}|${r.class_year}|${r.state.toUpperCase()}`;
// 247Sports addresses come as /player/<name>-<id>/, /player/<id>/ or /recruitment/<name>-<id>; player and recruitment
// IDs are different numbers, so each key says which one it is.
const id247 = (url) => {
  const player = url.match(/\/player\/(?:[^/?]*-)?(\d+)(?:[/?]|$)/i);
  if (player) return `p${player[1]}`;
  const recruit = url.match(/\/recruitment\/(?:[^/?]*-)?(\d+)(?:[/?]|$)/i);
  return recruit ? `r${recruit[1]}` : null;
};
const cleanSchool = (s) => s.replace(/\s+High School$/i, '').replace(/\s+HS$/i, '').trim();
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.floor((s[m - 1] + s[m]) / 2); // a half rounds down
};
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–');
const inc = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };

// ---------- read and match ----------

const stats = {
  rows: 0, badRows: 0, bySource: {}, sourceDupes: {},
  dropped: { notUS: 0, coaches: 0 },
  linkedBy247Id: 0, linkedByName: 0,
};
const players = []; // merged players
const by247 = new Map(); // 247 player id -> player
const byName = new Map(); // name|class|state -> player
const seenSource = new Set();

function newPlayer(r) {
  const p = {
    classYear: Number(r.class_year), state: r.state.toUpperCase(),
    school: '', city: '', schoolFrom: 9, position: '', positionFrom: 9,
    lists: new Set(), votes: {}, on3Consensus: null, ids: {},
  };
  players.push(p);
  return p;
}
// Source preference for school and position: 247Sports writes short school names, On3 next, ESPN last.
const PREF = { '247Sports': 0, On3: 1, ESPN: 2 };
function absorb(p, r) {
  const pref = PREF[r.source] ?? 3;
  const school = r.source === 'ESPN' ? cleanSchool(r.high_school) : r.high_school.trim();
  if (school && pref < p.schoolFrom) { p.school = school; p.city = r.city.trim(); p.schoolFrom = pref; }
  if (r.position && pref < p.positionFrom) { p.position = r.position.trim(); p.positionFrom = pref; }
  p.lists.add(r.source);
  // Votes: a list's own row beats another list's copy of it (On3 rows carry 247Sports/ESPN/Rivals stars too).
  const vote = (rater, value, strength) => {
    const s = starOf(value);
    if (s === null) return;
    const cur = p.votes[rater];
    if (!cur || strength > cur.strength) p.votes[rater] = { stars: s, strength };
  };
  if (r.source === '247Sports') vote('247', r.stars, r.s247_ranking_list === 'Composite' ? 2 : 3);
  if (r.source === 'ESPN') vote('espn', r.stars, 3);
  if (r.source === 'On3') {
    vote('on3', r.on3_own_stars, 3);
    vote('247', r.on3_247_stars, 1);
    vote('espn', r.on3_espn_stars, 1);
    vote('rivals', r.on3_rivals_stars, 1);
    const c = starOf(r.on3_consensus_stars);
    if (c !== null) p.on3Consensus = c;
  }
}

console.error(`Reading ${input} ...`);
const pendingOn3 = []; // On3 rows wait until every 247Sports row is known, so the 247 link always finds its player
const pendingEspn = [];

for await (const r of readRows(input)) {
  stats.rows++;
  if (!r.__cells) { stats.badRows++; continue; }
  inc(stats.bySource, r.source);
  const ownId =
    r.source === '247Sports' ? id247(r.profile_url) : r.source === 'On3' ? r.on3_player_key : r.espn_player_id;
  const dedupe = `${r.source}|${ownId || r.profile_url}`;
  if (seenSource.has(dedupe)) {
    inc(stats.sourceDupes, r.source);
    // A second row for the same player on the same site (e.g. on two of its lists) still adds its votes.
    if (r.source === '247Sports') { const p = by247.get(ownId); if (p) absorb(p, r); }
    continue;
  }
  seenSource.add(dedupe);
  if (r.source === '247Sports') {
    const p = newPlayer(r);
    p.ids['247'] = ownId;
    absorb(p, r);
    if (ownId) by247.set(ownId, p);
    const recruitId = id247(r.s247_recruitment_url || '');
    if (recruitId && !by247.has(recruitId)) by247.set(recruitId, p);
    if (!byName.has(nameKey(r))) byName.set(nameKey(r), p);
  } else if (r.source === 'On3') pendingOn3.push(r);
  else pendingEspn.push(r);
}

for (const r of pendingOn3) {
  const link = id247(r.on3_247_profile_url);
  let p = link ? by247.get(link) : null;
  if (p) stats.linkedBy247Id++;
  else {
    p = byName.get(nameKey(r));
    if (p && p.lists.has('On3')) p = null; // two different On3 players with the same name, class and state
    if (p) stats.linkedByName++;
  }
  if (!p) { p = newPlayer(r); if (!byName.has(nameKey(r))) byName.set(nameKey(r), p); }
  absorb(p, r);
}
for (const r of pendingEspn) {
  let p = byName.get(nameKey(r));
  if (p && p.lists.has('ESPN')) p = null;
  if (p) stats.linkedByName++;
  else { p = newPlayer(r); byName.set(nameKey(r), p); }
  absorb(p, r);
}

// ---------- consensus and filters ----------

for (const p of players) {
  const votes = RATERS.map((k) => p.votes[k]?.stars).filter((v) => v != null);
  p.voteCount = votes.length;
  p.consensus = votes.length ? median(votes) : null;
  p.spread = votes.length ? Math.max(...votes) - Math.min(...votes) : 0;
  p.us = US_STATES.has(p.state);
}

const kept = [];
for (const p of players) {
  if (!p.us) { stats.dropped.notUS++; continue; }
  if (onlyStates && !onlyStates.has(p.state.toLowerCase())) continue;
  if (COACH_CODES.has(p.position)) { stats.dropped.coaches++; continue; }
  kept.push(p);
}

// ---------- outputs ----------

fs.mkdirSync(outDir, { recursive: true });

const disagreements = kept.filter((p) => p.spread >= 2);

// stars-<season>-<date>.csv (plan 4.3: counts per school, star tier and class; no names, no positions)
const roster = kept.filter((p) => rosterClasses.includes(p.classYear) && p.consensus >= 2);
const countsFile = `stars-${season}-${today}.csv`;
{
  const groups = new Map();
  for (const p of roster) {
    const key = [p.state.toLowerCase(), p.school, p.city, p.consensus, p.classYear].join('\u0000');
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const rows = [...groups].map(([k, count]) => {
    const [state, school, city, stars, gradYear] = k.split('\u0000');
    return [season, state, '', school, city, stars, count, gradYear, ''];
  });
  rows.sort((a, b) => a[1].localeCompare(b[1]) || a[3].localeCompare(b[3]) || b[5] - a[5] || a[7].localeCompare(b[7]));
  const lines = [csvRow(['season', 'state', 'school_id', 'school', 'city', 'stars', 'count', 'grad_year', 'returning'])];
  for (const r of rows) lines.push(csvRow(r));
  fs.writeFileSync(path.join(outDir, countsFile), `${lines.join('\n')}\n`);
}

// ---------- review.md ----------

const md = [];
const table = (head, rows) => {
  md.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
  for (const r of rows) md.push(`| ${r.join(' | ')} |`);
  md.push('');
};
const starCols = [5, 4, 3, 2];

md.push(`# Star rating review`, '');
md.push(`Input: \`${path.basename(input)}\` · reviewed ${today} · season ${season} (classes ${rosterClasses[0]}–${rosterClasses[3]})` +
  (onlyStates ? ` · states: ${[...onlyStates].join(', ')}` : ''), '');

md.push('## 1. What the file holds', '');
table(['List', 'Rows', 'Repeat rows (same player twice on that site)'],
  Object.entries(stats.bySource).map(([s, n]) => [s, n.toLocaleString(), (stats.sourceDupes[s] || 0).toLocaleString()]));
md.push(`- ${stats.rows.toLocaleString()} rows read${stats.badRows ? `, ${stats.badRows} skipped (wrong number of columns)` : ''}.`);
md.push(`- ${players.length.toLocaleString()} players after matching the lists: ` +
  `${stats.linkedBy247Id.toLocaleString()} On3 rows matched to 247Sports by profile link, ` +
  `${stats.linkedByName.toLocaleString()} rows matched by name, class and state.`);
md.push(`- Left out: ${stats.dropped.notUS.toLocaleString()} outside the US, ${stats.dropped.coaches} coaches.`);
md.push(`- ${kept.length.toLocaleString()} players reviewed below.`, '');

const listCombos = {};
for (const p of kept) inc(listCombos, [...p.lists].sort().join(' + '));
table(['On which lists', 'Players'], Object.entries(listCombos).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v.toLocaleString()]));

md.push('## 2. Consensus stars by class', '');
{
  const byClass = {};
  for (const p of kept) {
    byClass[p.classYear] ??= { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, none: 0, total: 0 };
    const c = byClass[p.classYear];
    c.total++;
    if (p.consensus == null) c.none++; else c[p.consensus]++;
  }
  table(['Class', '5★', '4★', '3★', '2★', 'Not rated', 'Players', 'On a roster in ' + season],
    Object.keys(byClass).sort((a, b) => b - a).map((y) => {
      const c = byClass[y];
      return [y, c[5], c[4], c[3], c[2] + c[1], c.none, c.total, rosterClasses.includes(Number(y)) ? '✓' : ''];
    }));
}

md.push('## 3. Each list’s stars', '');
md.push('Counts of the stars each list gave (its own list, or its rating as copied on the On3 rows).', '');
table(['List', '5★', '4★', '3★', '2★', 'Players rated'], RATERS.map((k) => {
  const c = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let n = 0;
  for (const p of kept) { const v = p.votes[k]?.stars; if (v) { c[v]++; n++; } }
  return [RATER_LABEL[k], c[5], c[4], c[3], c[2] + c[1], n.toLocaleString()];
}));

md.push('## 4. Do the lists agree?', '');
md.push('Every pair of lists, over the players both rated.', '');
{
  const rows = [];
  for (let i = 0; i < RATERS.length; i++) {
    for (let j = i + 1; j < RATERS.length; j++) {
      const a = RATERS[i];
      const b = RATERS[j];
      let n = 0, same = 0, one = 0, two = 0, aHigher = 0;
      for (const p of kept) {
        const x = p.votes[a]?.stars;
        const y = p.votes[b]?.stars;
        if (!x || !y) continue;
        n++;
        const d = Math.abs(x - y);
        if (d === 0) same++; else if (d === 1) one++; else two++;
        if (x > y) aHigher++;
      }
      if (n) rows.push([`${RATER_LABEL[a]} vs ${RATER_LABEL[b]}`, n.toLocaleString(), pct(same, n), pct(one, n), pct(two, n),
        `${RATER_LABEL[a]} ${pct(aHigher, n)} · ${RATER_LABEL[b]} ${pct(n - same - aHigher, n)}`]);
    }
  }
  table(['Pair', 'Both rated', 'Same', '1★ apart', '2★+ apart', 'Who is higher when they differ'], rows);
}
{
  const multi = kept.filter((p) => p.voteCount > 1);
  const agreeAll = multi.filter((p) => p.spread === 0).length;
  md.push(`- ${multi.length.toLocaleString()} players were rated by 2 or more lists; all lists agree on ` +
    `${pct(agreeAll, multi.length)} of them.`);
  const withOn3 = kept.filter((p) => p.on3Consensus && p.consensus);
  const on3Same = withOn3.filter((p) => p.on3Consensus === p.consensus).length;
  md.push(`- Our consensus matches On3's own consensus field for ${pct(on3Same, withOn3.length)} of the ` +
    `${withOn3.length.toLocaleString()} players that have it.`);
  const floor = withOn3.filter((p) => p.consensus < 3 && p.on3Consensus === 3).length;
  const rest = withOn3.filter((p) => p.consensus >= 3);
  md.push(`  - ${floor.toLocaleString()} of the differences are On3's floor: its consensus never goes below 3★, ` +
    'so players the other lists call 2★ show as 3★ there.');
  md.push(`  - Among players we rate 3★ or more, the two agree on ` +
    `${pct(rest.filter((p) => p.on3Consensus === p.consensus).length, rest.length)}` +
    ` (On3 higher on ${pct(rest.filter((p) => p.on3Consensus > p.consensus).length, rest.length)}: ` +
    'it averages ratings, while we take the median star and round a half down).');
  md.push(`- ${disagreements.length.toLocaleString()} players are 2★ or more apart between lists ` +
    `(${disagreements.filter((p) => rosterClasses.includes(p.classYear)).length} of them on a ${season} roster).`, '');
}

md.push(`## 5. ${season} rosters by state`, '');
md.push(`Players in classes ${rosterClasses[0]}–${rosterClasses[3]} with a consensus of 2★ or more. ` +
  'Star points: 5★ = 4, 4★ = 3, 3★ = 2, 2★ = 1.', '');
const points = (s) => Math.max(0, s - 1);
{
  const st = {};
  for (const p of roster) {
    st[p.state] ??= { 5: 0, 4: 0, 3: 0, 2: 0, pts: 0, schools: new Set() };
    st[p.state][p.consensus]++;
    st[p.state].pts += points(p.consensus);
    st[p.state].schools.add(`${p.school}|${p.city}`);
  }
  table(['State', '5★', '4★', '3★', '2★', 'Schools', 'Star points'],
    Object.entries(st).sort((a, b) => b[1].pts - a[1].pts)
      .map(([s, c]) => [s, c[5], c[4], c[3], c[2], c.schools.size, c.pts]));
}

// Schools by total star points only: a tier-by-tier count per school could point to one player.
md.push(`## 6. Top ${topN} schools for ${season} by star points`, '');
{
  const sc = {};
  for (const p of roster) {
    const k = `${p.state}|${p.school}|${p.city}`;
    sc[k] = (sc[k] || 0) + points(p.consensus);
  }
  table(['School', 'City', 'State', 'Star points'],
    Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, topN)
      .map(([k, pts]) => { const [s, school, city] = k.split('|'); return [school, city, s, pts]; }));
}

// Fill school_id with the game's team IDs (state + school_id identifies a school).
const matched = matchFile(path.join(outDir, countsFile), path.resolve(opt('teams', DEFAULT_TEAMS)));
md.push('## 7. Matching to the game\'s teams', '');
md.push(matchReport(matched));

md.push('## 8. Files', '');
md.push(`- \`${countsFile}\`: ${roster.length.toLocaleString()} players as counts per school, star tier and class ` +
  '(no names or positions; `school_id` is the game\'s team ID where the school matched, blank otherwise; ' +
  '`returning` is unknown).', '');

fs.writeFileSync(path.join(outDir, 'review.md'), `${md.join('\n')}\n`);

console.error(`Done: ${players.length.toLocaleString()} players matched, ${kept.length.toLocaleString()} reviewed.`);
console.error(`Wrote ${outDir}${path.sep}{review.md, ${countsFile}}`);
