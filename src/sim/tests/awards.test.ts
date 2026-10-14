import { describe, it, expect, vi } from 'vitest';
import { ALL_STATE_DEFENSE, ALL_STATE_OFFENSE, calculateSeasonAwards, honoredPlayers, statHeadline, topPerformers } from '../awardsEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { Team } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

/** A district whose players have a season of stats. */
function playedSeason(): Team[] {
  const teams = generateDistrictTeams();
  teams.forEach((t, ti) => {
    t.record = { ...t.record, wins: 10 - ti, losses: ti };
    t.roster.forEach((p, i) => {
      const r = (n: number) => Math.round(n * (0.5 + ((i * 7 + ti * 3) % 10) / 10));
      p.stats = { ...p.stats, gamesPlayed: 10, passYards: r(2500), passTDs: r(25), interceptionsThrown: r(8), rushYards: r(1200), rushTDs: r(12), receivingYards: r(900), receivingTDs: r(9), receptions: r(50), tackles: r(90), tacklesForLoss: r(10), sacks: r(8), interceptionsCaught: r(3), fieldGoalsAttempted: 15, fieldGoalsMade: r(12) };
    });
  });
  return teams;
}

describe('All-State honors', () => {
  const teams = playedSeason();
  const awards = calculateSeasonAwards(2026, teams);

  it('gives the three major awards to three different players', () => {
    const ids = [awards.mrFootballStateMVP, awards.offensivePlayerOfTheYear, awards.defensivePlayerOfTheYear].map((w) => w.player.id);
    expect(new Set(ids).size).toBe(3);
    expect(['QB', 'RB', 'WR', 'TE']).toContain(awards.offensivePlayerOfTheYear.player.position);
    expect(['DE', 'DT', 'LB', 'CB', 'S']).toContain(awards.defensivePlayerOfTheYear.player.position);
  });

  it('names a full first team: 11 on offense, 12 on defense and specialists, each at his own position', () => {
    const count = (spots: [string, number][]) => spots.reduce((n, [, c]) => n + c, 0);
    expect(awards.allStateOffense).toHaveLength(count(ALL_STATE_OFFENSE));
    expect(awards.allStateDefense).toHaveLength(count(ALL_STATE_DEFENSE));
    expect(count(ALL_STATE_OFFENSE)).toBe(11);
    expect(count(ALL_STATE_DEFENSE)).toBe(12);
    awards.allStateFirstTeam.forEach((w) => expect(w.awardTitle).toBe(`All-State ${w.player.position}`));
    expect(new Set(awards.allStateFirstTeam.map((w) => w.player.id)).size).toBe(23);
  });

  it('lists the coach team best performers with where they ranked at their position', () => {
    const mine = topPerformers(teams[3], teams, awards);
    expect(mine).toHaveLength(3);
    mine.forEach((p) => {
      expect(p.positionRank).toBeGreaterThanOrEqual(1);
      expect(['OT', 'OG', 'C', 'P']).not.toContain(p.player.position);
    });
  });

  it('honors each player once', () => {
    const honored = honoredPlayers(awards);
    expect(new Set(honored.map((p) => p.id)).size).toBe(honored.length);
  });
});

describe('Mr. Football across positions', () => {
  /** Every player's stats cleared, then a few lines set by hand. */
  const quietSeason = () => {
    const teams = playedSeason();
    teams.forEach((t) => t.roster.forEach((p) => (p.stats = { ...p.stats, passYards: 0, passTDs: 0, interceptionsThrown: 0, rushYards: 0, rushTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, tackles: 0, tacklesForLoss: 0, sacks: 0, interceptionsCaught: 0 })));
    teams.forEach((t) => (t.record = { ...t.record, wins: 9, losses: 1 }));
    const at = (pos: string, team = 0) => teams[team].roster.find((p) => p.position === pos)!;
    return { teams, at };
  };

  it('goes to a typical leading rusher over a typical leading passer', () => {
    const { teams, at } = quietSeason();
    Object.assign(at('RB').stats, { rushYards: 2200, rushTDs: 30, receivingYards: 370, receivingTDs: 4 });
    Object.assign(at('QB', 1).stats, { passYards: 3300, passTDs: 38, interceptionsThrown: 8, rushYards: 350, rushTDs: 5 });
    expect(calculateSeasonAwards(2026, teams).mrFootballStateMVP.player.position).toBe('RB');
  });

  it('goes to a truly exceptional quarterback or receiver', () => {
    const qb = quietSeason();
    Object.assign(qb.at('RB').stats, { rushYards: 2200, rushTDs: 30, receivingYards: 370, receivingTDs: 4 });
    Object.assign(qb.at('QB', 1).stats, { passYards: 4300, passTDs: 52, interceptionsThrown: 6, rushYards: 600, rushTDs: 8 });
    expect(calculateSeasonAwards(2026, qb.teams).mrFootballStateMVP.player.position).toBe('QB');
    const wr = quietSeason();
    Object.assign(wr.at('RB').stats, { rushYards: 2200, rushTDs: 30, receivingYards: 370, receivingTDs: 4 });
    Object.assign(wr.at('WR', 1).stats, { receivingYards: 1900, receivingTDs: 26, receptions: 95 });
    expect(calculateSeasonAwards(2026, wr.teams).mrFootballStateMVP.player.position).toBe('WR');
  });

  it('shows everything the score counted on the card', () => {
    const { at } = quietSeason();
    const rb = at('RB');
    Object.assign(rb.stats, { rushYards: 1556, rushTDs: 15, receivingYards: 312, receivingTDs: 3 });
    expect(statHeadline(rb)).toBe('1,556 rush · 312 rec · 18 TD');
    const qb = at('QB');
    Object.assign(qb.stats, { passYards: 3012, passTDs: 30, interceptionsThrown: 6, rushYards: 412, rushTDs: 4 });
    expect(statHeadline(qb)).toBe('3,012 pass · 412 rush · 34 TD · 6 INT');
    const wr = at('WR');
    Object.assign(wr.stats, { receivingYards: 1240, receivingTDs: 14, receptions: 68 });
    expect(statHeadline(wr)).toBe('1,240 yds · 68 catches · 14 TD');
    const lb = at('LB');
    Object.assign(lb.stats, { tackles: 140, tacklesForLoss: 18, sacks: 6, interceptionsCaught: 2 });
    expect(statHeadline(lb)).toBe('140 tkl · 18 TFL · 6 sacks · 2 INT');
  });
});

describe('The banquet', () => {
  it('decides the honors once and gives every honored player +1 college exposure', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM');
    let guard = 0;
    while (!store.getState().isBanquetActive && guard++ < 40) {
      const s = store.getState();
      if (s.activeDilemma) s.resolveDilemma(s.activeDilemma.choices[0]);
      else s.advanceWeek();
    }
    const { seasonAwards } = store.getState();
    expect(seasonAwards).not.toBeNull();
    // Exposure starts at zero unless a game ball or the press added some; the honor adds one on top
    honoredPlayers(seasonAwards!).forEach((p) => expect(p.recruiting.exposure ?? 0).toBeGreaterThanOrEqual(1));
  }, 120000);
});
