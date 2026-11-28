import { describe, it, expect, vi } from 'vitest';
import { difficultyForPrestige, stateSchool } from '../league';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { coachTitle, useGameStore } from '../../store/gameStore';

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
