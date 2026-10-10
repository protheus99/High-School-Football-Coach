import { describe, it, expect, vi } from 'vitest';
import { difficultyForPrestige, stateSchool, stateSchools } from '../league';
import { highlightName, searchSchools } from '../schoolSearch';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { coachTitle, useGameStore } from '../../store/gameStore';

describe('Pick any program: the school search', () => {
  const texas = stateSchools('Texas');

  it('lists every school in the state', () => {
    expect(texas).toHaveLength(254);
    expect(stateSchools('Georgia').length).toBeGreaterThan(0);
  });

  it('shows nothing until two letters are typed, then only schools whose name matches', () => {
    expect(searchSchools(texas, '')).toEqual([]);
    expect(searchSchools(texas, 'a')).toEqual([]);
    const austin = searchSchools(texas, 'aus');
    expect(austin.length).toBeGreaterThan(1);
    austin.forEach((s) => expect(s.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith('aus'))).toBe(true));
    // Mascots and cities don't count: "panthers" is a mascot, not part of a school name
    expect(searchSchools(texas, 'panthers')).toEqual([]);
    expect(searchSchools(texas, 'zzz')).toEqual([]);
  });

  it('matches parts of several words, best prestige first', () => {
    expect(searchSchools(texas, 'aus la').map((s) => s.name)).toContain('Austin Lake Travis');
    const katy = searchSchools(texas, 'katy');
    katy.slice(1).forEach((s, i) => expect(s.prestige).toBeLessThanOrEqual(katy[i].prestige));
  });

  it('highlights the matching start of each word', () => {
    expect(highlightName('Austin Lake Travis', 'aus la')).toEqual([
      ['Aus', true],
      ['tin', false],
      [' ', false],
      ['La', true],
      ['ke', false],
      [' ', false],
      ['Travis', false]
    ]);
  });
});

describe('Pick any program: the career', () => {
  it('starts the school at its own prestige, with the coach name on the team', () => {
    const school = 'South Garland';
    const data = stateSchool('Texas', school)!;
    useGameStore.getState().newScenarioGame('OPEN', 'Texas', school, 'Mike Smith', 5);
    const { career, leagueTeams, userTeamId, difficulty } = useGameStore.getState();
    const team = leagueTeams.find((t) => t.id === userTeamId)!;
    expect(team.name).toBe(school);
    expect(team.prestige).toBe(data.prestige);
    expect(team.staff.headCoachName).toBe('Coach Mike Smith');
    expect(career).toMatchObject({ scenario: 'OPEN', startingSchool: school, startingProgram: school, coachName: 'Mike Smith' });
    expect(difficulty).toBe(difficultyForPrestige(data.prestige));
  }, 60000);

  it('writes the name the way coaches go by it', () => {
    expect(coachTitle('Mike Smith')).toBe('Coach Mike Smith');
    expect(coachTitle('  Coach Taylor ')).toBe('Coach Taylor');
    expect(coachTitle('')).toBe('Coach');
  });

  it('maps a school prestige to a difficulty', () => {
    expect(difficultyForPrestige(99)).toBe('EASY');
    expect(difficultyForPrestige(84)).toBe('MEDIUM');
    expect(difficultyForPrestige(51)).toBe('HARD');
  });
});
