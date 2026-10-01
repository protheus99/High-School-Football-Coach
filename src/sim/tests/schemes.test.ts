import { describe, it, expect } from 'vitest';
import { simulateSnap } from '../matchEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { DefensiveScheme, GameSimulationState, OffensiveScheme, PlayConcept, Team } from '../../types/game';

const [offense, defense] = generateDistrictTeams();

function snapState(overrides: Partial<GameSimulationState> = {}): GameSimulationState {
  return {
    gameId: 'scheme_test',
    homeTeam: offense,
    awayTeam: defense,
    homeScore: 0,
    awayScore: 0,
    weather: 'CLEAR',
    temperatureFahrenheit: 70,
    windSpeedMph: 5,
    teamMomentum: 0,
    currentQuarter: 1,
    clockSecondsRemaining: 720,
    possessionTeamId: offense.id,
    down: 1,
    distance: 10,
    yardLine: 30,
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: [],
    gameDayForm: { [offense.id]: 0, [defense.id]: 0 },
    ...overrides
  };
}

const withSchemes = (team: Team, off?: OffensiveScheme, def?: DefensiveScheme) => {
  if (off) team.schemeOffense = off;
  if (def) team.schemeDefense = def;
};

function passRate(scheme: OffensiveScheme): number {
  let passes = 0;
  const trials = 3000;
  for (let i = 0; i < trials; i++) {
    const concept = simulateSnap(snapState({ offensiveGamePlan: { [offense.id]: scheme } })).event.playConcept;
    if (concept === 'SHORT_PASS' || concept === 'DEEP_PASS') passes++;
  }
  return passes / trials;
}

function averageGain(concept: PlayConcept, defScheme: DefensiveScheme): number {
  withSchemes(defense, undefined, defScheme);
  let total = 0;
  const trials = 3000;
  for (let i = 0; i < trials; i++) total += simulateSnap(snapState(), concept, 'BASE').event.yardsGained;
  return total / trials;
}

describe('Offensive schemes', () => {
  it('Air Raid throws far more than the Triple Option', () => {
    expect(passRate('AIR_RAID')).toBeGreaterThan(passRate('TRIPLE_OPTION') + 0.25);
  });

  it('uses the pre-game offensive plan over the team default', () => {
    withSchemes(offense, 'TRIPLE_OPTION');
    expect(passRate('AIR_RAID')).toBeGreaterThan(0.6);
  });

  it('never lets an option quarterback get sacked', () => {
    for (let i = 0; i < 2000; i++) {
      const event = simulateSnap(snapState({ offensiveGamePlan: { [offense.id]: 'TRIPLE_OPTION' } }), 'SHORT_PASS', 'BLITZ').event;
      expect(event.textCommentary).not.toMatch(/SACKED/);
    }
  });
});

describe('Defensive schemes', () => {
  it('a 4-4 heavy box holds inside runs better than a Drop-8 zone', () => {
    expect(averageGain('INSIDE_RUN', 'FOUR_FOUR')).toBeLessThan(averageGain('INSIDE_RUN', 'DROP_EIGHT'));
  });

  it('a Drop-8 zone limits deep passes better than a 4-4 heavy box', () => {
    expect(averageGain('DEEP_PASS', 'DROP_EIGHT')).toBeLessThan(averageGain('DEEP_PASS', 'FOUR_FOUR'));
  });
});
