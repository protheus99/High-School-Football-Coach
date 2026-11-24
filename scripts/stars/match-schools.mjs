#!/usr/bin/env node
// Match the schools in a star counts file (plan 4.3) to the game's team list and fill in `school_id`.
//
//   node scripts/stars/match-schools.mjs <stars-file.csv> [--teams src/data]
//
// The team list is the game's state worlds (src/data/<state>-<class>.json, the files STATE_DATA in
// src/data/stateWorlds.ts bundles): the schools the game actually plays. (public/leagues is an older set of district
// files the game doesn't load.) A school's ID is the game's own team ID, `team_<name>` (the rule in
// src/generators/rosterGenerator.ts). It is unique within a state, but repeats across states (West Forsyth in Georgia
// and North Carolina; the game adds a state suffix to out-of-state teams), so a school is `state` + `school_id`.
//
// Matching is strict on purpose (a wrong match moves the wrong team's strength):
//   1. Same state and the same name once spelling is evened out ("St." = "Saint", "High School" dropped, ...).
//      If two schools share that name, the city decides; if it can't, the row stays unmatched.
//   2. The game writes some names with the city first ("El Paso Eastlake"): the name without its city matches when
//      the city is the same too.
//   3. `scripts/stars/school-aliases.json` for pairs a person has checked: { "<st>|<school>|<city>": "<team id>" }.
// Everything else stays unmatched and is listed with the closest names in that state, to check by hand.
//
// The file is rewritten in place with `school_id` filled; rows in states the game doesn't have yet keep it blank.
// Only school names are reported, never counts per school, so nothing points at a player.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TEAMS = path.resolve(here, '../../src/data');
const ALIASES_FILE = path.join(here, 'school-aliases.json');

const STATE_CODES = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co', connecticut: 'ct',
  delaware: 'de', 'district of columbia': 'dc', florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id', illinois: 'il',
  indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo', montana: 'mt',
  nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa',
  'rhode island': 'ri', 'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut',
  vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy',
};

/** The game's team ID for a school name (same rule as rosterGenerator.ts). */
export const teamId = (name) => `team_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

/** Evens out spelling so the same school written two ways compares equal. */
export const norm = (s) =>
  ` ${String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `
    .replace(/&/g, ' and ')
    .replace(/[.'’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/ st /g, ' saint ')
    .replace(/ mt /g, ' mount ')
    .replace(/ ft /g, ' fort ')
    .replace(/ (senior high school|high school|senior high|hs|shs) /g, ' ')
    .replace(/ high $/, ' ') // "Auburn High" is the source's "Auburn"
    .replace(/^ the /, ' ')
    .replace(/^ cy /, ' cypress ') // Texas: "Cy Falls" = Cypress Falls
    .replace(/\s+/g, ' ')
    .trim();

/** A normalized name without a last generic word ("christ presbyterian academy" -> "christ presbyterian"). */
const bare = (key) => key.replace(/ (academy|school|catholic|prep|preparatory)$/, '');

/** Loads every school in the game's state worlds, grouped by two-letter state code. */
export function loadTeamList(teamsDir = DEFAULT_TEAMS) {
  const byState = new Map();
  for (const file of fs.readdirSync(teamsDir)) {
    if (!file.endsWith('.json')) continue;
    const world = JSON.parse(fs.readFileSync(path.join(teamsDir, file), 'utf8'));
    const st = STATE_CODES[String(world.state || '').toLowerCase()];
    if (!st || !Array.isArray(world.regions)) continue; // not a state world (e.g. teamPages.json)
    if (!byState.has(st)) byState.set(st, []);
    for (const region of world.regions) {
      for (const s of region.districts.flatMap((d) => d.schools)) {
        // The game adds a nickname or town in brackets ("Montgomery Bell (MBA)", "St. Joseph (Metuchen)").
        const bracket = (s.name.match(/\(([^)]*)\)/) || [])[1] || '';
        const base = s.name.replace(/\s*\([^)]*\)/g, '');
        byState.get(st).push({
          id: teamId(s.name), name: s.name, city: s.city || '', key: norm(base), cityKey: norm(s.city),
          bracketKey: norm(bracket), bareKey: bare(norm(base)),
        });
      }
    }
  }
  return byState;
}

const loadAliases = () => (fs.existsSync(ALIASES_FILE) ? JSON.parse(fs.readFileSync(ALIASES_FILE, 'utf8')) : {});

// Similarity for suggestions only (never used to match): shared words, with a bonus for the same city.
function closest(list, school, city, n = 3) {
  const words = new Set(norm(school).split(' '));
  const cityKey = norm(city);
  return list
    .map((t) => {
      const tw = t.key.split(' ');
      const shared = tw.filter((w) => words.has(w)).length;
      const score = shared / Math.max(tw.length, words.size) + (cityKey && t.cityKey === cityKey ? 0.5 : 0);
      return { t, score };
    })
    .filter((x) => x.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => `${x.t.name}${x.t.city ? ` (${x.t.city})` : ''}`);
}

/** Returns a matcher: (state, school, city) -> { id, how } | { id: null, reason, suggestions }. */
export function makeMatcher(teamList = loadTeamList(), aliases = loadAliases()) {
  return (state, school, city) => {
    const st = String(state).toLowerCase();
    const list = teamList.get(st);
    if (!list) return { id: null, reason: 'state not in the game' };
    const alias = aliases[`${st}|${school}|${city}`];
    if (alias) {
      const t = list.find((x) => x.name === alias);
      if (t) return { id: t.id, how: 'alias' };
      return { id: null, reason: `alias "${alias}" is not a game team in ${st}` };
    }
    const key = norm(school);
    const cityKey = norm(city);
    // Same town: the game's city, or a town it wrote in brackets. A game school with no city never rules one out.
    const sameTown = (t) => !!cityKey && (t.cityKey === cityKey || t.bracketKey === cityKey);
    const pick = (cands, how) => {
      if (cands.length === 1) return { id: cands[0].id, how };
      const sameCity = cands.filter(sameTown);
      if (sameCity.length === 1) return { id: sameCity[0].id, how: `${how}, city` };
      return null;
    };
    const exact = list.filter((t) => t.key === key);
    if (exact.length) {
      const m = pick(exact, 'name');
      if (m) return m;
      return { id: null, reason: 'name shared by several schools', suggestions: exact.map((t) => `${t.name} (${t.city || '?'})`) };
    }
    // The game puts the city first in some names ("El Paso Eastlake"); the source writes "Eastlake" in El Paso.
    if (cityKey) {
      const prefixed = list.filter((t) => t.key === `${cityKey} ${key}` || `${t.cityKey} ${t.key}` === `${cityKey} ${key}`);
      const m = pick(prefixed, 'city + name');
      if (m) return m;
    }
    // One side adds a generic last word ("Christ Presbyterian Academy" / "Christ Presbyterian"): only when that
    // leaves exactly one school in the state with that name, and the city doesn't say otherwise.
    const bareKey = bare(key);
    const loose = list.filter((t) => t.bareKey === bareKey && (!t.cityKey || !cityKey || sameTown(t)));
    if (loose.length === 1 && bareKey.includes(' ')) return { id: loose[0].id, how: 'name without academy/school/catholic' };
    return { id: null, reason: 'no match', suggestions: closest(list, school, city) };
  };
}

// ---------- command line ----------

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
const csvCell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

/** Fills school_id in a counts file in place; returns a summary of what matched. */
export function matchFile(file, teamsDir = DEFAULT_TEAMS) {
  const teamList = loadTeamList(teamsDir);
  const match = makeMatcher(teamList);
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const col = (name) => header.indexOf(name);
  for (const need of ['state', 'school', 'school_id']) {
    if (col(need) < 0) throw new Error(`${file}: no "${need}" column`);
  }
  const schools = new Map(); // "st|school|city" -> result
  const out = [lines[0]];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const st = cells[col('state')].toLowerCase();
    const school = cells[col('school')];
    const city = col('city') >= 0 ? cells[col('city')] : '';
    const k = `${st}|${school}|${city}`;
    if (!schools.has(k)) schools.set(k, { st, school, city, ...match(st, school, city) });
    cells[col('school_id')] = schools.get(k).id || '';
    out.push(cells.map(csvCell).join(','));
  }
  fs.writeFileSync(file, `${out.join('\n')}\n`);
  return { schools: [...schools.values()], teamList };
}

/** A markdown summary of a match: totals per state, then the schools in game states that didn't match. */
export function matchReport({ schools, teamList }) {
  const md = [];
  const inGame = schools.filter((s) => teamList.has(s.st));
  const matched = inGame.filter((s) => s.id);
  md.push(`- ${schools.length.toLocaleString()} schools in the file; ${inGame.length} are in states the game has ` +
    `(${[...teamList.keys()].sort().join(', ')}).`);
  md.push(`- ${matched.length} of those matched a game team; ${inGame.length - matched.length} didn't.`);
  const ids = new Set(matched.map((s) => `${s.st}|${s.id}`));
  const gameTeams = [...teamList.values()].reduce((a, l) => a + l.length, 0);
  md.push(`- ${ids.size} of the game's ${gameTeams} teams get star counts.`, '');
  md.push('| State | Schools in file | Matched | Not matched | Game teams with stars |', '| --- | --- | --- | --- | --- |');
  for (const st of [...teamList.keys()].sort()) {
    const s = inGame.filter((x) => x.st === st);
    const m = s.filter((x) => x.id);
    md.push(`| ${st} | ${s.length} | ${m.length} | ${s.length - m.length} | ${new Set(m.map((x) => x.id)).size} of ${teamList.get(st).length} |`);
  }
  md.push('');
  const misses = inGame.filter((s) => !s.id).sort((a, b) => a.st.localeCompare(b.st) || a.school.localeCompare(b.school));
  if (misses.length) {
    md.push('Not matched (many are schools the game doesn\'t have; a real pair can go in `scripts/stars/school-aliases.json`):', '');
    md.push('| State | School | City | Why | Closest game teams |', '| --- | --- | --- | --- | --- |');
    for (const s of misses) md.push(`| ${s.st} | ${s.school} | ${s.city} | ${s.reason} | ${(s.suggestions || []).join('; ')} |`);
    md.push('');
  }
  return md.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!file) {
    console.error('Usage: node scripts/stars/match-schools.mjs <stars-file.csv> [--teams src/data]');
    process.exit(1);
  }
  const li = args.indexOf('--teams');
  const result = matchFile(file, li >= 0 ? path.resolve(args[li + 1]) : DEFAULT_TEAMS);
  const report = matchReport(result);
  const reportFile = file.replace(/\.csv$/i, '') + '.match.md';
  fs.writeFileSync(reportFile, `# School matching: ${path.basename(file)}\n\n${report}\n`);
  console.log(report.split('\n').slice(0, 3).join('\n'));
  console.log(`Filled school_id in ${file}\nReport: ${reportFile}`);
}
