import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { generateWeeklyDilemma, executeDilemmaDecision, dilemmaChoiceEffects, DILEMMA_COOLDOWN_WEEKS } from '../dilemmaEngine';
import { TEMPLATES } from '../dilemmaTemplates';
import { DEPTH_TEMPLATE } from '../depthChart';
import { teamStarterRating } from '../macroSim';
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

    expect(seen.size).toBeGreaterThanOrEqual(40);
    expect(quietWeeks / weeks).toBeGreaterThan(0.2);
    expect(quietWeeks / weeks).toBeLessThan(0.6);
  });
});

describe('Dilemma library', () => {
  it('has 78 distinct scenarios, each well-formed and playable', () => {
    expect(TEMPLATES).toHaveLength(78);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(78);
    // In-game moments the weekly hub can't ask about during a game
    expect(TEMPLATES.map((t) => t.id)).not.toContain('LIGHTNING_DELAY');
    expect(TEMPLATES.map((t) => t.id)).not.toContain('RUNNING_UP_SCORE');

    const built = new Set<string>();
    for (let attempt = 0; attempt < 30 && built.size < TEMPLATES.length; attempt++) {
      for (const [i, team] of generateDistrictTeams().entries()) {
        if (i % 2 === 1) Object.assign(team.record, { wins: 1, losses: 4 }); // a losing season, for the sponsors' ultimatum
        for (let week = 1; week <= 20; week++) {
          TEMPLATES.forEach((t) => {
            const subject = t.appliesTo(team, week);
            if (subject === null) return;
            const d = t.build(team, week, subject === true ? undefined : subject);
            expect(d.title.length).toBeGreaterThan(0);
            expect(d.choices.length).toBeGreaterThanOrEqual(4);
            expect(new Set(d.choices.map((c) => c.id)).size).toBe(d.choices.length);
            expect(d.choices.some((c) => c.tier === 'GOOD')).toBe(true);
            if (d.involvedPlayerId) expect(team.roster.some((p) => p.id === d.involvedPlayerId)).toBe(true);
            built.add(t.id);
          });
        }
      }
    }
    expect([...TEMPLATES.map((t) => t.id)].filter((id) => !built.has(id))).toEqual([]);
  });

  it('offers Good, Compromise, Risky and Corrupt options, each with a visible gain and a visible loss', () => {
    const [team] = generateDistrictTeams();
    team.roster.slice(0, 3).forEach((p) => (p.academics.gpa = 2.1)); // the team-grades scenario needs players at risk
    const subject = team.roster.find((p) => p.depthChartTier === 1)!;
    TEMPLATES.forEach((t) => {
      const d = t.build(team, 10, subject);
      expect({ id: t.id, tiers: [...new Set(d.choices.map((c) => c.tier))].sort() }).toEqual({ id: t.id, tiers: ['COMPROMISE', 'CORRUPT', 'GOOD', 'RISKY'] });
      // What the card shows: the combined Rating, Coach Points, the Friday edge, and player effects (the meters stay hidden)
      d.choices.forEach((c) => {
        const fx = dilemmaChoiceEffects(c, team);
        const gain = fx.rating > 0 || fx.coachPoints > 0 || fx.fridayEdge > 0 || fx.gains.length > 0;
        const loss = fx.rating < 0 || fx.coachPoints < 0 || fx.fridayEdge < 0 || fx.losses.length > 0;
        expect({ option: `${t.id}/${c.id}`, gain, loss }).toEqual({ option: `${t.id}/${c.id}`, gain: true, loss: true });
      });
      // The worst option is tempting: a payoff beyond the Rating, and the most Coach Points on the card
      const worst = dilemmaChoiceEffects(d.choices.find((c) => c.tier === 'CORRUPT')!, team);
      expect({ id: t.id, payoff: worst.coachPoints > 0 || worst.fridayEdge > 0 || worst.gains.length > 0 }).toEqual({ id: t.id, payoff: true });
      const mostPoints = Math.max(...d.choices.map((c) => c.impact.coachPointsDelta ?? 0));
      expect({ id: t.id, points: worst.coachPoints }).toEqual({ id: t.id, points: mostPoints });
    });
  });

  it('every choice applies cleanly to a team', () => {
    TEMPLATES.forEach((t) => {
      const [team] = generateDistrictTeams();
      for (let week = 1; week <= 20; week++) {
        const subject = t.appliesTo(team, week);
        if (subject === null) continue;
        t.build(team, week, subject === true ? undefined : subject).choices.forEach((c) => {
          expect(() => executeDilemmaDecision(team, c)).not.toThrow();
        });
        break;
      }
    });
  });
});

describe('Dilemma consequences', () => {
  it('removes a player who leaves the program', () => {
    const [team] = generateDistrictTeams();
    const leaving = team.roster.find((p) => p.depthChartTier === 1 && p.position === 'RB')!;
    executeDilemmaDecision(team, choice({ removePlayerId: leaving.id }));
    expect(team.roster.some((p) => p.id === leaving.id)).toBe(false);
    expect(team.roster.filter((p) => p.position === 'RB' && p.depthChartTier === 1).length).toBeGreaterThan(0);
  });

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
    expect(starters).toHaveLength(DEPTH_TEMPLATE.WR.starters);
  });

  it('adds a transfer near the advertised rating and keeps the depth chart sorted', () => {
    const [team] = generateDistrictTeams();
    const before = team.roster.length;
    const existingIds = new Set(team.roster.map((p) => p.id));
    executeDilemmaDecision(team, choice({ addTransfer: { position: 'QB', overallRating: 82, name: 'Trey Hayes' } }));
    // Find the new player by id: a generated roster can already include someone named Hayes
    const transfer = team.roster.find((p) => !existingIds.has(p.id))!;
    expect(transfer.lastName).toBe('Hayes');
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

describe('Coach Points from dilemmas', () => {
  it('adds a booster thank-you and spends what an option costs, never below zero', () => {
    useGameStore.getState().startNewSeason();
    const resolve = (coachPointsDelta: number) => {
      useGameStore.setState({ activeDilemma: { id: 'd', title: 'Test', scenario: '', weekTriggered: 1, choices: [] } });
      useGameStore.getState().resolveDilemma(choice({ coachPointsDelta }));
    };
    useGameStore.setState({ coachPoints: 100 });
    resolve(40);
    expect(useGameStore.getState().coachPoints).toBe(140);
    resolve(-25);
    expect(useGameStore.getState().coachPoints).toBe(115);
    resolve(-500);
    expect(useGameStore.getState().coachPoints).toBe(0);
  });
});

describe('Friday edge from dilemmas', () => {
  it('adds to the next game’s rating and is used up when the coach plays', () => {
    useGameStore.getState().startNewSeason();
    const { userTeamId, seasonSchedule } = useGameStore.getState();
    const team = () => useGameStore.getState().districtTeams.find((t) => t.id === userTeamId)!;
    const before = teamStarterRating(team());
    executeDilemmaDecision(team(), choice({ fridayEdgeDelta: 2 }));
    expect(teamStarterRating(team())).toBeCloseTo(before + 2, 5);
    // Camp weeks keep it; the coach's first game uses it up
    const firstGame = Math.min(...seasonSchedule.filter((g) => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId).map((g) => g.week));
    useGameStore.setState({ currentWeek: firstGame - 1 });
    useGameStore.getState().advanceWeek();
    expect(team().fridayEdge).toBe(2);
    useGameStore.getState().advanceWeek();
    expect(team().fridayEdge ?? 0).toBe(0);
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

describe('Study hall through dilemmas', () => {
  it('raises GPAs and restores eligibility at 2.0', () => {
    const [team] = generateDistrictTeams();
    const [a, b] = team.roster;
    a.academics.gpa = 1.8;
    a.academics.isEligible = false;
    b.academics.gpa = 2.2;
    executeDilemmaDecision(team, choice({ gpaChanges: [{ playerId: a.id, amount: 0.4 }, { playerId: b.id, amount: 0.4 }] }));
    expect(a.academics.gpa).toBe(2.2);
    expect(a.academics.isEligible).toBe(true);
    expect(b.academics.gpa).toBe(2.6);
  });

  it('flags the roster when several players are close to failing, between report cards', () => {
    const [team] = generateDistrictTeams();
    const template = TEMPLATES.find((t) => t.id === 'TEAM_GRADES')!;
    team.roster.forEach((p) => (p.academics.gpa = 3.0));
    expect(template.appliesTo(team, 10)).toBeNull();
    team.roster.slice(0, 3).forEach((p) => (p.academics.gpa = 2.1));
    expect(template.appliesTo(team, 9)).toBeNull(); // report card week itself
    expect(template.appliesTo(team, 10)).toBe(true);
    expect(template.appliesTo(team, 4)).toBeNull(); // no midterms in pre season
    const studyHall = template.build(team, 10).choices.find((c) => c.id === 'opt_study_hall')!;
    expect(studyHall.impact.gpaChanges).toHaveLength(3);
  });
});
