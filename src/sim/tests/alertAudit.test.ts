import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { simulateSnap } from '../matchEngine';
import { alertsForPlay, PlayAlertKind } from '../playAlerts';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GameSimulationState } from '../../types/game';
import { PlayAlert } from '../../components/PlayAlert';

function freshGame(): GameSimulationState {
  const [home, away] = generateDistrictTeams();
  return {
    gameId: 'audit',
    homeTeam: home,
    awayTeam: away,
    homeScore: 0,
    awayScore: 0,
    weather: 'CLEAR',
    temperatureFahrenheit: 70,
    windSpeedMph: 5,
    teamMomentum: 0,
    currentQuarter: 1,
    clockSecondsRemaining: 720,
    possessionTeamId: home.id,
    down: 1,
    distance: 10,
    yardLine: 25,
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: []
  };
}

describe('Every game alert, audited against what happened on the play', () => {
  it('fires the right banner for the right team, and nothing for routine plays', () => {
    const seen = new Map<PlayAlertKind, number>();
    for (let g = 0; g < 60; g++) {
      const state = freshGame();
      for (let snap = 0; snap < 500 && !state.isGameOver; snap++) {
        const before = { possessionTeamId: state.possessionTeamId, homeScore: state.homeScore, awayScore: state.awayScore, down: state.down, distance: state.distance };
        const offenseId = before.possessionTeamId;
        const defenseId = offenseId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
        const { event } = simulateSnap(state);
        const alerts = alertsForPlay(event, before, state);
        alerts.forEach((a) => seen.set(a.kind, (seen.get(a.kind) ?? 0) + 1));
        const kinds = alerts.map((a) => a.kind);
        const team = (k: PlayAlertKind) => alerts.find((a) => a.kind === k)!.team.id;
        const homeGain = state.homeScore - before.homeScore;
        const awayGain = state.awayScore - before.awayScore;
        const scorerId = homeGain > awayGain ? state.homeTeam.id : state.awayTeam.id;
        const text = event.textCommentary;

        // Scores: banner for touchdowns, field goals and safeties, credited to the team that scored, right points
        if (event.scoreType === 'TOUCHDOWN') {
          expect(kinds[0]).toBe('TOUCHDOWN');
          expect(team('TOUCHDOWN')).toBe(scorerId);
          expect(Math.max(homeGain, awayGain)).toBe(6);
        }
        if (event.scoreType === 'FIELD_GOAL') {
          expect(kinds[0]).toBe('FIELD_GOAL');
          expect(team('FIELD_GOAL')).toBe(scorerId);
        }
        if (event.scoreType === 'SAFETY') {
          expect(kinds[0]).toBe('SAFETY');
          expect(team('SAFETY')).toBe(scorerId);
        }
        // Tries get no banner of their own
        if (event.scoreType === 'PAT' || event.scoreType === 'TWO_POINT') expect(kinds.filter((k) => k !== 'FUMBLE')).toEqual([]);
        // A fumbled kickoff (after a score, a try, or at halftime) is a FUMBLE banner for the team that recovered
        const kickoffFumble = /FUMBLES the kickoff return/i.test(text);
        if (kickoffFumble) {
          const recoverer = [state.homeTeam, state.awayTeam].find((t) => text.includes(`${t.name} recovers!`))!;
          expect(alerts.some((a) => a.kind === 'FUMBLE' && a.team.id === recoverer.id)).toBe(true);
        }

        if (!event.isScore && !event.isTry) {
          if (event.turnoverType === 'INTERCEPTION') expect(team('INTERCEPTION')).toBe(defenseId);
          if (event.turnoverType === 'FUMBLE' && !kickoffFumble) expect(team('FUMBLE')).toBe(defenseId);
          if (event.turnoverType === 'MUFFED_PUNT') expect(team('FUMBLE')).toBe(offenseId);
          if (event.turnoverType === 'DOWNS' && event.playConcept !== 'FIELD_GOAL') expect(team('TURNOVER_ON_DOWNS')).toBe(defenseId);
          // Missed and blocked field goals say so (the engine records them as a turnover on downs)
          if (event.playConcept === 'FIELD_GOAL' && event.turnoverType === 'DOWNS') {
            expect(kinds).toEqual([/BLOCKED/i.test(text) ? 'FG_BLOCKED' : 'FG_MISSED']);
            expect(alerts[0].team.id).toBe(defenseId);
          }
          if (event.playConcept === 'PUNT' && !event.isTurnover) {
            expect(kinds[0]).toBe('PUNT');
            expect(team('PUNT')).toBe(defenseId);
          }
          if (/FIRST DOWN/i.test(text) && !event.isTurnover) {
            expect(kinds[0]).toBe('FIRST_DOWN');
            expect(team('FIRST_DOWN')).toBe(offenseId);
          }
          // Routine plays stay quiet
          if (!event.isTurnover && event.playConcept !== 'PUNT' && !/FIRST DOWN/i.test(text) && event.yardsGained < before.distance)
            expect(kinds.filter((k) => !(k === 'FUMBLE' && kickoffFumble))).toEqual([]);
        }
      }
    }
    // Every common banner shows up across 60 games (safeties are too rare to require)
    (['FIRST_DOWN', 'TOUCHDOWN', 'INTERCEPTION', 'FUMBLE', 'FIELD_GOAL', 'FG_MISSED', 'TURNOVER_ON_DOWNS', 'PUNT'] as PlayAlertKind[]).forEach((k) =>
      expect(seen.get(k) ?? 0, k).toBeGreaterThan(0)
    );
  }, 60000);

  it('renders every banner with its headline, size and good/bad color for your team', () => {
    const [mine, theirs] = generateDistrictTeams();
    const render = (kind: PlayAlertKind, team: typeof mine) =>
      renderToStaticMarkup(React.createElement(PlayAlert, { alert: { id: kind, kind, team }, userTeamId: mine.id, onDone: () => undefined }));
    const cases: [PlayAlertKind, string, string][] = [
      ['FIRST_DOWN', 'FIRST DOWN!', 'play-alert'],
      ['TOUCHDOWN', 'TOUCHDOWN!', 'play-alert-big'],
      ['INTERCEPTION', 'INTERCEPTION!', 'play-alert'],
      ['FIELD_GOAL', 'IT&#x27;S GOOD!', 'play-alert'],
      ['FG_MISSED', 'NO GOOD!', 'play-alert-small'],
      ['FG_BLOCKED', 'BLOCKED!', 'play-alert'],
      ['SAFETY', 'SAFETY!', 'play-alert'],
      ['TURNOVER_ON_DOWNS', 'TURNOVER!', 'play-alert'],
      ['PUNT', 'PUNT', 'play-alert-small']
    ];
    cases.forEach(([kind, label, cls]) => {
      const html = render(kind, mine);
      expect(html, kind).toContain(label);
      expect(html, kind).toContain(cls);
      expect(html, kind).toContain(mine.name);
    });
    expect(render('TURNOVER_ON_DOWNS', mine)).not.toContain('ON DOWNS');
    // Your team's moments are green, the opponent's are red, punts are neutral
    expect(render('TOUCHDOWN', mine)).toContain('play-alert-good');
    expect(render('TOUCHDOWN', theirs)).toContain('play-alert-bad');
    expect(render('INTERCEPTION', theirs)).toContain('play-alert-bad'); // they picked you off
    expect(render('INTERCEPTION', mine)).toContain('play-alert-good'); // you picked them off
    expect(render('PUNT', mine)).toContain('play-alert-neutral');
    // A fumble is only bad when you lose it
    expect(render('FUMBLE', mine)).toContain('FUMBLE RECOVERED!');
    expect(render('FUMBLE', mine)).toContain('play-alert-good');
    expect(render('FUMBLE', theirs)).toContain('FUMBLE LOST!');
    expect(render('FUMBLE', theirs)).toContain('play-alert-bad');
  });
});
