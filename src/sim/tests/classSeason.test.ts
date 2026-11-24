import { describe, it, expect } from 'vitest';
import type { ScheduledGame, Team } from '../../types/game';
import { CLASS_RULE_STATES, ClassRules, classRulesFor, stateClasses } from '../classRules';
import { buildClassPlayoffs, ClassDistrict, fitRoundNames, GameSim, generateClassSchedule, playClassSchedule, postseasonClassFields, seasonPlayWeeks } from '../classSeason';
import { advancePlayoffRound, bracketRoundLabel, bracketRoundWeek, PlayoffBracketState, PlayoffGameSim } from '../playoffEngine';
import { FIRST_NON_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK, MAX_PLAYOFF_ROUNDS, STATE_FINAL_WEEK } from '../scheduleEngine';
import { rulesForState, STATE_RULES } from '../stateRules';
import classDistricts from './fixtures/classDistricts.json';
import { groupUnnamedDistricts } from '../classLeague';
import type { TeamSchool } from '../../data/teamData';

// Every class of the 51 states (with DC) in expansion/final, played as a synthetic league with the team lists' district sizes
// (src/sim/tests/fixtures/classDistricts.json, generated with the rules by scripts/build-state-rules.mjs).

const DISTRICTS = classDistricts as unknown as Record<string, Record<string, [string, number][]>>;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const freshRecord = () => ({ wins: 0, losses: 0, districtWins: 0, districtLosses: 0, pointsFor: 0, pointsAgainst: 0, districtPointDifferential: 0, headToHeadHistory: {} });

/** A light synthetic team: only what the season and playoff engines read. */
function makeTeam(id: string, name: string, district: string, rating: number, enrollment: number): Team {
  return { id, name, mascot: '', classification: '6A', districtId: district, primaryColor: '#000', secondaryColor: '#fff', prestige: Math.round(rating), roster: [], record: freshRecord(), lightRating: rating, enrollment } as unknown as Team;
}

function buildLeague(state: string, rules: ClassRules, random: () => number, enrollmentBase = 1000): ClassDistrict[] {
  const sizes = DISTRICTS[state]?.[rules.className] ?? [];
  const slug = `${state}_${rules.className}`.replace(/[^A-Za-z0-9]+/g, '_');
  let n = 0;
  // Classes with no district data are grouped the way the game does it (classLeague.ts)
  const school = (): TeamSchool => {
    n++;
    const name = n % 9 === 0 ? `St. Example ${n}` : `School ${n}`; // some private-sounding names (Louisiana select)
    return { id: `${slug}_${n}`, name, primaryColor: '#000', secondaryColor: '#fff', prestige: 70, offenseScheme: 'SPREAD', defenseScheme: 'FOUR_THREE' };
  };
  const grouped = groupUnnamedDistricts(
    sizes.map(([name, count]) => ({ name, schools: Array.from({ length: count }, school) })),
    rules
  );
  return grouped.map((d, i) => ({
    name: d.name || `District ${i + 1}`,
    teams: d.schools.map((s) => makeTeam(s.id, s.name, d.name, 55 + random() * 30, Math.round(enrollmentBase + random() * 600)))
  }));
}

/** A fast seeded game: the better-rated team usually wins, never a tie. */
function seededGames(random: () => number): { regular: GameSim; playoff: PlayoffGameSim } {
  const score = (home: Team, away: Team) => {
    const edge = (home.lightRating ?? 70) - (away.lightRating ?? 70) + 1.5;
    const homeScore = Math.max(0, Math.round(24 + edge * 1.2 + (random() - 0.5) * 28));
    let awayScore = Math.max(0, Math.round(24 - edge * 1.2 + (random() - 0.5) * 28));
    if (awayScore === homeScore) awayScore += random() < 0.5 ? 3 : -Math.min(3, awayScore);
    if (awayScore === homeScore) awayScore = homeScore + 7;
    return { homeScore, awayScore };
  };
  return { regular: (_id, _w, home, away) => score(home, away), playoff: (node) => score(node.team1, node.team2) };
}

/** No team in two games of a week. */
function expectOneGameAWeek(schedule: ScheduledGame[]) {
  const seen = new Set<string>();
  schedule.forEach((g) => {
    expect(g.homeTeamId).not.toBe(g.awayTeamId);
    [g.homeTeamId, g.awayTeamId].forEach((id) => {
      const key = `${g.week}:${id}`;
      expect(seen.has(key), `${id} twice in week ${g.week}`).toBe(false);
      seen.add(key);
    });
  });
}

/** Plays a bracket to the end: one champion per bracket, nobody twice in a playoff week. */
function playBracket(bracket: PlayoffBracketState, play: PlayoffGameSim): PlayoffBracketState {
  let b = bracket;
  let guard = 0;
  while (b.isPlayoffsActive && guard++ < 10) {
    const round = b.currentRoundIndex;
    const ids = b.divisions.flatMap((d) => (d.rounds[round] ?? []).flatMap((n) => (n.isBye ? [n.team1.id] : [n.team1.id, n.team2.id])));
    expect(new Set(ids).size).toBe(ids.length);
    b = advancePlayoffRound(b, play);
  }
  expect(b.isPlayoffsActive).toBe(false);
  return b;
}

const allClasses = CLASS_RULE_STATES.flatMap((state) => stateClasses(state).map((rules) => ({ state, rules })));

describe('Per-class rules data', () => {
  it('covers every state with a team list (50 states and DC) and every class in expansion/final', () => {
    expect(CLASS_RULE_STATES).toHaveLength(51);
    CLASS_RULE_STATES.forEach((state) => {
      const listed = Object.keys(DISTRICTS[state] ?? {});
      expect(stateClasses(state).map((c) => c.className).sort()).toEqual(listed.sort());
    });
    expect(allClasses.length).toBeGreaterThan(150);
  });

  it('resolves playoffsSameAs and records the defaults it applied', () => {
    const fiveA = classRulesFor('Texas', '5A-D1')!;
    expect(fiveA.playoffs.format).toBe('DISTRICT_FINISH');
    expect(fiveA.playoffs.qualifiersPerDistrict).toBe(4);
    expect(fiveA.playoffs.championshipTitle).toBe('UIL Class 5A Division I State Championship');
    expect(classRulesFor('Texas', '6A')!.playoffs.split).toBe('ENROLLMENT');
    expect(classRulesFor('Louisiana', '5A')!.playoffs.split).toBe('SELECT');
    expect(classRulesFor('Maryland', '1A')!.defaults).toContain('season.games: 10');
    expect(classRulesFor('Alabama', 'A')!.playoffs.format).toBe('FALLBACK');
    expect(classRulesFor('Illinois', '1A')!.playoffs.selection).toBe('WIN_THRESHOLD');
    expect(classRulesFor('Michigan', 'D1')!.playoffs.selection).toBe('POINTS');
    allClasses.forEach(({ rules }) => {
      expect(rules.season.games).toBeGreaterThan(0);
      if (rules.playoffs.rounds.length === 0) expect(rules.defaults.some((d) => d.startsWith('rounds'))).toBe(true);
    });
  });

  it('fits round names to the bracket: drops leading rounds, splits a regional round', () => {
    expect(fitRoundNames(['Bi-District', 'Area', 'Regional', 'State Semifinal', 'State Final'], 6)).toEqual([
      'Bi-District', 'Area', 'Regional Semifinal', 'Regional Final', 'State Semifinal', 'State Final'
    ]);
    expect(fitRoundNames(['First Round', 'Second Round', 'Third Round', 'Fourth Round', 'Regionals', 'State Championship'], 5)[0]).toBe('Second Round');
    expect(fitRoundNames(['District Playoffs', 'State Quarterfinals', 'State Semifinals', 'State Championship'], 5).slice(0, 2)).toEqual(['District Semifinal', 'District Final']);
    expect(fitRoundNames([], 3)).toEqual(['Quarterfinal', 'State Semifinal', 'State Championship']);
    expect(fitRoundNames(['Final'], 0)).toEqual([]);
  });

  it('spreads short seasons over the ten regular-season weeks', () => {
    expect(seasonPlayWeeks(10)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(seasonPlayWeeks(8)).toHaveLength(8);
    expect(seasonPlayWeeks(8)[7]).toBe(LAST_REGULAR_SEASON_WEEK);
    expect(seasonPlayWeeks(9, [FIRST_NON_DISTRICT_WEEK])).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });
});

describe('Every class plays a full season and playoffs', () => {
  it('one champion per bracket, one game a week, field and rounds from the data', () => {
    const random = mulberry32(20261121);
    const sims = seededGames(random);
    let totalGames = 0;
    let totalSlots = 0;
    for (const { state, rules } of allClasses) {
      const where = `${state} ${rules.className}`;
      const districts = buildLeague(state, rules, random);
      const teams = districts.flatMap((d) => d.teams);
      expect(teams.length, where).toBeGreaterThan(0);

      // Regular season
      const schedule = generateClassSchedule(districts, rules, 2026, { random });
      expectOneGameAWeek(schedule);
      const games = new Map<string, number>();
      schedule.forEach((g) => [g.homeTeamId, g.awayTeamId].forEach((id) => games.set(id, (games.get(id) ?? 0) + 1)));
      schedule.forEach((g) => expect(g.week >= FIRST_NON_DISTRICT_WEEK && g.week <= LAST_REGULAR_SEASON_WEEK, where).toBe(true));
      teams.forEach((t) => expect(games.get(t.id) ?? 0, where).toBeLessThanOrEqual(rules.season.games));
      // A class plays only itself here (real schedules fill gaps with other classes): most of a full season
      if (teams.length >= 16) { // smaller classes (Hawaii, Alaska) fill real schedules with other classes
        const played = teams.reduce((n, t) => n + (games.get(t.id) ?? 0), 0);
        expect(played / (teams.length * rules.season.games), `${where}: share of a full schedule`).toBeGreaterThan(0.8);
        totalGames += played;
        totalSlots += teams.length * rules.season.games;
      }
      playClassSchedule(teams, schedule, sims.regular);

      // Playoffs
      const { bracket, fieldSizes, notes } = buildClassPlayoffs(districts, rules, schedule);
      const rounds = bracket.roundNames.length;
      expect(rounds, where).toBeLessThanOrEqual(MAX_PLAYOFF_ROUNDS);
      expect(bracket.roundLabels, where).toEqual(fitRoundNames(rules.playoffs.rounds, rounds));
      // The round count matches the data, or the fitted names say why not
      if (rules.playoffs.rounds.length && rules.playoffs.rounds.length !== rounds) expect(notes.some((n) => n.includes('round names fitted')), where).toBe(true);
      expect(bracket.divisions.length, where).toBeGreaterThan(0);
      expect(bracket.divisions.length, where).toBeLessThanOrEqual(Math.max(1, rules.playoffs.bracketNames.length));
      bracket.divisions.forEach((d, i) => {
        const entered = new Set((d.rounds[0] ?? []).flatMap((n) => [n.team1.id, n.team2.id]));
        if (rounds > 0) expect(entered.size, where).toBe(fieldSizes[i]);
        expect(fieldSizes[i], where).toBeLessThanOrEqual(2 ** rounds);
        if (rounds > 0) expect(fieldSizes[i], where).toBeGreaterThan(2 ** (rounds - 1) / (bracket.divisions.length > 1 ? 16 : 1));
        const { fieldSize, format, qualifiersPerDistrict } = rules.playoffs;
        if (fieldSize && format !== 'DISTRICT_FINISH') expect(fieldSizes[i], where).toBeLessThanOrEqual(fieldSize);
        if (fieldSize && format === 'STATEWIDE_RANKING' && rules.playoffs.split === 'NONE') expect(fieldSizes[i], where).toBe(Math.min(fieldSize, teams.length));
        if (format === 'DISTRICT_FINISH') expect(fieldSizes[i], where).toBeLessThanOrEqual(districts.length * (qualifiersPerDistrict ?? 2));
      });
      // The final is in the shared title week
      if (rounds > 0) expect(bracketRoundWeek(bracket, rounds - 1), where).toBe(STATE_FINAL_WEEK);

      const done = playBracket(bracket, sims.playoff);
      done.divisions.forEach((d) => {
        expect(d.championTeamId, `${where} ${d.name}`).toBeDefined();
        if (rounds > 0) expect(d.rounds[rounds - 1], `${where} ${d.name}`).toHaveLength(1);
        expect(teams.some((t) => t.id === d.championTeamId), where).toBe(true);
      });
    }
    expect(totalGames / totalSlots).toBeGreaterThan(0.93);
  }, 30_000);

  it('matches the playable states\' top-class brackets (round count and field)', () => {
    const random = mulberry32(7);
    const sims = seededGames(random);
    const legacy: Record<string, string> = {
      Texas: '6A', Georgia: '7A', Florida: '6A', Maryland: '4A', 'North Carolina': '8A', Alabama: '6A', Tennessee: '6A',
      Ohio: 'D1', Pennsylvania: '6A', 'New Jersey': 'Group 5', Louisiana: '5A'
    };
    Object.entries(legacy).forEach(([state, className]) => {
      const rules = classRulesFor(state, className)!;
      const old = rulesForState(state).playoffs;
      const districts = buildLeague(state, rules, random, 1800);
      const teams = districts.flatMap((d) => d.teams);
      const schedule = generateClassSchedule(districts, rules, 2026, { random });
      playClassSchedule(teams, schedule, sims.regular);
      const { bracket } = buildClassPlayoffs(districts, rules, schedule);
      const oldRounds = old.format === 'STATEWIDE_RANKING' ? Math.log2(old.bracketSize) : old.regional ? Math.log2(old.regional.regions.length * old.regional.regionBracketSize) : 6;
      expect(bracket.roundNames.length, state).toBe(oldRounds);
      expect(bracket.divisions.length, state).toBe(state === 'Texas' || state === 'Louisiana' ? 2 : 1); // UIL D1/D2; LHSAA select / non-select
      expect(STATE_RULES[state]).toBeDefined();
      playBracket(bracket, sims.playoff);
    });
  });

  it('Illinois: qualifiers by wins, then classed by enrollment after the season', () => {
    const random = mulberry32(99);
    const sims = seededGames(random);
    const classes = stateClasses('Illinois').map((rules, i) => ({ rules, districts: buildLeague('Illinois', rules, random, 200 + i * 250) }));
    const schedules = classes.map(({ rules, districts }) => {
      const schedule = generateClassSchedule(districts, rules, 2026, { random });
      playClassSchedule(districts.flatMap((d) => d.teams), schedule, sims.regular);
      return schedule;
    });
    const schedule = schedules.flat();
    const fields = postseasonClassFields(classes.map((c) => ({ rules: c.rules, teams: c.districts.flatMap((d) => d.teams) })), schedule);
    const all = [...fields.values()].flat();
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    classes.forEach(({ rules }) => expect(fields.get(rules.className)).toHaveLength(48));
    // Bigger classes hold the bigger schools
    const minOf = (name: string) => Math.min(...fields.get(name)!.map((t) => t.enrollment ?? 0));
    const maxOf = (name: string) => Math.max(...fields.get(name)!.map((t) => t.enrollment ?? 0));
    expect(minOf('8A')).toBeGreaterThanOrEqual(maxOf('7A'));
    expect(minOf('2A')).toBeGreaterThanOrEqual(maxOf('1A'));
    // Wins decide who's in: no team left out has more wins than a qualifier, and most qualifiers cleared three
    const inField = new Set(all.map((t) => t.id));
    const fewestIn = Math.min(...all.map((t) => t.record.wins));
    classes.flatMap((c) => c.districts.flatMap((d) => d.teams)).filter((t) => !inField.has(t.id)).forEach((t) => expect(t.record.wins).toBeLessThanOrEqual(fewestIn));
    expect(all.filter((t) => t.record.wins >= 3).length / all.length).toBeGreaterThan(0.75);
    classes.forEach(({ rules }) => {
      const field = fields.get(rules.className)!;
      const { bracket, fieldSizes } = buildClassPlayoffs([{ name: rules.className, teams: field }], rules, schedule, { fields: [field] });
      expect(fieldSizes).toEqual([48]);
      expect(bracket.roundNames).toHaveLength(6);
      const done = playBracket(bracket, sims.playoff);
      expect(done.divisions[0].championTeamId).toBeDefined();
    });
  });

  it('round labels: the bracket\'s own names, else the state\'s labels (older saves)', () => {
    const labels = rulesForState('Texas').playoffs.roundLabels;
    expect(bracketRoundLabel({ roundNames: ['BI_DISTRICT'], roundLabels: ['Opening'] }, 0, labels)).toBe('Opening');
    expect(bracketRoundLabel({ roundNames: ['BI_DISTRICT'] }, 0, labels)).toBe('Bi-District');
    expect(bracketRoundLabel({ roundNames: [] }, 3, labels)).toBe('');
  });
});
