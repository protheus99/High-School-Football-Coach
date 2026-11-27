#!/usr/bin/env node
// Builds the game's per-state team files from the expansion research data. Re-run it whenever expansion/final changes.
//
//   node scripts/build-all-teams.mjs [expansionDir]
//
// Reads <expansionDir>/final/<state>.csv (State,Class,District,FullName,ShortName,City,Mascot,Colors,Off,Def,PPI) and writes
//   src/data/teams/<state-slug>.json   one file per state: every class, its districts and schools (loaded lazily by
//                                       src/data/teamData.ts, so Vite splits one chunk per state)
//   src/data/teamManifest.ts           the small index the New Game screens read without loading any team data
//   src/data/schoolIndex.json          New Game's national school list, with each school's size level (lib/schoolIndex.mjs)
//
// Facts are never invented. A blank mascot stays blank (the game shows nothing); blank colors become one neutral slate/white
// pair with colorsConfirmed: false; a blank city or district is left out.
//
// A school's id is permanent: it never contains the class, so a school the state association moves to another class (every
// year or two) keeps its id, and saves, histories and links keep finding it. Ids are kept in scripts/data/school-ids.json
// (commit it), keyed "<state>|<name>|<city>":
//   - a school already in the file keeps its id;
//   - a school whose city changed or was filled in keeps its id when exactly one unused entry has its state and name;
//   - a new school gets team_<state>_<name> (e.g. team_ohio_springfield), with its city (or a number) added when another school
//     in the state has the same name or already holds that id.
// Entries are never removed: a school that drops out of the data keeps its id reserved. A renamed school keeps its id by
// editing its key in the file. Ids never collide with the original 12 states' top-class ids (team_<name>; checked in
// src/sim/tests/allTeams.test.ts).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExpansionDir, readCsvRows, slugify } from './lib/expansion.mjs';
import { buildSchoolIndex } from './lib/schoolIndex.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expansion = findExpansionDir(repo, process.argv[2]);
const finalDir = path.join(expansion, 'final');
const outDir = path.join(repo, 'src', 'data', 'teams');

// School colors by the names the research files use (abbreviations and spelling variants included)
const COLOR_HEX = {
  white: '#FFFFFF', 'snowy white': '#FFFFFF', wht: '#FFFFFF',
  black: '#000000', blk: '#000000',
  gold: '#FFB612', 'vegas gold': '#C5B358', 'vegas gd': '#C5B358', 'old gold': '#CFB53B', 'athletic gold': '#FFB81C', 'bright gold': '#FFC72C', 'light gold': '#F0C75E', 'butterscotch gold': '#E3A857', gld: '#FFB612', yellow: '#FACC15', maize: '#FBEC5D', 'buff(orange)': '#F4A460',
  blue: '#1D4ED8', royal: '#1F4FBF', 'royal blue': '#1F4FBF', navy: '#0B1F4B', 'navy blue': '#0B1F4B', columbia: '#7BAFD4', 'columbia blue': '#7BAFD4', 'col. blue': '#7BAFD4', 'carolina blue': '#7BAFD4', carolina: '#7BAFD4', 'light blue': '#7DB7E8', 'powder blue': '#B0D4EE', 'dark blue': '#0F2A6B', 'medium blue': '#2563EB',
  red: '#C8102E', scarlet: '#CC0000', scarlett: '#CC0000', crimson: '#A6192E', cardinal: '#B3202F', 'cardinal red': '#B3202F', 'brick red': '#A4372A', cherry: '#C21E3A', garnet: '#7A1F2B',
  maroon: '#6B1F2A', burgundy: '#6D1A36', 'dark maroon': '#4A1420',
  green: '#15803D', 'kelly green': '#2E9C3F', 'kelly grn': '#2E9C3F', 'forest green': '#155D3B', 'forest grn': '#155D3B', 'forrest green': '#155D3B', 'dark green': '#14532D', 'hunter green': '#355E3B', 'myrtle grn': '#21421E', 'dartmouth green': '#00693E', 'emerald green': '#1B9E5A', lime: '#84CC16', teal: '#0F766E',
  orange: '#EA580C', brown: '#6B4423', 'seal brown': '#4B2E1E', bronze: '#A0522D', copper: '#B87333',
  purple: '#6B21A8',
  silver: '#C0C0C0', silv: '#C0C0C0', gray: '#6B7280', grey: '#6B7280', 'wolf gray': '#6B7280', steel: '#71797E'
};
// A school with no colors on file: one neutral pair for all of them, never a made-up color (colorsConfirmed: false)
const NEUTRAL_PRIMARY = '#475569';
const NEUTRAL_SECONDARY = '#FFFFFF';

// ---------------------------------------------------------------------------
// Game prestige: a bell curve within each state. The research data's PPI ranks programs inside a state but bunches at
// the top (2.2% at 96+, 44% at 80-87, almost none under 70). The game keeps each school's rank in its state and spreads
// the ratings on a normal curve (mean 75, spread 12): most programs land in the 70s, real rebuild jobs sit in the 50s
// and 60s, and above 88 a soft ceiling keeps the top rare (about 1.3% of schools at 96+). Each state's single best
// program (the top PPI; ties go to the first listed) is 99. Ties share a rank. The research data keeps its PPI.
// ---------------------------------------------------------------------------
const CURVE = { mean: 75, spread: 12, knee: 88, soft: 14, ceiling: 100.5 };

/** Inverse of the standard normal CDF (Acklam's approximation, accurate to about 1e-9). */
function normalQuantile(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Each row's game prestige, from its PPI's rank among the state's schools. */
function curvedPrestige(rows) {
  const ppi = (r) => Number(r.PPI) || 70;
  const sorted = rows.map(ppi).sort((x, y) => x - y);
  const n = sorted.length;
  const share = new Map(); // a PPI value -> the mid-rank share of the schools at or below it
  for (let i = 0; i < n; ) {
    let j = i;
    while (j < n && sorted[j] === sorted[i]) j++;
    share.set(sorted[i], (i + j) / 2 / n);
    i = j;
  }
  const best = rows.reduce((top, r) => (ppi(r) > ppi(top) ? r : top), rows[0]);
  return new Map(
    rows.map((r) => {
      if (r === best) return [r, 99];
      const z = normalQuantile(Math.min(0.9995, Math.max(0.0005, share.get(ppi(r)))));
      let x = CURVE.mean + CURVE.spread * z;
      if (x > CURVE.knee) x = CURVE.knee + (CURVE.ceiling - CURVE.knee) * (1 - Math.exp(-(x - CURVE.knee) / CURVE.soft));
      return [r, Math.max(40, Math.min(99, Math.round(x)))];
    })
  );
}

/** The first style listed names the scheme; Air Raid keeps its own. */
function offenseScheme(text) {
  const first = text.split('/')[0].trim();
  if (/^(hyper-)?air raid/i.test(first)) return 'AIR_RAID';
  if (/air raid|hyper|up-tempo|spread|rpo|fly/i.test(first)) return 'SPREAD';
  if (/option|veer|flex|wishbone|wing|slot|triple|bone/i.test(first)) return 'TRIPLE_OPTION';
  if (/power|pro|i-form|t-form|full-house|double-tight|hammer|zone|-t$|^t$/i.test(first)) return 'POWER_I';
  return 'SPREAD';
}
function defenseScheme(text) {
  const t = text.trim().toLowerCase();
  if (t.startsWith('4-4')) return 'FOUR_FOUR';
  if (t.startsWith('4-3')) return 'FOUR_THREE';
  if (t.startsWith('4-2-5')) return 'DROP_EIGHT';
  if (t.startsWith('3-3-5') || t.startsWith('3-4')) return 'THREE_THREE_FIVE';
  return 'FOUR_THREE';
}

/** "Navy/Vegas Gold" -> two hex colors, or null when the primary isn't a color we know. */
function parseColors(text) {
  const parts = text.split('/').map((p) => p.trim().toLowerCase().replace(/\.$/, ''));
  if (!parts[0] || !COLOR_HEX[parts[0]]) return null;
  const secondary = parts.slice(1).map((p) => COLOR_HEX[p]).find(Boolean);
  return { primaryColor: COLOR_HEX[parts[0]], secondaryColor: secondary ?? (parts[0] === 'white' ? '#000000' : '#FFFFFF') };
}

const stateFiles = fs
  .readdirSync(finalDir)
  .filter((f) => f.endsWith('.csv') && f !== 'all-teams.csv')
  // Only the per-state team lists: final/ also holds reports and tables (flags, provenance, class levels, class strength)
  .filter((f) => /^﻿?State,Class,District,FullName,/.test(fs.readFileSync(path.join(finalDir, f), 'utf8').split(/\r?\n/, 1)[0]))
  .sort();
fs.mkdirSync(outDir, { recursive: true });
for (const old of fs.readdirSync(outDir)) if (old.endsWith('.json')) fs.rmSync(path.join(outDir, old)); // states removed from the data go too

const manifest = [];
const unknownColors = new Map();
let schools = 0;
let unconfirmed = 0;
let noMascot = 0;

// Permanent school ids (see the header)
const idFile = path.join(repo, 'scripts', 'data', 'school-ids.json');
const lock = fs.existsSync(idFile) ? JSON.parse(fs.readFileSync(idFile, 'utf8')) : {};
const lockedIds = new Set(Object.values(lock));
const usedIds = new Set(); // ids given out in this run
const schoolKey = (state, r) => `${state}|${slugify(r.FullName)}|${slugify(r.City ?? '')}`;
let newIds = 0;
let movedKeys = 0;
function assignIds(state, rows) {
  const stateSlug = slugify(state);
  const nameCount = new Map();
  rows.forEach((r) => nameCount.set(slugify(r.FullName), (nameCount.get(slugify(r.FullName)) ?? 0) + 1));
  const presentKeys = new Set(rows.map((r) => schoolKey(state, r)));
  const ids = new Map();
  const give = (r, id) => {
    if (usedIds.has(id)) throw new Error(`${state}: two schools would share the id ${id} (${r.FullName}, ${r.City || 'no city'})`);
    usedIds.add(id);
    ids.set(r, id);
  };
  const pending = [];
  for (const r of rows) {
    const key = schoolKey(state, r);
    if (lock[key]) give(r, lock[key]);
    else pending.push(r);
  }
  for (const r of pending) {
    const key = schoolKey(state, r);
    // Same school, city changed or filled in: exactly one entry with this state and name that no school here still uses
    const sameName = (k) => {
      const [s, name] = k.split('|');
      return s === state && name === slugify(r.FullName);
    };
    const loose = Object.keys(lock).filter((k) => sameName(k) && !presentKeys.has(k) && !usedIds.has(lock[k]));
    if (loose.length === 1) {
      const id = lock[loose[0]];
      delete lock[loose[0]];
      lock[key] = id;
      movedKeys++;
      give(r, id);
      continue;
    }
    const taken = (id) => usedIds.has(id) || lockedIds.has(id);
    let id = `team_${stateSlug}_${slugify(r.FullName)}`;
    if (nameCount.get(slugify(r.FullName)) > 1 || taken(id)) id += r.City ? `_${slugify(r.City)}` : '';
    for (let n = 2; taken(id); n++) id = `${id.replace(/_\d+$/, '')}_${n}`;
    lock[key] = id;
    lockedIds.add(id);
    newIds++;
    give(r, id);
  }
  return ids;
}

for (const file of stateFiles) {
  const rows = readCsvRows(path.join(finalDir, file));
  if (rows.length === 0) continue;
  const state = rows[0].State;
  const stateSlug = slugify(state);
  const classOrder = [...new Set(rows.map((r) => r.Class))];
  const ids = assignIds(state, rows);
  const gamePrestige = curvedPrestige(rows);

  const out = { state, classes: [] };
  for (const className of classOrder) {
    const classRows = rows.filter((r) => r.Class === className);
    const idFor = (r) => ids.get(r);

    const outClass = { className, districts: [] };
    for (const districtName of [...new Set(classRows.map((r) => r.District))]) {
      outClass.districts.push({
        name: districtName,
        schools: classRows
          .filter((r) => r.District === districtName)
          .map((r) => {
            const colors = r.Colors ? parseColors(r.Colors) : null;
            if (r.Colors && !colors) unknownColors.set(r.Colors, (unknownColors.get(r.Colors) ?? 0) + 1);
            if (!colors) unconfirmed++;
            if (!r.Mascot) noMascot++;
            schools++;
            const prestige = gamePrestige.get(r);
            return {
              id: idFor(r),
              name: r.FullName,
              ...(r.ShortName && r.ShortName !== r.FullName && { shortName: r.ShortName }),
              ...(r.City && { city: r.City }),
              ...(r.Mascot && { mascot: r.Mascot }),
              primaryColor: colors?.primaryColor ?? NEUTRAL_PRIMARY,
              secondaryColor: colors?.secondaryColor ?? NEUTRAL_SECONDARY,
              ...(!colors && { colorsConfirmed: false }),
              prestige,
              offenseScheme: offenseScheme(r.Off),
              defenseScheme: defenseScheme(r.Def)
            };
          })
      });
    }
    out.classes.push(outClass);
  }

  fs.writeFileSync(path.join(outDir, `${stateSlug}.json`), JSON.stringify(out) + '\n');
  manifest.push({
    state,
    slug: stateSlug,
    schools: rows.length,
    classes: out.classes.map((c) => ({
      className: c.className,
      schools: c.districts.reduce((n, d) => n + d.schools.length, 0),
      districts: c.districts.filter((d) => d.name).length
    }))
  });
}

const ts = [
  '// Generated by scripts/build-all-teams.mjs from expansion/final/*.csv: do not edit by hand.',
  "// The index of every state's classes (team lists load lazily from src/data/teams/<slug>.json; see teamData.ts).",
  '',
  'export interface ManifestClass {',
  '  className: string;',
  '  schools: number;',
  '  districts: number; // named districts (0: the class has none on file)',
  '}',
  '',
  'export interface ManifestState {',
  '  state: string;',
  '  slug: string; // the team file: src/data/teams/<slug>.json',
  '  schools: number;',
  '  classes: ManifestClass[];',
  '}',
  '',
  'export const TEAM_MANIFEST: ManifestState[] = [',
  ...manifest.map((m) => `  ${JSON.stringify(m)},`),
  '];',
  ''
].join('\n');
fs.writeFileSync(path.join(repo, 'src', 'data', 'teamManifest.ts'), ts);

fs.mkdirSync(path.dirname(idFile), { recursive: true });
const sortedLock = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
fs.writeFileSync(idFile, JSON.stringify(sortedLock, null, 1) + '\n');

buildSchoolIndex(repo, expansion);
console.log(`${manifest.length} states, ${schools} schools -> src/data/teams/*.json + src/data/teamManifest.ts + src/data/schoolIndex.json`);
console.log(`  school ids: ${newIds} new, ${movedKeys} kept through a city change, ${Object.keys(lock).length - usedIds.size} reserved for schools not in this data (scripts/data/school-ids.json)`);
console.log(`  ${noMascot} without a mascot (shown blank), ${unconfirmed} with neutral colors (colorsConfirmed: false)`);
if (unknownColors.size) console.log(`  color names without a hex (treated as unconfirmed): ${[...unknownColors].map(([k, n]) => `${k} x${n}`).join(', ')}`);
