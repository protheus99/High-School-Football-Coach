import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { generateWeeklyDilemma, executeDilemmaDecision, DILEMMA_COOLDOWN_WEEKS } from '../dilemmaEngine';
import { DilemmaChoice } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

const choice = (impact: Partial<DilemmaChoice['impact']>): DilemmaChoice => ({
  id: 'c',
  label: 'Test',
  description: '',
  tier: 'GOOD',
  impact: { schoolBoardTrustDelta: 0, boosterApprovalDelta: 0, lockerRoomDisciplineDelta: 0, complianceScoreDelta: 0, ...impact }
});

describe('Weekly dilemma selection', () => {
  it('offers a variety of scenarios, skips some weeks and honors the cooldown', () => {
    const seen = new Set<string>();
    let weeks = 0;
    let quietWeeks = 0;

    for (let season = 0; season < 40; season++) {
      const [team] = generateDistrictTeams();
      const history: { id: string; week: number }[] = [];
      for (let week = 2; week <= 18; week++) {
        weeks++;
        const recent = history.filter((h) => week - h.week < DILEMMA_COOLDOWN_WEEKS).map((h) => h.id);
        const dilemma = generateWeeklyDilemma(week, team, recent);
        if (!dilemma) {
          quietWeeks++;
          continue;
        }
        expect(recent).not.toContain(dilemma.templateId);
        expect(dilemma.choices.length).toBeGreaterThanOrEqual(3);
        seen.add(dilemma.templateId!);
        history.push({ id: dilemma.templateId!, week });
      }
    }

    expect(seen.size).toBeGreaterThanOrEqual(7);
    expect(quietWeeks / weeks).toBeGreaterThan(0.2);
    expect(quietWeeks / weeks).toBeLessThan(0.6);
  });
});

describe('Dilemma consequences', () => {
  it('sidelines a player for the protocol period', () => {
    const [team] = generateDistrictTeams();
    const player = team.roster[0];
    executeDilemmaDecision(team, choice({ sidelinePlayer: { playerId: player.id, weeks: 2 } }));
    expect(player.condition.injuryStatus).not.toBe('HEALTHY');
    expect(player.condition.injuryWeeksRemaining).toBe(2);
  });

  it('promotes a backup and demotes the weakest starter at his position', () => {
    const [team] = generateDistrictTeams();
    const backup = team.roster.find((p) => p.position === 'WR' && p.depthChartTier === 2)!;
    executeDilemmaDecision(team, choice({ promoteToStarterPlayerId: backup.id }));
    const starters = team.roster.filter((p) => p.position === 'WR' && p.depthChartTier === 1);
    expect(backup.depthChartTier).toBe(1);
    expect(starters).toHaveLength(2);
  });

  it('adds a transfer near the advertised rating and keeps the depth chart sorted', () => {
    const [team] = generateDistrictTeams();
    const before = team.roster.length;
    executeDilemmaDecision(team, choice({ addTransfer: { position: 'QB', overallRating: 82, name: 'Trey Hayes' } }));
    const transfer = team.roster.find((p) => p.lastName === 'Hayes')!;
    expect(team.roster).toHaveLength(before + 1);
    expect(Math.abs(transfer.overallRating - 82)).toBeLessThanOrEqual(2);
    const qbs = team.roster.filter((p) => p.position === 'QB').sort((a, b) => b.overallRating - a.overallRating);
    expect(qbs[0].depthChartTier).toBe(1);
  });

  it('clamps program meters to 0-100', () => {
    const [team] = generateDistrictTeams();
    executeDilemmaDecision(team, choice({ complianceScoreDelta: -500, boosterApprovalDelta: 500 }));
    expect(team.programMeters.complianceScore).toBe(0);
    expect(team.programMeters.boosterApproval).toBe(100);
  });
});

describe('Whistleblower exposure', () => {
  it('applies penalties and runs a news story in the exposure week', () => {
    const store = useGameStore.getState();
    store.startNewSeason();
    const { userTeamId, currentYear } = useGameStore.getState();
    useGameStore.setState({
      currentWeek: 6,
      dilemmaLog: [{ templateId: 'FILM_ROOM_GIFT', title: "Booster's Film Room Offer", year: currentYear, week: 5, tier: 'CORRUPT', exposureWeek: 7 }]
    });
    const team = () => useGameStore.getState().districtTeams.find((t) => t.id === userTeamId)!;
    const complianceBefore = team().programMeters.complianceScore;

    useGameStore.getState().advanceWeek();

    expect(team().programMeters.complianceScore).toBe(Math.max(0, complianceBefore - 15));
    expect(useGameStore.getState().newsArticles.some((a) => a.headline.includes('Inquiry'))).toBe(true);
  });
});
