import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LeaderboardEntry } from '../services/leaderboard';
import type { Career } from '../sim/careerScore';

// Twelve careers on one board, best first; the coach's own career is the 12th
const entries: LeaderboardEntry[] = Array.from({ length: 12 }, (_, i) => ({
  careerId: `c${i + 1}`,
  coachName: `Coach${i + 1}`,
  scenario: 'OPEN',
  state: 'Texas',
  startingSchool: 'Duncanville',
  startingProgram: 'Duncanville',
  length: 3,
  seasons: 3,
  wins: 30 - i,
  losses: i,
  playoffWins: 0,
  titles: 0,
  collegeSignees: 0,
  points: 1000 - i * 10,
  updatedAt: 0
}));
vi.mock('../utils/useHallOfFame', () => ({ useHallOfFame: () => entries }));

const { HallOfFameArcade } = await import('./HallOfFameBoard');
const board = (career: Career | null) => renderToStaticMarkup(React.createElement(HallOfFameArcade, { career, length: 3, onLength: () => undefined }));
const careerWithId = (id: string) => ({ id, length: 3, seasons: [] }) as unknown as Career;

describe('Hall of Fame board', () => {
  it('shows the top 10 careers of a length', () => {
    const html = board(null);
    expect(html).toContain('Coach1<');
    expect(html).toContain('Coach10<');
    expect(html).not.toContain('Coach11<');
    expect(html).not.toContain('Coach12<');
    expect(html).not.toContain('· · ·');
  });

  it("adds the coach's own career after the top 10, with its rank, when it ranks lower", () => {
    const html = board(careerWithId('c12'));
    expect(html).not.toContain('Coach11<');
    expect(html).toContain('· · ·');
    expect(html).toContain('12TH');
    expect(html).toContain('Coach12<');
  });

  it('adds nothing when the own career is already in the top 10', () => {
    const html = board(careerWithId('c4'));
    expect(html).not.toContain('· · ·');
    expect(html).not.toContain('Coach11<');
  });
});

describe('Invalid playthroughs', () => {
  // Coach2 and Coach5 had a shady call come to light
  const withReckonings = () => entries.forEach((e) => (e.reckonings = e.careerId === 'c2' || e.careerId === 'c5' ? (e.careerId === 'c2' ? 2 : 1) : 0));
  const clear = () => entries.forEach((e) => (e.reckonings = 0));

  it('are never ranked: the top 10 counts clean careers only, and the switch starts off', () => {
    withReckonings();
    localStorage.removeItem('fc.hofShowInvalid');
    const html = board(null);
    expect(html).not.toContain('Coach2<');
    expect(html).not.toContain('Coach5<');
    expect(html).toContain('Coach12<'); // the 10th clean career
    expect(html).toContain('INVALID PLAYTHROUGHS');
    expect(html).not.toContain('NOT RANKED</div>');
    clear();
  });

  it('show under the board, unranked, when the switch is on (remembered on the device)', () => {
    withReckonings();
    localStorage.setItem('fc.hofShowInvalid', '1');
    const html = board(null);
    expect(html).toContain('INVALID PLAYTHROUGHS · NOT RANKED');
    expect(html).toContain('Coach2<');
    expect(html).toContain('2 STRIKES');
    expect(html).toContain('1 STRIKE<');
    localStorage.removeItem('fc.hofShowInvalid');
    clear();
  });

  it("tell the coach when their own career is one, with the switch off", () => {
    withReckonings();
    expect(board(careerWithId('c5'))).toContain('Your career has strikes');
    expect(board(careerWithId('c4'))).not.toContain('Your career has strikes');
    clear();
  });
});
