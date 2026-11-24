#!/usr/bin/env node
// Builds the per-class schedule and playoff rules module from the expansion research files.
//
//   node scripts/build-state-rules.mjs [expansionDir]
//
// Reads <expansionDir>/rules/<state>.json (see expansion/RULES-FORMAT.md) and <expansionDir>/final/<state>.csv
// (class and district names and sizes; the teams themselves are built by build-all-teams.mjs), and writes:
//   src/data/stateClassRules.ts                 typed per-state, per-class rules (ClassRules in src/sim/classRules.ts)
//   src/sim/tests/fixtures/classDistricts.json  district sizes per class, for the engine tests
// `playoffsSameAs` is resolved, null values get engine defaults (listed in each class's `defaults`), and where the
// data can't be played as-is the engine's approximation is listed in `approximations`.
// The expansion folder: the argument, $HSFC_EXPANSION, or the nearest expansion/ beside the repo (see lib/expansion.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExpansionDir, parseCsvLine } from './lib/expansion.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expansion = findExpansionDir(repo, process.argv[2]);
const rulesDir = path.join(expansion, 'rules');
const finalDir = path.join(expansion, 'final');
const MAX_ROUNDS = 6; // the shared national calendar (scheduleEngine MAX_PLAYOFF_ROUNDS)

// ---------------------------------------------------------------------------------------------------------------
// Hand overrides: what the research files can't say in the schema (or say inconsistently). Each one is recorded in
// the class's approximations so the deviation stays visible.
// ---------------------------------------------------------------------------------------------------------------
const SEASON_DEFAULT_GAMES = { 'New York': 8 }; // old text: 7 to 8 games; everyone else with null: 10
const SEASON_OVERRIDES = {
  Kansas: (cls) =>
    /^[123]A$/.test(cls)
      ? { scheduling: 'DISTRICT_ROUND_ROBIN', districtGames: 4, note: '3A-1A: four district games in weeks 5-8, the rest non-district' }
      : { scheduling: 'SELF_SCHEDULED', note: '6A-4A self-schedule: modeled as nearby opponents' }
};

/** Per state: a function of the class name returning playoff field overrides and notes. */
const PLAYOFF_OVERRIDES = {
  Florida: (cls) =>
    /^\dA$/.test(cls) ? { championsSeededFirst: true, note: 'district champions take seeds 1-4 in their region (FHSAA, as the playable 6A)' } : {},
  Georgia: () => ({ championsSeededFirst: true, note: 'region champions are guaranteed a top-half seed (GHSA PSR bracket)' }),
  Ohio: () => ({ selection: 'POINTS', note: 'Harbin computer points modeled by the generic points formula (wins plus opponents\' wins)' }),
  Virginia: (cls) => (/^Class/.test(cls) ? { selection: 'POINTS', note: 'VHSL power points modeled by the generic points formula' } : {}),
  Illinois: () => ({
    winThreshold: 3,
    statewideField: true,
    postseasonClassing: true,
    note: 'three wins qualify, then wins and playoff points fill the 48 statewide (split North / South in list order); post-season classing by enrollment runs at state level (classSeason.ts)'
  }),
  'North Carolina': () => ({ statewideField: true, note: 'RPI picks the field statewide, then it is split East and West in district order' }),
  Pennsylvania: () => ({ sectionRounds: 2, note: 'each PIAA district is a section: its top four play down to a champion; small districts are merged so the champions fit the state bracket' }),
  'New York': (cls) => (/^(AA|A|B|C|D)$/.test(cls) ? { sectionRounds: 2, note: 'each section plays a four-team bracket for its title; regional rounds pair sections in order' } : {}),
  Minnesota: (cls) => (cls === '6A' ? {} : { note: 'the class has no section data in the master list: teams are split into eight sections in list order' }),
  Alabama: (cls) => (/^\dA$/.test(cls) ? { note: 'region pairs cross 1v4 / 2v3 in the first round (AHSAA); the region bracket sizes in the data are replaced by the top-N-per-region field' } : {}),
  Tennessee: (cls) => (/^\dA$/.test(cls) ? { note: 'paired regions cross 1v4 / 2v3; extra master-list regions are merged so the field stays at 32' } : {}),
  Louisiana: () => ({ note: 'select / non-select membership has no data: private-sounding names (Catholic, Academy, St., ...) are select, topped up to a quarter of the class; 1A and 2A crown separate Division IV champions' }),
  Texas: (cls) => (cls === '6A' ? { note: 'each district\'s top four split into Division I (two largest enrollments) and Division II' } : {}),
  California: () => ({ note: 'each CIF section is one class here: a single section bracket by ranking (real sections run many divisions, then NorCal/SoCal regionals and state bowls)' }),
  'New Jersey': (cls) => (/^Group/.test(cls) ? { note: 'four sections of eight by power points; the North and South super sections meet in the state final' } : {})
};

// ---------------------------------------------------------------------------------------------------------------

const readCsvClasses = (file) => {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const ci = header.indexOf('Class');
  const di = header.indexOf('District');
  const classes = new Map();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const cls = cols[ci];
    const district = cols[di] ?? '';
    if (!classes.has(cls)) classes.set(cls, new Map());
    const districts = classes.get(cls);
    districts.set(district, (districts.get(district) ?? 0) + 1);
  }
  return classes;
};

const pow2Rounds = (n) => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));
const fitsRounds = (field, rounds) => rounds > 0 && field > 2 ** (rounds - 1) && field <= 2 ** rounds;
const isSectionLabel = (name) => /district|section/i.test(name) && !/state/i.test(name);

function buildClass(stateJson, cls, byName) {
  const defaults = [];
  const approximations = [];
  // playoffsSameAs: the other class's playoffs, then this class's own fields on top
  let raw = cls.playoffs;
  if (!raw && cls.playoffsSameAs) {
    const base = byName.get(cls.playoffsSameAs);
    if (!base?.playoffs) throw new Error(`${stateJson.state} ${cls.class}: playoffsSameAs ${cls.playoffsSameAs} has no playoffs`);
    const own = Object.fromEntries(Object.entries(cls).filter(([k]) => !['class', 'schools', 'playoffsSameAs', 'playoffs'].includes(k)));
    raw = { ...base.playoffs, ...own };
  }
  raw = raw ?? {};

  const rounds = Array.isArray(raw.rounds) ? raw.rounds.filter((r) => typeof r === 'string' && r.trim()) : [];
  if (rounds.length === 0) defaults.push('rounds: generic round names by bracket size');
  const regionsRaw = (raw.regions ?? []).filter((r) => r && r.name).map((r) => ({ name: r.name, districts: (r.districts ?? []).map(String) }));
  const namedLists = regionsRaw.some((r) => r.districts.some((d) => Number.isNaN(Number(d))));
  let fieldSize = raw.fieldSize ?? null;
  let regionBracketSize = raw.regionBracketSize ?? null;
  let regionalRounds = raw.regionalRounds ?? null;
  let qpd = raw.qualifiersPerDistrict ?? null;
  let selection = raw.selection ?? null;
  let format = raw.format ?? 'OTHER';
  let championsSeededFirst = raw.championsSeededFirst ?? null;
  if (championsSeededFirst === null) {
    championsSeededFirst = false;
    defaults.push('championsSeededFirst: false');
  }
  const divisionNames = (raw.divisionNames ?? []).filter(Boolean);

  // Several brackets per class (gap 5), or halves that meet in the final
  let split = 'NONE';
  let bracketNames = [cls.class];
  let halves = [];
  if (divisionNames.some((n) => /select/i.test(n))) {
    split = 'SELECT';
    bracketNames = divisionNames;
  } else if (raw.divisionSplit === 'TOP_ENROLLMENT_HALF' || (divisionNames.length === 2 && divisionNames.every((n) => /^Division I{1,2}$/.test(n)))) {
    split = 'ENROLLMENT';
    bracketNames = divisionNames;
    if (raw.divisionSplit !== 'TOP_ENROLLMENT_HALF') approximations.push('divisionSplit read as an enrollment split from the two division names');
  } else if (divisionNames.length === 1) {
    bracketNames = divisionNames;
  } else if (divisionNames.length > 1) {
    halves = divisionNames;
  }

  // Format (gaps 4 and 6): everything the schema calls OTHER gets the closest playable shape
  let sectionRounds = null;
  let regionCount = null;
  let regions = regionsRaw;
  if (format === 'OTHER') {
    let to;
    if (!selection && !fieldSize) to = 'FALLBACK';
    else if (selection === 'DISTRICT_FINISH' && regionsRaw.length) to = 'SECTIONAL';
    else if (regionsRaw.length >= 2 && regionBracketSize) to = 'REGIONAL_SEEDED';
    else to = 'STATEWIDE_RANKING';
    if (to !== 'FALLBACK') approximations.push(`format OTHER played as ${to}`);
    else approximations.push('no format data: fallback bracket of the best teams by rating');
    format = to;
  }
  if (format === 'STATEWIDE_RANKING' && regionsRaw.length >= 2 && regionBracketSize) {
    format = 'REGIONAL_SEEDED';
    approximations.push('ranked pods / quadrants played as region brackets');
  }
  if (format === 'REGIONAL_SEEDED' && selection === 'DISTRICT_FINISH' && qpd) {
    format = 'DISTRICT_FINISH';
    halves = regionsRaw.length === 2 ? regionsRaw.map((r) => r.name) : halves;
    regions = [];
  }
  if (format === 'REGIONAL_SEEDED' && namedLists && regionsRaw.length === 2 && !regionBracketSize) format = 'SECTIONAL';
  if (format === 'DISTRICT_FINISH' && regionsRaw.length === 2) {
    halves = regionsRaw.map((r) => r.name);
    regions = [];
  }
  if (format === 'DISTRICT_FINISH' && regionsRaw.length > 2) regions = [];
  if (!selection) {
    selection = format === 'DISTRICT_FINISH' || format === 'SECTIONAL' ? 'DISTRICT_FINISH' : 'RANKING';
    defaults.push(`selection: ${selection}`);
  }

  if (format === 'REGIONAL_SEEDED') {
    const listed = regionsRaw.length;
    if (fieldSize && regionBracketSize) {
      if (listed && listed * regionBracketSize === fieldSize) regionCount = listed;
      else if (listed && fitsRounds(listed * regionBracketSize, rounds.length)) {
        regionCount = listed;
        approximations.push(`fieldSize ${fieldSize} read per region: ${listed} x ${regionBracketSize} = ${listed * regionBracketSize}`);
        fieldSize = listed * regionBracketSize;
      } else {
        regionCount = Math.max(1, Math.round(fieldSize / regionBracketSize));
        if (listed && listed !== regionCount) approximations.push(`${listed} listed regions treated as halves of ${regionCount} region brackets (${fieldSize} / ${regionBracketSize})`);
      }
    } else if (listed) {
      regionCount = listed;
    } else {
      regionCount = fieldSize && regionBracketSize ? Math.round(fieldSize / regionBracketSize) : 4;
      if (!(fieldSize && regionBracketSize)) defaults.push('regionCount: 4');
    }
    if (listed && listed !== regionCount) {
      halves = regionsRaw.map((r) => r.name);
      regions = [];
    }
    if (!fieldSize) {
      fieldSize = regionBracketSize ? regionCount * regionBracketSize : null;
      if (!fieldSize) defaults.push('fieldSize: half of each region, capped by the round names');
    }
    if (!regionBracketSize && fieldSize) regionBracketSize = 2 ** pow2Rounds(Math.ceil(fieldSize / regionCount));
  }

  if (format === 'SECTIONAL') {
    // Leading section rounds (District Playoffs, Section Quarterfinal...), then the state rounds
    const leading = rounds.findIndex((r) => !isSectionLabel(r));
    const sectionLabels = leading < 0 ? rounds.length : leading;
    const stateRounds = Math.max(1, rounds.length - sectionLabels);
    sectionRounds = regionalRounds ?? Math.max(sectionLabels, 2);
    regionCount = 2 ** stateRounds;
    regionBracketSize = 2 ** sectionRounds;
    fieldSize = regionCount * regionBracketSize;
    halves = regionsRaw.length === 2 ? regionsRaw.map((r) => r.name) : halves;
    if (sectionLabels !== sectionRounds) approximations.push(`"${rounds[0] ?? 'Section'}" played as ${sectionRounds} section rounds`);
    regionalRounds = sectionRounds;
  }

  if (format === 'DISTRICT_FINISH' && !qpd) {
    qpd = 2;
    defaults.push('qualifiersPerDistrict: 2');
  }
  if ((format === 'STATEWIDE_RANKING' || format === 'FALLBACK') && !fieldSize) defaults.push('fieldSize: half the class, capped by the round names');

  const overrides = PLAYOFF_OVERRIDES[stateJson.state]?.(cls.class) ?? {};
  const { note, ...fields } = overrides;
  if (note) approximations.push(note);
  if (fields.sectionRounds && format === 'SECTIONAL') {
    sectionRounds = fields.sectionRounds;
    regionalRounds = sectionRounds;
    regionBracketSize = 2 ** sectionRounds;
    fieldSize = regionCount * regionBracketSize;
    delete fields.sectionRounds;
  } else delete fields.sectionRounds;
  if (fields.selection) selection = fields.selection;
  if (fields.championsSeededFirst !== undefined) championsSeededFirst = fields.championsSeededFirst;

  const winThreshold = selection === 'WIN_THRESHOLD' ? fields.winThreshold ?? 5 : null;
  if (selection === 'WIN_THRESHOLD' && fields.winThreshold === undefined) defaults.push('winThreshold: 5');

  // The shared calendar has six playoff weeks: a longer real bracket is compressed
  const plannedRounds = fieldSize ? pow2Rounds(fieldSize) : null;
  if (plannedRounds && plannedRounds > MAX_ROUNDS) approximations.push(`${plannedRounds}-round bracket compressed to ${MAX_ROUNDS} rounds (the national calendar)`);

  return {
    format,
    selection,
    fieldSize,
    qualifiersPerDistrict: qpd,
    winThreshold,
    statewideField: fields.statewideField ?? false,
    regions,
    regionCount,
    halves,
    regionBracketSize,
    regionalRounds,
    sectionRounds,
    championsSeededFirst,
    split,
    bracketNames,
    postseasonClassing: fields.postseasonClassing ?? false,
    rounds,
    championshipTitle: raw.championshipTitle ?? `${stateJson.governingBody?.split(/[ ;(]/)[0] ?? stateJson.state} ${cls.class} State Championship`,
    championshipVenue: raw.championshipVenue ?? null,
    _defaults: defaults,
    _approximations: approximations,
    _titleDefault: !raw.championshipTitle
  };
}

function buildState(file) {
  const json = JSON.parse(fs.readFileSync(path.join(rulesDir, file), 'utf8'));
  const csvFile = path.join(finalDir, file.replace(/\.json$/, '.csv'));
  const csv = fs.existsSync(csvFile) ? readCsvClasses(csvFile) : new Map();
  const byName = new Map(json.classes.map((c) => [c.class, c]));
  const rs = json.regularSeason ?? {};
  const classes = [];
  const districts = {};
  for (const cls of json.classes) {
    const seasonDefaults = [];
    let games = rs.games;
    if (games == null) {
      games = SEASON_DEFAULT_GAMES[json.state] ?? 10;
      seasonDefaults.push(`season.games: ${games}`);
    }
    const seasonOverride = SEASON_OVERRIDES[json.state]?.(cls.class) ?? {};
    const districtGames = seasonOverride.districtGames ?? rs.districtGames ?? null;
    if (districtGames == null) seasonDefaults.push('season.districtGames: district round robin, capped by the scheduling style');
    let scheduling = seasonOverride.scheduling ?? rs.scheduling;
    if (!scheduling) {
      scheduling = 'MIXED';
      seasonDefaults.push('season.scheduling: MIXED');
    }
    const p = buildClass(json, cls, byName);
    const { _defaults, _approximations, _titleDefault, ...playoffs } = p;
    if (_titleDefault) _defaults.push('championshipTitle: generated');
    const approximations = [..._approximations];
    if (seasonOverride.note) approximations.push(seasonOverride.note);
    if (scheduling === 'SELF_SCHEDULED' || scheduling === 'LEAGUE_ASSIGNED' || scheduling === 'MIXED')
      approximations.push(`${scheduling.toLowerCase().replace('_', '-')} schedule approximated by district games plus nearby opponents`);
    classes.push({
      state: json.state,
      governingBody: json.governingBody ?? '',
      className: cls.class,
      schools: cls.schools ?? null,
      districtLabel: json.districtLabel ?? 'District',
      season: { games, districtGames, scheduling },
      playoffs,
      defaults: [...seasonDefaults, ..._defaults],
      approximations
    });
    const sizes = csv.get(cls.class);
    districts[cls.class] = sizes ? [...sizes].map(([name, n]) => [name, n]) : [];
  }
  const missing = [...csv.keys()].filter((k) => !byName.has(k));
  return { state: json.state, classes, districts, missing };
}

// Every state with a rules file and a team list in final/ (a rules file without teams waits for them)
const allFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.json')).sort();
const files = allFiles.filter((f) => fs.existsSync(path.join(finalDir, f.replace(/\.json$/, '.csv'))));
const skipped = allFiles.filter((f) => !files.includes(f));
const states = files.map(buildState);

const rules = Object.fromEntries(states.map((s) => [s.state, s.classes]));
const ts = [
  '// Generated by scripts/build-state-rules.mjs from expansion/rules/*.json: do not edit by hand.',
  '// Per-state, per-class schedule and playoff rules; see ClassRules in src/sim/classRules.ts.',
  "import type { ClassRules } from '../sim/classRules';",
  '',
  'export const STATE_CLASS_RULES: Record<string, ClassRules[]> = {',
  ...states.map(
    (s) => `  ${JSON.stringify(s.state)}: [\n${s.classes.map((c) => `    ${JSON.stringify(c)}`).join(',\n')}\n  ]`
  ).join(',\n').split('\n'),
  '};',
  ''
].join('\n');
fs.writeFileSync(path.join(repo, 'src', 'data', 'stateClassRules.ts'), ts);

const fixtureDir = path.join(repo, 'src', 'sim', 'tests', 'fixtures');
fs.mkdirSync(fixtureDir, { recursive: true });
fs.writeFileSync(path.join(fixtureDir, 'classDistricts.json'), JSON.stringify(Object.fromEntries(states.map((s) => [s.state, s.districts]))) + '\n');

const classCount = states.reduce((n, s) => n + s.classes.length, 0);
const defaulted = states.reduce((n, s) => n + s.classes.filter((c) => c.defaults.length).length, 0);
console.log(`${states.length} states, ${classCount} classes (${defaulted} with defaults) -> src/data/stateClassRules.ts`);
if (skipped.length) console.log(`  skipped (no team list in final/): ${skipped.join(', ')}`);
states.filter((s) => s.missing.length).forEach((s) => console.log(`  ${s.state}: classes in final/ without rules: ${s.missing.join(', ')}`));
void rules;
