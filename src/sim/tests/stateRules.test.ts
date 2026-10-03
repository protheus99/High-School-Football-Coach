import { describe, it, expect } from 'vitest';
import { buildTexasLeague, leagueRegionTeams, playoffRoundCount } from '../league';
import { simulateRegularSeason } from '../scheduleEngine';
import { buildPlayoffBracket, ROUND_LABELS } from '../playoffEngine';
import { evaluateAcademicReport, isAcademicallyAtRisk } from '../playerEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { PLAYABLE_STATES, StateRules, TEXAS_RULES, rulesForState } from '../stateRules';

// A made-up state: top two per district, one statewide bracket, a 1.5 grade line, no mercy rule
const TEST_RULES: StateRules = {
  ...TEXAS_RULES,
  state: 'Testland',
  playoffs: { ...TEXAS_RULES.playoffs, qualifiersPerDistrict: 2, divisionSplit: 'NONE', divisionNames: ['State'], championshipTitle: 'Testland Bowl', championshipVenue: 'Test Field' },
  academics: { ruleName: 'Test rule', minimumGpa: 1.5, atRiskGpa: 1.8 },
  mercyRuleMargin: null
};

describe('State rules', () => {
  it('Texas is the only playable state and the default for anything else', () => {
    expect(PLAYABLE_STATES).toEqual(['Texas']);
    expect(rulesForState('Georgia')).toBe(TEXAS_RULES);
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
