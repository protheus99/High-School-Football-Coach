// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RankingsView } from './RankingsView';
import type { RankedTeamEntry, StateAndNationalPolls } from '../types/game';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (rank: number, teamName: string, mascot: string, state: string, previousRank: number | null, firstPlaceVotes = 0): RankedTeamEntry => ({
  rank,
  previousRank,
  movement: previousRank === null ? 'NEW_ENTRY' : previousRank > rank ? 'UP' : previousRank < rank ? 'DOWN' : 'UNCHANGED',
  movementDelta: previousRank === null ? 0 : Math.abs(previousRank - rank),
  teamId: teamName,
  teamName,
  mascot,
  state,
  classification: '6A',
  record: { wins: 8, losses: 1 },
  pollPoints: 0,
  strengthOfSchedule: 0,
  firstPlaceVotes,
  qualityWinsCount: 0
});

const week9: StateAndNationalPolls = {
  week: 9,
  nationalTop25: [
    entry(1, 'St. Thomas Aquinas', 'Raiders', 'Florida', 2, 31),
    entry(2, 'Grayson', 'Rams', 'Georgia', 1, 18),
    entry(3, 'IMG Academy', 'Ascenders', 'Florida', 3),
    entry(4, 'Cincinnati Archbishop Moeller', 'Crusaders', 'Ohio', null)
  ],
  stateRankings: { Georgia: [entry(1, 'Grayson', 'Rams', 'Georgia', 1, 22), entry(2, 'Collins Hill', 'Eagles', 'Georgia', null), entry(3, 'Buford', 'Wolves', 'Georgia', 4)] },
  bubbleTeams: []
};

function show(polls: StateAndNationalPolls) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(RankingsView, { polls, userTeamId: 'none' })));
  // the phone list (the wide table repeats the rows)
  const rows = () => [...host.querySelectorAll('.ui-standings .ui-standings-row')].map((r) => (r as HTMLElement).textContent ?? '');
  const pick = (label: string) => act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === label)!.click());
  return { host, rows, pick };
}

describe('the polls: one line per team', () => {
  it('national: the school and its state, the move after it, the first place votes; no mascot, no NEW tag', () => {
    const { host, rows } = show(week9);
    expect(host.querySelector('h3')?.textContent).toBe('National Top 25 - Week 9 rankings');
    const [aquinas, grayson, img, moeller] = rows();
    expect(aquinas).toBe('1St. Thomas Aquinas(FL)▲ 1(31)8-1');
    expect(grayson).toBe('2Grayson(GA)▼ 1(18)8-1');
    expect(img).toBe('3IMG Academy(FL)8-1'); // held its spot: no mark
    expect(moeller).toContain('(OH)new');
    expect(host.textContent).not.toContain('Raiders');
    expect(host.textContent).not.toContain('NEW');
  });

  it("a state's poll drops the state: every team is from that state", () => {
    const { host, rows, pick } = show(week9);
    pick('Georgia');
    expect(host.querySelector('h3')?.textContent).toBe('Georgia Top 25 - Week 9 rankings');
    expect(rows()).toEqual(['1Grayson(22)8-1', '2Collins Hillnew8-1', '3Buford▲ 18-1']);
  });

  it('the first poll has nothing to compare with: no marks at all', () => {
    const first: StateAndNationalPolls = { ...week9, week: 1, nationalTop25: week9.nationalTop25.map((e) => ({ ...e, previousRank: null, movement: 'NEW_ENTRY', movementDelta: 0 })) };
    const { rows } = show(first);
    expect(rows().join(' ')).not.toMatch(/new|▲|▼/);
  });
});
