import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Career } from '../sim/careerScore';

vi.mock('../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
// The board as it stands: this career and one better one, both ranked
vi.mock('../utils/useHallOfFame', () => ({
  useHallOfFame: () => [
    { careerId: 'other', points: 500, reckonings: 0 },
    { careerId: 'mine', points: 86, reckonings: 0 }
  ]
}));
const { FiredScreen } = await import('./FiredScreen');

const career = (reckonings: Career['reckonings'] = []): Career => ({
  id: 'mine',
  coachName: 'Morgan',
  scenario: 'OPEN',
  state: 'Texas',
  startingSchool: 'Odessa Permian',
  startingProgram: 'Odessa Permian',
  startedYear: 2026,
  length: 5,
  seasons: [{ year: 2026, school: 'Odessa Permian', wins: 9, losses: 3, playoffWins: 2, stateTitle: false, collegeSignees: 4, points: 68 }],
  reckonings
});
const screen = (misconduct: boolean, c: Career | null) =>
  renderToStaticMarkup(React.createElement(FiredScreen, { school: 'Odessa Permian', misconduct, career: c, onMainMenu: () => undefined }));
const strike = (invalidates: boolean) => ({ year: 2026, week: 10, title: 'Hazing Allegation', invalidates });

describe("YOU'RE FIRED", () => {
  it('fired at the 3rd strike: Billy Martin, the career and its strikes', () => {
    const html = screen(true, career([strike(false), strike(true), strike(true)]));
    expect(html).toContain('GAME OVER');
    expect(html).toContain('YOU&#x27;RE<br/>FIRED');
    expect(html).toContain('ODESSA PERMIAN SCHOOL BOARD');
    expect(html).toContain('Billy Martin was in the room');
    expect(html).toContain('3 STRIKES · INVALID PLAYTHROUGH');
    expect(html).toContain('RECORD <b');
    expect(html).toContain('HALL OF FAME');
  });

  it("fired by the board's review: the career's rank", () => {
    const html = screen(false, career([strike(false)]));
    expect(html).toContain("second straight season without the board&#x27;s confidence");
    expect(html).toContain('RANKED 2ND · 5-YEAR CAREERS');
    expect(html).not.toContain('STRIKE');
  });

  it('a quick game: only the words and the main menu', () => {
    const html = screen(false, null);
    expect(html).toContain('MAIN MENU');
    expect(html).not.toContain('YOUR CAREER');
    expect(html).not.toContain('HALL OF FAME');
  });
});
