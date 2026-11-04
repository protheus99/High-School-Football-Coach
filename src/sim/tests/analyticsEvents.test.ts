import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProspect } from '../feederEngine';
import { TALKS } from '../talks';
import { GameSimulationState, MisconductThread } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
vi.mock('../../services/analytics', async (original) => ({ ...(await original<typeof import('../../services/analytics')>()), track: vi.fn() }));
import { track } from '../../services/analytics';
import { useGameStore } from '../../store/gameStore';
import { packItem } from '../../services/ducats';
import { DUCAT_PACKS } from '../../data/ducats';

// ---------------------------------------------------------------------------
// The key game events carry the parameters docs/ANALYTICS.md lists (what was done, to whom, and with what result)
// ---------------------------------------------------------------------------

const sent = (event: string) => vi.mocked(track).mock.calls.filter(([name]) => name === event).map(([, params]) => params);
const store = () => useGameStore.getState();
const myTeam = () => store().districtTeams.find((t) => t.id === store().userTeamId)!;

beforeEach(() => {
  store().startNewSeason();
  useGameStore.setState({ currentWeek: 9, coachPoints: 5000, careerKey: null });
  vi.mocked(track).mockClear();
});

describe('Recruiting events', () => {
  it('say which contact it was, on whom, and how his interest and commitment moved', () => {
    const prospect = { ...createProspect('FEEDER_MIDDLE_SCHOOL', myTeam()), id: 'p_test', interestScore: 30, trueOverall: 64, truePotential: 'B' as const, suitors: [] };
    useGameStore.setState({ scoutingPool: [prospect] });
    store().contactFeederProspect('p_test', 'CALL');
    const [contact] = sent('prospect_contact');
    expect(contact).toMatchObject({
      method: 'CALL',
      cost: 20,
      position: prospect.projectedPosition,
      source: 'FEEDER_MIDDLE_SCHOOL',
      pool: 'DISTRICT',
      rating_band: '60s',
      potential: 'B',
      rank_band: 'top10',
      interest_band: 'lukewarm',
      interest_before: 30,
      commit_before: 'none',
      commit_after: 'none',
      season: 1,
      week: 9,
      phase: 'NON_DISTRICT'
    });
    expect(contact!.interest_after).toBeGreaterThan(30);
    expect(JSON.stringify(contact)).not.toContain(prospect.name); // never a name
  });

  it("report a program's results: interest gained, prospects found and Coach Points left", () => {
    useGameStore.setState({ currentWeek: 3 });
    expect(store().runFeederEvent('YOUTH_CLINIC')).not.toBeNull();
    const [run] = sent('program_run');
    expect(run).toMatchObject({ program: 'YOUTH_CLINIC', phase: expect.any(String), points_left: '300+' });
    expect(run).toHaveProperty('interest_gain');
    expect(run).toHaveProperty('committed');
    expect(run).toHaveProperty('pool_size');
  });

  it("tell a college senior's list from the prospects'", () => {
    const senior = myTeam().roster[0];
    store().toggleShortlist(senior.id);
    expect(sent('my_list')[0]).toMatchObject({ list: 'college', added: true, position: senior.position });
  });
});

describe('Dilemma and Billy Martin events', () => {
  const choice = { id: 'opt_risky', label: 'Let It Go', description: '', tier: 'RISKY' as const, impact: { schoolBoardTrustDelta: 0, boosterApprovalDelta: 0, lockerRoomDisciplineDelta: 0, complianceScoreDelta: 0 } };

  it('carry the severity, the choice and whether the call will come back', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0); // the warning thread starts
    useGameStore.setState({ activeDilemma: { id: 'd', templateId: 'SKIPPED_PRACTICE', title: 'Star Skips Practice', scenario: '', weekTriggered: 9, choices: [choice] } });
    store().resolveDilemma(choice);
    vi.mocked(Math.random).mockRestore();
    expect(sent('dilemma_choice')[0]).toMatchObject({ dilemma: 'SKIPPED_PRACTICE', tier: 'RISKY', choice: 'opt_risky', severity: 'MINOR', warning_started: true, week: 9 });
  });

  it('send a reckoning with its penalty and the call it came from', () => {
    const thread: MisconductThread = { id: 'bm_t', templateId: 'SKIPPED_PRACTICE', title: 'Star Skips Practice', severity: 'MAJOR', year: 2026, week: 5, step: 3, weeksLeft: 0 };
    store().applyReckoning('SEASON', thread);
    expect(sent('misconduct_reckoning')[0]).toMatchObject({ reckoning: 'SEASON', severity: 'MAJOR', dilemma: 'SKIPPED_PRACTICE', reckonings: 1 });
  });
});

describe('Grade, depth chart and game events', () => {
  it('send a grade fix booked and cancelled, with the player it was for', () => {
    const player = myTeam().roster.find((p) => p.depthChartTier === 1)!;
    Object.assign(player.academics, { gpa: 1.8, isEligible: true });
    store().bookGradeFix(player.id, 'TUTOR');
    store().bookGradeFix(player.id, 'TUTOR');
    const [booked, cancelled] = sent('grade_fix');
    expect(booked).toMatchObject({ fix: 'TUTOR', action: 'book', cost: 60, position: player.position, starter: true, gpa_band: '1.5-1.9', eligible: true });
    expect(booked!.weeks_to_report_card).toBeGreaterThan(0);
    expect(cancelled).toMatchObject({ fix: 'TUTOR', action: 'cancel' });
  });

  it('send a string change on the depth chart', () => {
    const player = myTeam().roster.find((p) => p.depthChartTier === 1)!;
    store().updatePlayerTier(player.id, 2);
    expect(sent('depth_change')[0]).toMatchObject({ how: 'string', position: player.position, tier_from: 1, tier_to: 2 });
  });

  it("send a live game's speeches, setting and context with its result", () => {
    const { userTeamId, seasonSchedule } = store();
    const game = seasonSchedule.find((g) => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId)!;
    useGameStore.setState({ currentWeek: game.week });
    const team = (id: string) => store().leagueTeams.find((t) => t.id === id)!;
    const talk = TALKS.find((t) => t.phase === 'PRE')!;
    const home = game.homeTeamId === userTeamId;
    const finalState = {
      homeTeam: team(game.homeTeamId),
      awayTeam: team(game.awayTeamId),
      homeScore: home ? 28 : 14,
      awayScore: home ? 14 : 28,
      pregameTalks: { [userTeamId]: talk.id },
      secondStringLead: { [userTeamId]: null }
    } as unknown as GameSimulationState;
    store().markGameFinal(finalState);
    expect(sent('game_played')[0]).toMatchObject({
      mode: 'live',
      result: 'win',
      margin: 14,
      home,
      playoff: false,
      rivalry: expect.any(Boolean),
      pregame_family: talk.family,
      halftime_family: 'none',
      second_string: 'never',
      sim_ahead: expect.any(String)
    });
  });

  it('list a ducat pack the way GA4 reports expect', () => {
    expect(packItem(DUCAT_PACKS[1])).toEqual({ item_id: 'P5', item_name: '550 ducats', price: 5, quantity: 1 });
  });
});
