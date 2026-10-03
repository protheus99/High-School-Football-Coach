import { describe, it, expect } from 'vitest';
import { buildTexasLeague, leagueRegionTeams, playoffRoundCount } from '../league';
import { simulateRegularSeason } from '../scheduleEngine';
import { buildPlayoffBracket, ROUND_LABELS } from '../playoffEngine';
import { evaluateAcademicReport, isAcademicallyAtRisk } from '../playerEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GEORGIA_RULES, PLAYABLE_STATES, StateRules, TEXAS_RULES, rulesForState } from '../stateRules';
import { generateSeasonSchedule } from '../scheduleEngine';
import type { PlayoffBracketState } from '../playoffEngine';
import { buildStateWorld } from '../league';
import { calculateDistrictStandings } from '../districtEngine';
import { advancePlayoffRound, powerRatings } from '../playoffEngine';

// A made-up state: top two per district, one statewide bracket, a 1.5 grade line, no mercy rule
const TEST_RULES: StateRules = {
  ...TEXAS_RULES,
  state: 'Testland',
  playoffs: { ...TEXAS_RULES.playoffs, qualifiersPerDistrict: 2, divisionSplit: 'NONE', divisionNames: ['State'], championshipTitle: 'Testland Bowl', championshipVenue: 'Test Field' },
  academics: { ruleName: 'Test rule', minimumGpa: 1.5, atRiskGpa: 1.8 },
  mercyRuleMargin: null
};

describe('State rules', () => {
  it('every state in the game is playable; Texas is the default for anything else', () => {
    expect(PLAYABLE_STATES).toEqual(['Texas', 'Georgia', 'Florida', 'Maryland', 'North Carolina', 'Alabama', 'Tennessee', 'Ohio', 'Pennsylvania', 'New Jersey', 'Louisiana', 'California']);
    expect(rulesForState('Georgia')).toBe(GEORGIA_RULES);
    expect(rulesForState('Nevada')).toBe(TEXAS_RULES);
    expect(rulesForState(undefined)).toBe(TEXAS_RULES);
    expect(ROUND_LABELS).toBe(TEXAS_RULES.playoffs.roundLabels);
  });

  it('drives the playoff bracket: qualifiers, divisions and title come from the rules', () => {
    const { league, teams } = buildTexasLeague();
    const regionTeams = leagueRegionTeams(league, teams);
    simulateRegularSeason(regionTeams, 2026);
    const regions = league.regions.map((r, i) => ({ name: r.name, districts: regionTeams[i] }));

    const texas = buildPlayoffBracket(regions, { splitDivisions: true, rules: TEXAS_RULES });
    expect(texas.divisions.map((d) => d.name)).toEqual(['Division 1', 'Division 2']);
    expect(texas.championshipTitle).toBe('UIL 6A State Championship');
    expect(playoffRoundCount(league)).toBe(6);

    const test = buildPlayoffBracket(regions, { splitDivisions: true, rules: TEST_RULES });
    expect(test.divisions.map((d) => d.name)).toEqual(['State']);
    expect(test.divisions[0].rounds[0]).toHaveLength(32); // 32 districts x 2 qualifiers = 64 teams
    expect(test.championshipTitle).toBe('Testland Bowl');
  });

  it('drives grades: the eligibility line and the at-risk flag come from the rules', () => {
    const [team] = generateDistrictTeams();
    const p = team.roster[0];
    p.academics.gpa = 1.7;
    expect(isAcademicallyAtRisk({ ...p, academics: { ...p.academics, isEligible: true } }, TEST_RULES)).toBe(true);
    p.academics.gpa = 1.9;
    expect(isAcademicallyAtRisk({ ...p, academics: { ...p.academics, isEligible: true } }, TEST_RULES)).toBe(false);
    expect(isAcademicallyAtRisk({ ...p, academics: { ...p.academics, isEligible: true } }, TEXAS_RULES)).toBe(true);
    // A 1.7 average keeps a player eligible under a 1.5 line but not under Texas's 2.0
    const runs = 300;
    let eligibleTest = 0;
    let eligibleTexas = 0;
    for (let i = 0; i < runs; i++) {
      const a = { ...p, academics: { ...p.academics, gpa: 1.8 } };
      evaluateAcademicReport(a, 0, TEST_RULES);
      if (a.academics.isEligible) eligibleTest++;
      const b = { ...p, academics: { ...p.academics, gpa: 1.8 } };
      evaluateAcademicReport(b, 0, TEXAS_RULES);
      if (b.academics.isEligible) eligibleTexas++;
    }
    expect(eligibleTest).toBeGreaterThan(eligibleTexas);
  });
});

describe('Georgia (GHSA 7A)', () => {
  it('builds the whole class: 51 teams in 8 regions, a 5-round playoff', () => {
    const { league, teams } = buildStateWorld('Georgia');
    expect(teams).toHaveLength(51);
    expect(league.regions[0].districts).toHaveLength(8);
    expect(teams.every((t) => t.state === 'Georgia')).toBe(true);
    expect(playoffRoundCount(league)).toBe(5);
  });

  it('seeds 32 teams by power ranking, guarantees region champions a top-16 seed, and crowns a champion', () => {
    const { league, teams } = buildStateWorld('Georgia');
    const regionTeams = leagueRegionTeams(league, teams);
    const schedule = simulateRegularSeason(regionTeams, 2026);
    const regions = league.regions.map((r, i) => ({ name: r.name, districts: regionTeams[i] }));
    let bracket = buildPlayoffBracket(regions, { splitDivisions: false, rules: GEORGIA_RULES, schedule });
    const firstRound = bracket.divisions[0].rounds[0];
    expect(firstRound).toHaveLength(16);
    expect(bracket.championshipTitle).toBe('GHSA 7A State Championship');
    // Seed order 1v32, 16v17, ...: the top half hosts every first-round game
    const hosts = new Set(firstRound.map((n) => n.team1.id));
    const ratings = powerRatings(teams, schedule);
    expect([...ratings.values()].some((r) => r > 0)).toBe(true);
    regionTeams[0].forEach((district) => {
      const champion = calculateDistrictStandings(district)[0].teamId;
      expect(hosts.has(champion)).toBe(true);
    });
    for (let round = 0; round < 5; round++) bracket = advancePlayoffRound(bracket);
    expect(bracket.divisions[0].championTeamId).toBeTruthy();
    expect(bracket.isPlayoffsActive).toBe(false);
  });
});

describe('Regional playoff states', () => {
  // A played regular season and the state's bracket
  const season = (state: string) => {
    const { league, teams } = buildStateWorld(state);
    const regionTeams = leagueRegionTeams(league, teams);
    const schedule = simulateRegularSeason(regionTeams, 2026);
    const regions = league.regions.map((r, i) => ({ name: r.name, districts: regionTeams[i] }));
    const bracket = buildPlayoffBracket(regions, { splitDivisions: false, rules: rulesForState(state), schedule });
    return { league, teams, regionTeams, bracket };
  };
  const finish = (bracket: PlayoffBracketState) => {
    let b = bracket;
    while (b.isPlayoffsActive) b = advancePlayoffRound(b);
    return b.divisions[0].championTeamId;
  };

  it.each(['Florida', 'Maryland', 'North Carolina', 'Alabama', 'Pennsylvania', 'New Jersey', 'California'])('%s builds its whole class and crowns a champion in five rounds', (state) => {
    const { league, teams, bracket } = season(state);
    expect(teams.every((t) => t.state === state)).toBe(true);
    expect(playoffRoundCount(league)).toBe(5);
    expect(bracket.roundNames).toHaveLength(5);
    expect(bracket.divisions[0].rounds[0]).toHaveLength(16);
    expect(bracket.championshipTitle).toBe(rulesForState(state).playoffs.championshipTitle);
    expect(finish(bracket)).toBeTruthy();
  });

  it('Florida: district champions take seeds 1-4 in their region', () => {
    const { regionTeams, bracket } = season('Florida');
    const champions = new Set(regionTeams[0].map((d) => calculateDistrictStandings(d)[0].teamId));
    const r1 = bracket.divisions[0].rounds[0];
    // Each region's four games are 1v8, 4v5, 3v6, 2v7: the host of every game is a top-4 seed
    r1.forEach((node) => expect(champions.has(node.team1.id)).toBe(true));
    expect(r1.every((n) => !n.isBye)).toBe(true);
  });

  it('Alabama: the top six in each region qualify and the top two have byes', () => {
    const { regionTeams, bracket } = season('Alabama');
    const r1 = bracket.divisions[0].rounds[0];
    expect(r1.filter((n) => n.isBye)).toHaveLength(8);
    regionTeams[0].forEach((district) => {
      const [first, second] = calculateDistrictStandings(district).map((row) => row.teamId);
      expect(r1.find((n) => n.team1.id === first)?.isBye).toBe(true);
      expect(r1.find((n) => n.team1.id === second)?.isBye).toBe(true);
    });
  });

  it('Maryland and Alabama send two per region to a cross-region state quarterfinal', () => {
    for (const state of ['Maryland', 'Alabama']) {
      let { bracket } = season(state);
      bracket = advancePlayoffRound(advancePlayoffRound(bracket));
      const quarterfinals = bracket.divisions[0].rounds[2];
      expect(quarterfinals).toHaveLength(4);
      quarterfinals.forEach((n) => expect(n.region).toBeUndefined()); // the two teams come from different regions
    }
  });

  it('North Carolina: 24 teams by ranking, 12 East and 12 West, the top four on each side with a bye', () => {
    const { bracket } = season('North Carolina');
    const r1 = bracket.divisions[0].rounds[0];
    const teamsIn = (side: string) => new Set(r1.filter((n) => n.region === side).flatMap((n) => [n.team1.id, n.team2.id]));
    expect(teamsIn('East').size).toBe(12);
    expect(teamsIn('West').size).toBe(12);
    expect(r1.filter((n) => n.isBye)).toHaveLength(8);
  });

  it('small and uneven districts still get a (nearly) full schedule', () => {
    for (const state of ['Maryland', 'Alabama']) {
      const { league, teams } = buildStateWorld(state);
      const schedule = generateSeasonSchedule(leagueRegionTeams(league, teams), 2026);
      // Ten games each; the elite showcase week can leave the odd team a game short
      const games = teams.map((t) => schedule.filter((g) => g.homeTeamId === t.id || g.awayTeamId === t.id).length);
      expect(Math.min(...games)).toBeGreaterThanOrEqual(9);
      expect(games.filter((n) => n < 10).length).toBeLessThanOrEqual(4);
      // nobody plays twice in a week or meets the same opponent twice
      const pairs = schedule.map((g) => [g.homeTeamId, g.awayTeamId].sort().join('|'));
      expect(new Set(pairs).size).toBe(pairs.length);
      const slots = schedule.flatMap((g) => [`${g.week}:${g.homeTeamId}`, `${g.week}:${g.awayTeamId}`]);
      expect(new Set(slots).size).toBe(slots.length);
    }
  });

  it('Tennessee: the top four in each region, the first round crossing paired regions (1 v 4, 2 v 3)', () => {
    const { league, regionTeams, bracket } = season('Tennessee');
    expect(playoffRoundCount(league)).toBe(5);
    const r1 = bracket.divisions[0].rounds[0];
    expect(r1).toHaveLength(16);
    const standings = regionTeams[0].map((d) => calculateDistrictStandings(d).map((row) => row.teamId));
    const placeOf = new Map(standings.flatMap((ids, d) => ids.map((id, place) => [id, { d, place }] as const)));
    r1.forEach((n) => {
      const home = placeOf.get(n.team1.id)!;
      const away = placeOf.get(n.team2.id)!;
      expect(home.place + away.place).toBe(3); // 1st v 4th, 2nd v 3rd
      expect(Math.floor(home.d / 2)).toBe(Math.floor(away.d / 2)); // paired regions (1-2, 3-4, ...)
      expect(home.d).not.toBe(away.d);
    });
    standings.forEach((ids) => ids.slice(0, 4).forEach((id) => expect(r1.some((n) => n.team1.id === id || n.team2.id === id)).toBe(true)));
    expect(finish(bracket)).toBeTruthy();
  });

  it('Ohio: twelve per region (four with byes), six rounds, region champions meet in the state semifinals', () => {
    const { league, bracket } = season('Ohio');
    expect(playoffRoundCount(league)).toBe(6);
    expect(bracket.roundNames).toEqual(['BI_DISTRICT', 'AREA', 'REGIONAL_SEMIFINAL', 'REGIONAL_FINAL', 'STATE_SEMIFINAL', 'STATE_FINAL']);
    const r1 = bracket.divisions[0].rounds[0];
    expect(r1).toHaveLength(32);
    expect(r1.filter((n) => n.isBye)).toHaveLength(16);
    let b = bracket;
    for (let i = 0; i < 4; i++) b = advancePlayoffRound(b);
    expect(b.divisions[0].rounds[4]).toHaveLength(2);
    b.divisions[0].rounds[4].forEach((n) => expect(n.region).toBeUndefined());
    expect(finish(b)).toBeTruthy();
  });

  it('Pennsylvania: league champions take the top seeds in their playoff region', () => {
    const { regionTeams, bracket } = season('Pennsylvania');
    const champions = new Set(regionTeams[0].map((d) => calculateDistrictStandings(d)[0].teamId));
    const r1 = bracket.divisions[0].rounds[0];
    // Ten league champions across four regions: every one is seeded and hosts its first game
    champions.forEach((id) => expect(r1.some((n) => n.team1.id === id)).toBe(true));
  });

  it('Louisiana: a 32-team bracket by power rating, district champions hosting', () => {
    const { league, regionTeams, bracket } = season('Louisiana');
    expect(playoffRoundCount(league)).toBe(5);
    const r1 = bracket.divisions[0].rounds[0];
    expect(r1).toHaveLength(16);
    const hosts = new Set(r1.map((n) => n.team1.id));
    regionTeams[0].forEach((district) => expect(hosts.has(calculateDistrictStandings(district)[0].teamId)).toBe(true));
    expect(bracket.championshipTitle).toBe('LHSAA 5A State Championship');
    expect(finish(bracket)).toBeTruthy();
  });

  it('California: section champions, then South v South and North v North, then a North v South final', () => {
    const { bracket } = season('California');
    const r1 = bracket.divisions[0].rounds[0];
    expect(new Set(r1.map((n) => n.region))).toEqual(new Set(['Southern Section', 'San Diego Section', 'Bay Area', 'Central Valley']));
    let b = bracket;
    for (let i = 0; i < 3; i++) b = advancePlayoffRound(b);
    const bowls = b.divisions[0].rounds[3];
    expect(bowls).toHaveLength(2);
    const regionOf = new Map(r1.flatMap((n) => [[n.team1.id, n.region], [n.team2.id, n.region]]));
    expect(new Set([regionOf.get(bowls[0].team1.id), regionOf.get(bowls[0].team2.id)])).toEqual(new Set(['Southern Section', 'San Diego Section']));
    expect(new Set([regionOf.get(bowls[1].team1.id), regionOf.get(bowls[1].team2.id)])).toEqual(new Set(['Bay Area', 'Central Valley']));
    expect(finish(b)).toBeTruthy();
  });
});
