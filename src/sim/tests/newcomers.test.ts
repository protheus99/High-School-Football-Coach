import { describe, it, expect, vi } from 'vitest';
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';
import type { DilemmaChoice } from '../../types/game';

const store = useGameStore;
const userTeam = () => store.getState().leagueTeams.find((t) => t.id === store.getState().userTeamId)!;

describe('Newcomers on the roster', () => {
  it('marks everyone who joins at signing day with this year; returning players stay unmarked', () => {
    store.getState().newGame('MEDIUM', 'Texas');
    store.setState({ feederClassYear: store.getState().currentYear }); // a signing day this season
    const returning = new Set(userTeam().roster.map((p) => p.id));
    store.getState().runFeederSigningDay();
    const year = store.getState().currentYear;
    userTeam().roster.forEach((p) => expect(p.joinedYear).toBe(returning.has(p.id) ? undefined : year));
  }, 60000);

  it('marks a transfer who joins through a decision', () => {
    store.getState().newGame('MEDIUM', 'Texas');
    const before = new Set(userTeam().roster.map((p) => p.id));
    const choice: DilemmaChoice = {
      id: 'opt_transfer',
      label: 'Accept the transfer',
      description: '',
      tier: 'GOOD',
      impact: { schoolBoardTrustDelta: 0, boosterApprovalDelta: 0, lockerRoomDisciplineDelta: 0, complianceScoreDelta: 0, addTransfer: { position: 'LB', overallRating: 70, name: 'Bennett Ross' } }
    };
    store.setState({ activeDilemma: { id: 'd', title: 'Transfer', scenario: '', weekTriggered: 1, choices: [choice] } });
    store.getState().resolveDilemma(choice);
    const joined = userTeam().roster.filter((p) => !before.has(p.id));
    expect(joined).toHaveLength(1);
    expect(joined[0].joinedYear).toBe(store.getState().currentYear);
  }, 60000);
});
